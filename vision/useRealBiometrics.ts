// ─────────────────────────────────────────────────────────────────────────────
// useRealBiometrics — the dispatcher.
//
// Picks the compute path by form factor and returns a unified BiometricReading,
// the same shape the simulated useBiometrics() produces. The screen swaps this
// in only when the camera is ON; otherwise the simulation stays for the theater.
//
//   phone  → frames streamed to the Python backend (mobile CPU too weak for ONNX)
//   laptop → POS + HSEmotion run in-browser via ONNX Web
//
// The return shape is intentionally compatible with the simulated hook so the
// integration is a one-line source swap, not a UI rewrite.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import type { BiometricReading } from './shared/types';
import { NEUTRAL_EMOTIONS } from './shared/emotion-keys';
import { useInBrowserBiometrics } from './laptop/useInBrowserBiometrics';
import { useStreamedBiometrics } from './mobile/useStreamedBiometrics';

export interface RealBiometricsResult {
  reading: BiometricReading;
  /** Backend connection state — only meaningful on the mobile path. */
  connected: boolean;
  /** HSEmotion model loaded — only meaningful on the laptop path. */
  sessionReady: boolean;
  /** Which path is active, for status/debug display. */
  mode: 'laptop' | 'mobile';
}

export function useRealBiometrics(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  isMobile: boolean,
  coherence: number,
): RealBiometricsResult {
  const laptop = useInBrowserBiometrics(videoRef, coherence);
  const mobile = useStreamedBiometrics(videoRef, coherence);

  // Both hooks run (React rules-of-hooks: no conditional calls), but we surface
  // only the active path's data. This keeps hook order stable across resizes.
  const active = isMobile ? mobile.reading : laptop.reading;

  const reading: BiometricReading = useMemo(
    () => ({
      bpm: active.bpm,
      pupilMm: active.pupilMm,
      coherence,
      emotions: active.emotions ?? { ...NEUTRAL_EMOTIONS },
      cameraOn: true,
    }),
    [active.bpm, active.pupilMm, active.emotions, coherence],
  );

  return {
    reading,
    connected: mobile.connected,
    sessionReady: laptop.sessionReady,
    mode: isMobile ? 'mobile' : 'laptop',
  };
}
