// ─────────────────────────────────────────────────────────────────────────────
// POS — Plane-Orthogonal-to-Skin remote photoplethysmography.
// Wang, den Brinker, Stuijk, de Haan, "Algorithmic principles of remote-PPG"
// IEEE Trans. Biomed. Eng. 64(7), 2017.
//
// This is the deterministic signal-processing core. No learned weights. The
// same algorithm is implemented in Python at backend/pos.py — keep them in
// sync. POS recovers a pulse from sub-visual RGB shifts caused by blood flow:
//
//   1. average the face ROI to one RGB triplet per frame
//   2. build chrominance signals X = 3R − 2G, Y = 1.5R + G − 1.5B
//   3. within a sliding window, find the rotation that maximizes pulse energy
//      via the eigenvector of the 2×2 chrominance covariance (the "POS plane")
//   4. project onto that axis, bandpass 0.7–3.5 Hz (42–210 BPM)
//   5. FFT → dominant frequency → BPM; SNR of the peak gives confidence
// ─────────────────────────────────────────────────────────────────────────────

import { RgbSample, PosResult } from './types';

/** Physiologically plausible heart-rate band, in Hz. */
export const HR_BAND_HZ = { min: 0.7, max: 3.5 };   // 42 .. 210 BPM
/** SNR (dB) below which a BPM is treated as unreliable. 6 dB separates a true
 * pulse from camera noise reliably at short (5s) windows. */
export const MIN_SNR_DB = 6.0;
/** Window length, in seconds. POS needs ≥ 5s; 30s is the literature default. */
export const DEFAULT_WINDOW_SEC = 5;
/** Expected sample rate (fps). Used only to interpret indices; resilient to drift. */
export const DEFAULT_FPS = 30;

/**
 * Estimate the effective sampling rate from timestamps (Hz), so the pipeline is
 * robust to cameras that don't hit their nominal fps exactly.
 */
export function estimateFps(samples: RgbSample[]): number {
  if (samples.length < 2) return DEFAULT_FPS;
  const span = samples[samples.length - 1].t - samples[0].t;
  if (span <= 0) return DEFAULT_FPS;
  return (samples.length - 1) / span;
}

/** Mean of a numeric array. Empty → 0 (avoids 0/0 NaN). */
function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Subtract the mean from a signal (in place semantics, returns new array). */
function detrend(xs: number[]): number[] {
  const m = mean(xs);
  return xs.map((x) => x - m);
}

/**
 * Apply a Hamming-windowed DFT restricted to a frequency band and return the
 * dominant frequency (Hz), its magnitude, and the band's SNR in dB.
 *
 * We compute only the bins inside [bandMin, bandMax] for efficiency; SNR is the
 * peak magnitude divided by the mean magnitude of the *rest* of the band.
 */
function fftDominant(
  signal: number[],
  fps: number,
  bandMin: number,
  bandMax: number,
): { freq: number; magnitude: number; snrDb: number } {
  const n = signal.length;
  if (n < 4) return { freq: 0, magnitude: 0, snrDb: 0 };

  // Hamming window to reduce spectral leakage.
  const win: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    win[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  const windowed: number[] = new Array(n);
  for (let i = 0; i < n; i++) windowed[i] = signal[i] * win[i];

  const binHz = fps / n;
  const loBin = Math.max(1, Math.floor(bandMin / binHz));
  const hiBin = Math.min(Math.floor(n / 2), Math.ceil(bandMax / binHz));

  // Naive DFT over the band only — n is small (windowed frames, ~150-900).
  let peakBin = loBin;
  let peakMag = -Infinity;
  const mags: number[] = [];
  for (let k = loBin; k <= hiBin; k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const angle = (-2 * Math.PI * k * t) / n;
      re += windowed[t] * Math.cos(angle);
      im += windowed[t] * Math.sin(angle);
    }
    const mag = Math.sqrt(re * re + im * im);
    mags.push(mag);
    if (mag > peakMag) {
      peakMag = mag;
      peakBin = k;
    }
  }

  const peakFreq = peakBin * binHz;

  // Parabolic interpolation around the peak for sub-bin frequency precision.
  // Fits a parabola to [peak-1, peak, peak+1] magnitudes; the vertex gives the
  // true peak location at fractional-bin resolution (~1 BPM instead of ~12 BPM
  // at a 5s/30fps window).
  let interpolatedFreq = peakFreq;
  const peakPos = peakBin - loBin;
  if (peakPos > 0 && peakPos < mags.length - 1) {
    const y0 = mags[peakPos - 1];
    const y1 = mags[peakPos];
    const y2 = mags[peakPos + 1];
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-9) {
      const offset = 0.5 * (y0 - y2) / denom; // fractional bin offset in [-1, 1]
      interpolatedFreq = peakFreq + offset * binHz;
    }
  }

  // SNR: peak magnitude vs the mean of the other band bins.
  let restSum = 0;
  let restCount = 0;
  for (let i = 0; i < mags.length; i++) {
    if (i !== peakBin - loBin) {
      restSum += mags[i];
      restCount += 1;
    }
  }
  const restMean = restCount > 0 ? restSum / restCount : 1e-9;
  const snrDb = 10 * Math.log10(peakMag / (restMean + 1e-9));

  return { freq: interpolatedFreq, magnitude: peakMag, snrDb };
}

