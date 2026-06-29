"""Synthetic-pulse tests for POS (Python).

Embeds a known heartbeat into a fake RGB signal and checks the recovered BPM.
A clean signal at 72 BPM should recover within a few BPM; a flat signal should
yield bpm=None. Run with:  python vision/backend/test_pos.py
"""
from __future__ import annotations

import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pos import pos_estimate, RgbSample, DEFAULT_FPS  # noqa: E402


def synth_samples(bpm: float, seconds: float = 10.0, fps: float = DEFAULT_FPS,
                  amplitude: float = 1.5, noise: float = 0.05):
    """Build fake RGB samples with a cardiac-rate oscillation.

    Blood flow shifts R/G/B sub-visibly; we model that as a small sinusoid at
    the pulse frequency added onto a skin-tone baseline.
    """
    n = int(seconds * fps)
    out = []
    freq = bpm / 60.0
    for i in range(n):
        t = i / fps
        pulse = math.sin(2 * math.pi * freq * t)
        jitter_r = noise * (2 * (os.urandom(1)[0] / 255.0) - 1)
        jitter_g = noise * (2 * (os.urandom(1)[0] / 255.0) - 1)
        # Green carries the strongest PPG component in practice.
        r = 150.0 + amplitude * pulse * 0.6 + jitter_r
        g = 120.0 + amplitude * pulse * 1.0 + jitter_g
        b = 110.0 + amplitude * pulse * 0.3
        out.append(RgbSample(t=t, r=r, g=g, b=b))
    return out


def test_recovers_72bpm():
    samples = synth_samples(72.0, seconds=10.0, amplitude=2.0, noise=0.02)
    res = pos_estimate(samples)
    assert res.bpm is not None, f"expected a BPM, got None (snr={res.snr:.2f})"
    assert abs(res.bpm - 72.0) < 4.0, f"recovered {res.bpm:.1f}, expected ~72"
    assert res.snr >= 3.0


def test_recovers_90bpm():
    samples = synth_samples(90.0, seconds=10.0, amplitude=2.0, noise=0.02)
    res = pos_estimate(samples)
    assert res.bpm is not None
    assert abs(res.bpm - 90.0) < 4.0, f"recovered {res.bpm:.1f}, expected ~90"


def test_flat_signal_returns_null():
    # No pulse — pure noise. SNR should stay below threshold.
    samples = synth_samples(72.0, seconds=10.0, amplitude=0.0, noise=2.0)
    res = pos_estimate(samples)
    assert res.bpm is None, f"flat signal should yield null, got {res.bpm}"


def test_short_window_returns_null():
    # Not enough samples to fill a window.
    samples = synth_samples(72.0, seconds=0.5)
    res = pos_estimate(samples)
    assert res.bpm is None


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    passed = failed = 0
    for fn in fns:
        try:
            fn()
            print(f"  PASS  {fn.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL  {fn.__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed, {len(fns)} total")
    sys.exit(1 if failed else 0)
