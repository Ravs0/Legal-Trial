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
): HookState {
  const [reading, setReading] = useState<BiometricReading>({
    bpm: null,
    pupilMm: null,
    coherence,
    emotions: { ...NEUTRAL_EMOTIONS },
    cameraOn: true,
  });
  const [sessionReady, setSessionReady] = useState(false);

  const samplesRef = useRef<RgbSample[]>([]);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const lastBpmRef = useRef<number | null>(null);
  const lastEmotionRef = useRef<EmotionSet>({ ...NEUTRAL_EMOTIONS });
  const lastPosAtRef = useRef(0);
  const lastEmotionAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Prime the HSEmotion session once.
  useEffect(() => {
    let cancelled = false;
    getHsemotionSession().then((s) => {
      if (!cancelled) setSessionReady(s !== null);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Reset buffer when the hook mounts fresh.
    samplesRef.current = [];
    if (!scratchRef.current) {
      scratchRef.current = document.createElement('canvas');
    }
    const scratch = scratchRef.current;
    const video = videoRef.current;
    if (!video) return;

    const loop = () => {
      const now = performance.now();

      // 1. Always grab one RGB sample this frame.
      const sample = extractRoiSample(video, scratch, now);
      if (sample) {
        const buf = samplesRef.current;
        buf.push(sample);
        // Trim to BUFFER_SEC.
        const maxLen = Math.ceil(BUFFER_SEC * DEFAULT_FPS);
        if (buf.length > maxLen) buf.splice(0, buf.length - maxLen);
      }

      // 2. POS estimation on a timer.
      if (now - lastPosAtRef.current >= POS_INTERVAL_MS) {
        lastPosAtRef.current = now;
        const res = posEstimate(samplesRef.current);
        // Hold the last good BPM for a short grace period so the UI doesn't
        // flicker to null between confident windows.
        if (res.bpm !== null) {
          lastBpmRef.current = res.bpm;
        }
        const bpm = res.bpm ?? lastBpmRef.current;
        setReading((prev) => ({ ...prev, bpm }));
      }

      // 3. HSEmotion on a slower timer (only if session is loaded).
      if (
        sessionReady &&
        now - lastEmotionAtRef.current >= EMOTION_INTERVAL_MS
      ) {
        lastEmotionAtRef.current = now;
        const crop = captureFaceCrop(video, scratch);
        if (crop) {
          getHsemotionSession().then(async (session) => {
            if (!session) return;
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
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [videoRef, sessionReady]);

  // Reflect coherence into the reading whenever it changes upstream.
  useEffect(() => {
    setReading((prev) => ({ ...prev, coherence }));
  }, [coherence]);

  return { reading, sessionReady };
}
