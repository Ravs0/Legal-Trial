// ─────────────────────────────────────────────────────────────────────────────
// useStreamedBiometrics — the phone path.
//
// Mobile CPUs can't run EfficientNet-B0 at interactive framerates, so the phone
// does the cheap part (downsample a face crop) and ships frames to the Python
// backend over WebSocket. The backend runs POS + HSEmotion and sends back
// {bpm, emotions}. This keeps the phone cool and the model warm on a real host.
//
// Frames are JPEG-encoded at low quality (~40) and downscaled (96x96) to keep
// bandwidth tiny — we only need an averaged RGB triplet for POS and a rough
// face crop for HSEmotion. ~2 frames/sec is plenty.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import type { BiometricReading, BiometricWireUpdate } from '../shared/types';
import {
  NEUTRAL_EMOTIONS,
  AFFECTNET_CLASS_ORDER,
  normalizeEmotions,
  type EmotionSet,
} from '../shared/emotion-keys';

// Configure this per README. Default points at localhost for desktop testing;
// on a real phone it must be your laptop's LAN IP (e.g. ws://192.168.1.5:8787).
const WS_URL =
  (typeof window !== 'undefined' &&
    (window as unknown as { __BIO_WS_URL__?: string }).__BIO_WS_URL__) ||
  'ws://localhost:8787';

const FRAME_INTERVAL_MS = 500;  // ~2 fps uplink
const CROP_SIZE = 96;           // small — POS averages, HSEmotion upsamples
const JPEG_QUALITY = 0.4;

interface HookState {
  reading: BiometricReading;
  connected: boolean;
}

export function useStreamedBiometrics(
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
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const lastBpmRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!scratchRef.current) scratchRef.current = document.createElement('canvas');
    const scratch = scratchRef.current;
    scratch.width = CROP_SIZE;
    scratch.height = CROP_SIZE;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });

    // --- connect ---
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      console.warn('[bio-stream] could not open WebSocket:', err);
      return;
    }
    wsRef.current = ws;
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      // Backend pushes {bpm, emotions, ...} JSON updates.
      try {
        const data = JSON.parse(
          typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data),
        ) as BiometricWireUpdate;
        if (typeof data.bpm === 'number') lastBpmRef.current = data.bpm;
        const emotions = wireToEmotionSet(data.emotions);
        setReading((prev) => ({
          ...prev,
          bpm: data.bpm ?? lastBpmRef.current,
          pupilMm: data.pupilMm ?? null,
          emotions,
        }));
      } catch (err) {
        console.warn('[bio-stream] bad update:', err);
      }
    };

    // --- uplink loop: capture + JPEG + send, throttled ---
    const loop = () => {
      const now = performance.now();
      if (ws.readyState === WebSocket.OPEN && now - lastFrameAtRef.current >= FRAME_INTERVAL_MS) {
        lastFrameAtRef.current = now;
        if (ctx && video.videoWidth) {
          const side = Math.min(video.videoWidth, video.videoHeight);
          const sx = (video.videoWidth - side) / 2;
          const sy = Math.max(0, (video.videoHeight - side) / 2 - side * 0.05);
          ctx.drawImage(video, sx, sy, side, side, 0, 0, CROP_SIZE, CROP_SIZE);
          scratch.toBlob(
            (blob) => {
              if (blob && ws.readyState === WebSocket.OPEN) {
                blob.arrayBuffer().then((buf) => ws.send(buf));
              }
            },
            'image/jpeg',
            JPEG_QUALITY,
          );
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      try { ws.close(); } catch { /* ignore */ }
    };
  }, [videoRef]);

  useEffect(() => {
    setReading((prev) => ({ ...prev, coherence }));
  }, [coherence]);

  return { reading, connected };
}

/** Convert the backend's AffectNet-order probability array to an EmotionSet. */
function wireToEmotionSet(probs: number[] | undefined): EmotionSet {
  if (!probs || probs.length === 0) return { ...NEUTRAL_EMOTIONS };
  const out = { ...NEUTRAL_EMOTIONS } as EmotionSet;
  for (let i = 0; i < AFFECTNET_CLASS_ORDER.length && i < probs.length; i++) {
    out[AFFECTNET_CLASS_ORDER[i]] = probs[i];
  }
  return normalizeEmotions(out);
}
