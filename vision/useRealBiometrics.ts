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
// Capability flags (bpmLive / emotionsLive / unavailableReason) let the UI show
// honest disabled states when models or the mobile backend are not configured.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import type { BiometricReading } from './shared/types';
import { NEUTRAL_EMOTIONS } from './shared/emotion-keys';
import { useInBrowserBiometrics } from './laptop/useInBrowserBiometrics';
import {
  useStreamedBiometrics,
  isMobileBiometricsConfigured,
} from './mobile/useStreamedBiometrics';

export interface RealBiometricsResult {
  reading: BiometricReading;
  /** Backend connection state — only meaningful on the mobile path. */
  connected: boolean;
  /** HSEmotion model loaded — only meaningful on the laptop path. */
  sessionReady: boolean;
  /** Which path is active, for status/debug display. */
  mode: 'laptop' | 'mobile';
  /**
   * True when this path can produce real BPM (laptop POS always can once the
   * camera feeds frames; mobile only when WS is configured + connected).
   */
  bpmLive: boolean;
  /** True when emotion classification is actually running (model or backend). */
  emotionsLive: boolean;
  /**
   * Short reason the pipeline cannot fully run, or null when the active path
   * is healthy. UI should surface this instead of inventing readings.
   */
  unavailableReason: string | null;
  /** Build-time flag: mobile WS URL+token present and approved. */
  mobileConfigured: boolean;
}

export function useRealBiometrics(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  isMobile: boolean,
  coherence: number,
  enabled: boolean,
): RealBiometricsResult {
  const laptop = useInBrowserBiometrics(videoRef, coherence, enabled && !isMobile);
  const mobile = useStreamedBiometrics(videoRef, coherence, enabled && isMobile);
  const mobileConfigured = isMobileBiometricsConfigured();

  // Both hooks run (React rules-of-hooks: no conditional calls), but we surface
  // only the active path's data. This keeps hook order stable across resizes.
  const active = isMobile ? mobile.reading : laptop.reading;

  const capabilities = useMemo(() => {
    if (!enabled) {
      return {
        bpmLive: false,
        emotionsLive: false,
        unavailableReason: null as string | null,
      };
    }
    if (isMobile) {
      if (!mobileConfigured) {
        return {
          bpmLive: false,
          emotionsLive: false,
          unavailableReason:
            'Mobile biometrics need VITE_BIOMETRIC_WS_URL + TOKEN (not configured).',
        };
      }
      if (!mobile.connected) {
        return {
          bpmLive: false,
          emotionsLive: false,
          unavailableReason: 'Biometric backend offline or connecting…',
        };
      }
      // Connected: BPM yes; emotions only if backend sent non-empty probs
      // (sessionReady not tracked server-side — treat connected as live).
      return {
        bpmLive: true,
        emotionsLive: true,
        unavailableReason: null,
      };
    }
    // Laptop: POS needs no weights; emotions need ONNX session.
    return {
      bpmLive: true,
      emotionsLive: laptop.sessionReady,
      unavailableReason: laptop.sessionReady
        ? null
        : 'Emotion model not loaded — POS heart-rate only.',
    };
  }, [
    enabled,
    isMobile,
    mobileConfigured,
    mobile.connected,
    laptop.sessionReady,
  ]);

  const reading: BiometricReading = useMemo(
    () => ({
      bpm: capabilities.bpmLive ? active.bpm : null,
      // Real path never measures pupil; keep null so UI shows n/a, not sim.
      pupilMm: null,
      coherence,
      // Do not leak NEUTRAL defaults as if they were live classifications.
      emotions: capabilities.emotionsLive
        ? (active.emotions ?? { ...NEUTRAL_EMOTIONS })
        : { ...NEUTRAL_EMOTIONS },
      cameraOn: enabled,
    }),
    [
      active.bpm,
      active.emotions,
      capabilities.bpmLive,
      capabilities.emotionsLive,
      coherence,
      enabled,
    ],
  );

  return {
    reading,
    connected: mobile.connected,
    sessionReady: laptop.sessionReady,
    mode: isMobile ? 'mobile' : 'laptop',
    bpmLive: capabilities.bpmLive,
    emotionsLive: capabilities.emotionsLive,
    unavailableReason: capabilities.unavailableReason,
    mobileConfigured,
  };
}
