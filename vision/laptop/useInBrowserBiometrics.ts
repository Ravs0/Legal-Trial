// ─────────────────────────────────────────────────────────────────────────────
// useInBrowserBiometrics — the laptop path.
//
// Grabs frames from the live <video> element, extracts an averaged RGB sample
// per frame, and runs POS over a sliding window to recover a real BPM. On a
// slower cadence it runs HSEmotion (if the ONNX model is present) for emotions.
// Returns the same BiometricReading shape as the simulated hook so it drops in.
//
// Per-frame work is light (one drawImage + one getImageData average); POS runs
// only every ~500ms over the windowed buffer. Emotion inference runs every
// ~1500ms because EffNet-B0 is the expensive call.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import type { BiometricReading, RgbSample } from '../shared/types';
import { NEUTRAL_EMOTIONS, type EmotionSet } from '../shared/emotion-keys';
import { posEstimate, DEFAULT_FPS } from '../shared/pos';
import { extractRoiSample, captureFaceCrop } from '../shared/roi';
import { getHsemotionSession, inferEmotions } from './hsemotion.session';

const POS_INTERVAL_MS = 500;        // recompute BPM ~2x/sec
const EMOTION_INTERVAL_MS = 1500;   // EffNet-B0 is heavy; ~0.6 Hz is plenty
const BUFFER_SEC = 10;              // keep ~10s of samples; POS uses a 5s window

interface HookState {
  reading: BiometricReading;
  sessionReady: boolean;   // is HSEmotion loaded? (for UI status)
}

export function useInBrowserBiometrics(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  coherence: number,
  enabled: boolean,
): HookState {
  const [reading, setReading] = useState<BiometricReading>({
    bpm: null,
    pupilMm: null,
    coherence,
    emotions: { ...NEUTRAL_EMOTIONS },
    cameraOn: false,
  });
  const [sessionReady, setSessionReady] = useState(false);

  const samplesRef = useRef<RgbSample[]>([]);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const lastBpmRef = useRef<number | null>(null);
  const lastEmotionRef = useRef<EmotionSet>({ ...NEUTRAL_EMOTIONS });
  const lastPosAtRef = useRef(0);
  const lastEmotionAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const waitRef = useRef<number | null>(null);
  // Track sessionReady inside the rAF loop without restarting the loop.
  const sessionReadyRef = useRef(false);

  // Prime the HSEmotion session once when enabled.
  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setSessionReady(false);
      sessionReadyRef.current = false;
      return;
    }
    getHsemotionSession().then((s) => {
      if (!cancelled) {
        const ready = s !== null;
        sessionReadyRef.current = ready;
        setSessionReady(ready);
      }
    });
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setReading((prev) => ({
        ...prev,
        bpm: null,
        pupilMm: null,
        emotions: { ...NEUTRAL_EMOTIONS },
        cameraOn: false,
      }));
      lastBpmRef.current = null;
      samplesRef.current = [];
      return;
    }

    samplesRef.current = [];
    if (!scratchRef.current) {
      scratchRef.current = document.createElement('canvas');
    }
    const scratch = scratchRef.current;
    let cancelled = false;

    const cleanup = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (waitRef.current !== null) {
        cancelAnimationFrame(waitRef.current);
        waitRef.current = null;
      }
    };

    const loop = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video) {
        // Ref can briefly be null when the host remounts video nodes.
        waitRef.current = requestAnimationFrame(loop);
        return;
      }

      const now = performance.now();

      // 1. Always grab one RGB sample this frame (no-op until video has dims).
      const sample = extractRoiSample(video, scratch, now);
      if (sample) {
        const buf = samplesRef.current;
        buf.push(sample);
        const maxLen = Math.ceil(BUFFER_SEC * DEFAULT_FPS);
        if (buf.length > maxLen) buf.splice(0, buf.length - maxLen);
      }

      // 2. POS estimation on a timer.
      if (now - lastPosAtRef.current >= POS_INTERVAL_MS) {
        lastPosAtRef.current = now;
        const res = posEstimate(samplesRef.current);
        if (res.bpm !== null) {
          lastBpmRef.current = res.bpm;
        }
        const bpm = res.bpm ?? lastBpmRef.current;
        setReading((prev) => ({ ...prev, bpm, cameraOn: true }));
      }

      // 3. HSEmotion on a slower timer (only if session is loaded).
      if (
        sessionReadyRef.current &&
        now - lastEmotionAtRef.current >= EMOTION_INTERVAL_MS
      ) {
        lastEmotionAtRef.current = now;
        const crop = captureFaceCrop(video, scratch);
        if (crop) {
          getHsemotionSession().then(async (session) => {
            if (!session || cancelled) return;
            try {
              const emotions = await inferEmotions(session, crop);
              lastEmotionRef.current = emotions;
              setReading((prev) => ({ ...prev, emotions }));
            } catch (err) {
              console.warn('[hsemotion] inference failed:', err);
            }
          });
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cleanup();
    };
    // sessionReady is read via ref so model load does not restart the rAF loop.
  }, [videoRef, enabled]);

  // Reflect coherence into the reading whenever it changes upstream.
  useEffect(() => {
    setReading((prev) => ({ ...prev, coherence, cameraOn: enabled }));
  }, [coherence, enabled]);

  return { reading, sessionReady };
}
