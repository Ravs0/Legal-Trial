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
//
// Remote biometric processing is opt-in. Frames never leave the device unless
// a deployment explicitly supplies a token-protected endpoint at build time.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import type { BiometricReading, BiometricWireUpdate } from '../shared/types';
import {
  NEUTRAL_EMOTIONS,
  AFFECTNET_CLASS_ORDER,
  normalizeEmotions,
  type EmotionSet,
} from '../shared/emotion-keys';

const WS_URL = import.meta.env.VITE_BIOMETRIC_WS_URL?.trim() || '';
const WS_TOKEN = import.meta.env.VITE_BIOMETRIC_WS_TOKEN?.trim() || '';

function isApprovedEndpoint(url: string) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const localDev = import.meta.env.DEV && parsed.protocol === 'ws:' &&
      ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    return parsed.protocol === 'wss:' || localDev;
  } catch {
    return false;
  }
}

/** Build-time gate: true only when URL+token are set and the URL is approved. */
export function isMobileBiometricsConfigured(): boolean {
  return Boolean(WS_TOKEN && isApprovedEndpoint(WS_URL));
}

const FRAME_INTERVAL_MS = 500;  // ~2 fps uplink
const CROP_SIZE = 96;           // small — POS averages, HSEmotion upsamples
const JPEG_QUALITY = 0.4;

interface HookState {
  reading: BiometricReading;
  connected: boolean;
  /** True when env is configured so a connection can be attempted. */
  configured: boolean;
}

export function useStreamedBiometrics(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  coherence: number,
  enabled: boolean,
): HookState {
  const configured = isMobileBiometricsConfigured();
  const [reading, setReading] = useState<BiometricReading>({
    bpm: null,
    pupilMm: null,
    coherence,
    emotions: { ...NEUTRAL_EMOTIONS },
    cameraOn: false,
  });
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const waitRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const lastBpmRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !configured) {
      setConnected(false);
      setReading((prev) => ({
        ...prev,
        bpm: null,
        pupilMm: null,
        emotions: { ...NEUTRAL_EMOTIONS },
        cameraOn: false,
      }));
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;

    const cleanupLoop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (waitRef.current !== null) {
        cancelAnimationFrame(waitRef.current);
        waitRef.current = null;
      }
    };

    const startUplink = (socket: WebSocket) => {
      if (!scratchRef.current) scratchRef.current = document.createElement('canvas');
      const scratch = scratchRef.current;
      scratch.width = CROP_SIZE;
      scratch.height = CROP_SIZE;
      const ctx = scratch.getContext('2d', { willReadFrequently: true });

      const loop = () => {
        if (cancelled) return;
        const video = videoRef.current;
        const now = performance.now();
        if (
          socket.readyState === WebSocket.OPEN &&
          video &&
          video.videoWidth > 0 &&
          now - lastFrameAtRef.current >= FRAME_INTERVAL_MS
        ) {
          lastFrameAtRef.current = now;
          if (ctx) {
            const side = Math.min(video.videoWidth, video.videoHeight);
            const sx = (video.videoWidth - side) / 2;
            const sy = Math.max(0, (video.videoHeight - side) / 2 - side * 0.05);
            ctx.drawImage(video, sx, sy, side, side, 0, 0, CROP_SIZE, CROP_SIZE);
            scratch.toBlob(
              (blob) => {
                if (blob && socket.readyState === WebSocket.OPEN && !cancelled) {
                  blob.arrayBuffer().then((buf) => {
                    if (socket.readyState === WebSocket.OPEN && !cancelled) {
                      socket.send(buf);
                    }
                  });
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
    };

    // Wait until a <video> is mounted (ref can lag one frame after enable).
    const waitForVideoThenConnect = () => {
      if (cancelled) return;
      if (!videoRef.current) {
        waitRef.current = requestAnimationFrame(waitForVideoThenConnect);
        return;
      }

      try {
        const endpoint = new URL(WS_URL);
        endpoint.searchParams.set('token', WS_TOKEN);
        ws = new WebSocket(endpoint.toString());
      } catch (err) {
        console.warn('[bio-stream] could not open WebSocket:', err);
        setConnected(false);
        return;
      }
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        if (!cancelled) setConnected(true);
      };
      ws.onclose = () => {
        if (!cancelled) setConnected(false);
      };
      ws.onerror = () => {
        if (!cancelled) setConnected(false);
      };
      ws.onmessage = (ev) => {
        if (cancelled) return;
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
            cameraOn: true,
          }));
        } catch (err) {
          console.warn('[bio-stream] bad update:', err);
        }
      };

      startUplink(ws);
    };

    waitForVideoThenConnect();

    return () => {
      cancelled = true;
      cleanupLoop();
      if (ws) {
        try { ws.close(); } catch { /* ignore */ }
      }
      wsRef.current = null;
      lastBpmRef.current = null;
    };
  }, [videoRef, enabled, configured]);

  useEffect(() => {
    setReading((prev) => ({
      ...prev,
      coherence,
      cameraOn: enabled && connected,
    }));
  }, [coherence, enabled, connected]);

  return { reading, connected, configured };
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