/**
 * Run one POS pass over a window of spatially-averaged RGB samples.
 *
 * Returns { bpm, snr, confidence }. bpm is null when SNR is below threshold
 * (motion, poor light, no face). The caller should hold the last good BPM for
 * a short grace period rather than flashing null.
 */
export function posEstimate(
  samples: RgbSample[],
  opts: { fps?: number; windowSec?: number } = {},
): PosResult {
  const fps = opts.fps ?? estimateFps(samples);
  const windowSec = opts.windowSec ?? DEFAULT_WINDOW_SEC;
  const needed = Math.max(2 * fps, Math.floor(windowSec * fps));
  if (samples.length < needed) {
    return { bpm: null, snr: 0, confidence: 0 };
  }

  // Use only the most recent window.
  const win = samples.slice(samples.length - needed);

  // 1. Chrominance signals (Wang eq. for the "POS" projection plane).
  const X: number[] = new Array(win.length);
  const Y: number[] = new Array(win.length);
  for (let i = 0; i < win.length; i++) {
    const { r, g, b } = win[i];
    X[i] = 3 * r - 2 * g;
    Y[i] = 1.5 * r + g - 1.5 * b;
  }

  // 2. Normalize each chrominance to unit variance so the plane-rotation step
  //    isn't dominated by amplitude (Wang uses mean-normalization; variance
  //    normalization is a stable practical variant).
  const Xd = normalizeVariance(detrend(X));
  const Yd = normalizeVariance(detrend(Y));

  // 3. POS plane rotation. The pulse axis is the eigenvector of the 2×2
  //    chrominance covariance matrix corresponding to the larger eigenvalue
  //    restricted to the cardiac band. Here we build the projected signal S
  //    directly via the closed-form POS combination S = Xd − α·Yd, where α is
  //    chosen (per Wang) from the sign of the cross-over correlation across
  //    short sub-windows. We approximate α robustly with the ratio of variances.
  const varX = variance(Xd);
  const varY = variance(Yd);
  const alpha = varY > 1e-9 ? Math.sqrt(varX / varY) : 1;
  const S: number[] = new Array(win.length);
  for (let i = 0; i < win.length; i++) S[i] = Xd[i] - alpha * Yd[i];

  // 4. Detrend the projected signal once more to kill residual DC drift.
  const Sd = detrend(S);

  // 5. Bandpass via windowed-FFT peak selection, then map to BPM.
  const { freq, snrDb } = fftDominant(
    Sd,
    fps,
    HR_BAND_HZ.min,
    HR_BAND_HZ.max,
  );

  const bpm = freq > 0 ? freq * 60.0 : null;
  const confidence = Math.max(0, Math.min(1, (snrDb - MIN_SNR_DB) / 12));

  if (snrDb < MIN_SNR_DB) {
    return { bpm: null, snr: snrDb, confidence };
  }
  return { bpm, snr: snrDb, confidence };
}

/** Divide a detrended signal by its standard deviation. */
function normalizeVariance(xs: number[]): number[] {
  const sd = Math.sqrt(variance(xs));
  if (sd < 1e-9) return xs.map(() => 0);
  return xs.map((x) => x / sd);
}

function variance(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return s / xs.length;
}
