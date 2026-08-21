// ─────────────────────────────────────────────────────────────────────────────
// Shared type contracts for the real biometrics pipeline.
//
// BiometricReading matches the shape of the simulated `BiometricState` in
// DreadlerArenaScreen.tsx (bpm, pupilMm, coherence, emotions, cameraOn) so the
// real hook is a drop-in for `useBiometrics()`.
// ─────────────────────────────────────────────────────────────────────────────

import { EmotionSet } from './emotion-keys';

/** Algorithm selector — only algorithms with a real implementation. */
export type BioAlgo = 'pos' | 'hsemotion';

/** Axis-aligned face box in source-pixel coordinates. */
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single spatially-averaged RGB sample from the face ROI (0..255 per channel). */
export interface RgbSample {
  t: number;   // sample timestamp, seconds
  r: number;
  g: number;
  b: number;
}

/** Output of a single POS pass over a window of RGB samples. */
export interface PosResult {
  /** Heart rate in beats-per-minute, or null if confidence too low. */
  bpm: number | null;
  /** Signal-to-noise of the dominant FFT peak. < ~3 dB => unreliable. */
  snr: number;
  /** Confidence in [0,1] derived from SNR + motion quality. */
  confidence: number;
}

/** The reading the UI consumes — same shape as the simulated BiometricState. */
export interface BiometricReading {
  bpm: number | null;
  pupilMm: number | null;
  coherence: number;     // passed through from game state (not derived here)
  emotions: EmotionSet;
  cameraOn: boolean;
}

/** Wire format for the mobile → backend WebSocket link. */
export interface BiometricWireUpdate {
  bpm: number | null;
  snr: number;
  confidence: number;
  emotions: number[];    // AFFECTNET_CLASS_ORDER, floats in [0,1]
  pupilMm: number | null;
  dominant: string;
}
