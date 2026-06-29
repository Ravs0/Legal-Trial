"""POS — Plane-Orthogonal-to-Skin remote photoplethysmography (Python mirror).

Wang, den Brinker, Stuijk, de Haen, "Algorithmic principles of remote-PPG",
IEEE Trans. Biomed. Eng. 64(7), 2017.

This mirrors vision/shared/pos.ts exactly: same constants, same chrominance
construction, same variance-normalized POS plane projection, same bandpass +
SNR threshold. Keep the two files in sync. Used by the FastAPI backend that the
mobile path streams to.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import numpy as np

# Physiologically plausible heart-rate band, in Hz (42 .. 210 BPM).
HR_BAND_HZ = (0.7, 3.5)
# SNR (dB) below which a BPM is treated as unreliable. 3 dB is too lenient for
# short windows (noise can spike a random bin above it); 6 dB separates a true
# pulse from camera noise reliably in practice.
MIN_SNR_DB = 6.0
# Window length in seconds. POS needs >= 5s; 30s is the literature default.
DEFAULT_WINDOW_SEC = 5
# Expected sample rate (fps).
DEFAULT_FPS = 30


@dataclass
class PosResult:
    bpm: Optional[float]
    snr: float
    confidence: float


@dataclass
class RgbSample:
    t: float
    r: float
    g: float
    b: float


def estimate_fps(samples: List[RgbSample]) -> float:
    if len(samples) < 2:
        return DEFAULT_FPS
    span = samples[-1].t - samples[0].t
    if span <= 0:
        return DEFAULT_FPS
    return (len(samples) - 1) / span


def _detrend(xs: np.ndarray) -> np.ndarray:
    return xs - xs.mean()


def _variance(xs: np.ndarray) -> float:
    if xs.size == 0:
        return 0.0
    return float(np.var(xs))


def _fft_dominant(signal: np.ndarray, fps: float,
                  band_min: float, band_max: float):
    n = signal.size
    if n < 4:
        return 0.0, 0.0, 0.0
    win = np.hamming(n)
    windowed = signal * win
    spectrum = np.abs(np.fft.rfft(windowed))
    freqs = np.fft.rfftfreq(n, d=1.0 / fps)
    lo = max(1, np.searchsorted(freqs, band_min))
    hi = min(freqs.size - 1, np.searchsorted(freqs, band_max, side="right"))
    if hi <= lo:
        return 0.0, 0.0, 0.0
    band = spectrum[lo:hi + 1]
    peak_idx = int(np.argmax(band))
    peak_mag = float(band[peak_idx])

    # Parabolic interpolation around the peak for sub-bin frequency precision.
    # Fits a parabola to [peak-1, peak, peak+1] magnitudes; the vertex gives the
    # true peak location at fractional-bin resolution (~1 BPM instead of ~12 BPM
    # at a 5s/30fps window).
    peak_freq = float(freqs[lo + peak_idx])
    if 0 < peak_idx < band.size - 1:
        y0, y1, y2 = band[peak_idx - 1], band[peak_idx], band[peak_idx + 1]
        denom = y0 - 2 * y1 + y2
        if abs(denom) > 1e-9:
            offset = 0.5 * (y0 - y2) / denom  # fractional bin offset in [-1, 1]
            peak_freq = float(freqs[lo + peak_idx] + offset * (freqs[1] - freqs[0]))

    rest = np.delete(band, peak_idx)
    rest_mean = float(rest.mean()) if rest.size else 1e-9
    snr_db = 10.0 * np.log10(peak_mag / (rest_mean + 1e-9))
    return peak_freq, peak_mag, snr_db


def pos_estimate(samples: List[RgbSample],
                 fps: Optional[float] = None,
                 window_sec: float = DEFAULT_WINDOW_SEC) -> PosResult:
    if fps is None:
        fps = estimate_fps(samples)
    needed = max(int(2 * fps), int(window_sec * fps))
    if len(samples) < needed:
        return PosResult(bpm=None, snr=0.0, confidence=0.0)

    win = samples[-needed:]
    arr = np.array([[s.r, s.g, s.b] for s in win], dtype=np.float64)
    r, g, b = arr[:, 0], arr[:, 1], arr[:, 2]

    # Chrominance signals (Wang POS projection plane).
    x = 3.0 * r - 2.0 * g
    y = 1.5 * r + g - 1.5 * b

    # Normalize each chrominance to unit variance.
    xd = _detrend(x)
    yd = _detrend(y)
    sx = np.sqrt(_variance(xd))
    sy = np.sqrt(_variance(yd))
    if sx > 1e-9:
        xd = xd / sx
    if sy > 1e-9:
        yd = yd / sy

    # POS plane projection: S = Xd - alpha * Yd.
    var_x = _variance(xd)
    var_y = _variance(yd)
    alpha = np.sqrt(var_x / var_y) if var_y > 1e-9 else 1.0
    s = xd - alpha * yd
    sd = _detrend(s)

    freq, _mag, snr_db = _fft_dominant(sd, fps, HR_BAND_HZ[0], HR_BAND_HZ[1])
    bpm = freq * 60.0 if freq > 0 else None
    confidence = max(0.0, min(1.0, (snr_db - MIN_SNR_DB) / 12.0))
    if snr_db < MIN_SNR_DB:
        return PosResult(bpm=None, snr=snr_db, confidence=confidence)
    return PosResult(bpm=bpm, snr=snr_db, confidence=confidence)
