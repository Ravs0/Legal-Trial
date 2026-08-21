// ─────────────────────────────────────────────────────────────────────────────
// Voight-Kampff Physiological Scanner
// Extracted verbatim from DreadlerArenaScreen.tsx so the arena screen stays
// readable. Self-contained: simulated biometrics engine, camera stream hook,
// and the canvas overlays. Real pipeline lives under ../vision.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  EMOTION_KEYS,
  normalizeEmotions,
  type EmotionKey,
  type EmotionSet,
} from '../../vision/shared/emotion-keys';

export type { EmotionKey, EmotionSet };
export { EMOTION_KEYS };

/** Algorithms with a real implementation. evm/physformer were cosmetic stubs — cut. */
export type ScanAlgo = 'pos' | 'hsemotion';

interface BiometricState {
  bpm: number;
  pupilMm: number;
  coherence: number;
  emotions: EmotionSet;
  cameraOn: boolean;
}

const EMOTION_COLORS: Record<EmotionKey, string> = {
  Neutral: '#9ca3af',
  Happy: '#22c55e',
  Sad: '#3b82f6',
  Surprise: '#eab308',
  Fear: '#ef4444',
  Disgust: '#a855f7',
  Anger: '#dc2626',
  Contempt: '#f97316',
};

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Keep whichever <video> currently owns videoRef attached to the live stream. */
  const attachStream = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    const stream = streamRef.current;
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => undefined);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (loading || cameraOn) return;
    setLoading(true);
    setError(null);
    try {
      // Secure-context guard: getUserMedia only exists on https/localhost.
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Camera needs HTTPS. This page is not in a secure context.',
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraOn(true);
    } catch (err) {
      setError(humanizeCameraError(err));
      setCameraOn(false);
    } finally {
      setLoading(false);
    }
  }, [loading, cameraOn]);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return { videoRef, cameraOn, loading, error, requestPermission, stop, attachStream };
}

/** Turn a getUserMedia failure into a short, actionable message for the HUD. */
function humanizeCameraError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permission denied. Allow camera access in your browser.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found on this device.';
    case 'NotReadableError':
      return 'Camera in use by another app. Close it and retry.';
    default:
      return err instanceof Error && err.message
        ? err.message
        : 'Camera access failed.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Biometric Engine
// ─────────────────────────────────────────────────────────────────────────────

function randInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpEmotions(
  current: EmotionSet,
  target: EmotionSet,
  t: number
): EmotionSet {
  const out = {} as EmotionSet;
  for (const key of EMOTION_KEYS) {
    out[key] = lerp(current[key], target[key], t);
  }
  return out;
}

interface BiometricTargets {
  bpm: number;
  pupilMm: number;
  emotions: EmotionSet;
}

function computeTargets(
  isDirectLie: boolean,
  isTyping: boolean,
  coherence: number,
  agentVariant: string
): BiometricTargets {
  let baseBpm: number;
  let basePupil: number;
  let emotions: EmotionSet;

  // Base state depends on agentVariant (representing Dreadler's pressure level)
  if (agentVariant === 'gamma' || coherence < 40) {
    baseBpm = randInRange(92, 98);
    basePupil = randInRange(5.4, 5.8);
    emotions = {
      Neutral: 0.25,
      Happy: 0.02,
      Sad: 0.15,
      Surprise: 0.15,
      Fear: 0.25,
      Disgust: 0.08,
      Anger: 0.08,
      Contempt: 0.02,
    };
  } else if (agentVariant === 'beta' || coherence < 70) {
    baseBpm = randInRange(82, 88);
    basePupil = randInRange(4.7, 5.1);
    emotions = {
      Neutral: 0.40,
      Happy: 0.05,
      Sad: 0.10,
      Surprise: 0.15,
      Fear: 0.10,
      Disgust: 0.05,
      Anger: 0.10,
      Contempt: 0.05,
    };
  } else {
    // alpha variant (calm baseline)
    baseBpm = randInRange(72, 76);
    basePupil = randInRange(4.15, 4.35);
    emotions = {
      Neutral: 0.80,
      Happy: 0.05,
      Sad: 0.05,
      Surprise: 0.02,
      Fear: 0.02,
      Disgust: 0.02,
      Anger: 0.02,
      Contempt: 0.02,
    };
  }

  // Adjustments for action states
  if (isDirectLie) {
    // Overriding spike for contradictions
    baseBpm = randInRange(108, 120);
    basePupil = randInRange(6.4, 6.7);
    emotions = {
      Neutral: 0.01,
      Happy: 0.0,
      Sad: 0.04,
      Surprise: randInRange(0.85, 0.95),
      Fear: randInRange(0.90, 0.99),
      Disgust: 0.03,
      Anger: 0.01,
      Contempt: 0.01,
    };
  } else if (isTyping) {
    // Anticipation stress
    baseBpm += 10;
    basePupil += 0.5;
    emotions.Neutral = Math.max(0.1, emotions.Neutral - 0.3);
    emotions.Surprise = Math.min(0.9, emotions.Surprise + 0.2);
    emotions.Fear = Math.min(0.9, emotions.Fear + 0.1);
  }

  return { bpm: baseBpm, pupilMm: basePupil, emotions: normalizeEmotions(emotions) };
}

export function useBiometrics(
  isDirectLie: boolean,
  isTyping: boolean,
  coherence: number,
  agentVariant: string = 'alpha',
  lastTacticFlagged: string | null = null
) {
  const [state, setState] = useState<BiometricState>({
    bpm: 74,
    pupilMm: 4.2,
    coherence,
    emotions: {
      Neutral: 0.80,
      Happy: 0.05,
      Sad: 0.05,
      Surprise: 0.02,
      Fear: 0.02,
      Disgust: 0.02,
      Anger: 0.02,
      Contempt: 0.02,
    },
    cameraOn: false,
  });

  const targetRef = useRef<BiometricTargets>(
    computeTargets(isDirectLie, isTyping, coherence, agentVariant)
  );

  // Track physiological spikes (panic)
  const pulseSpikeRef = useRef<number>(0);
  const pupilSpikeRef = useRef<number>(0);

  const prevLieRef = useRef<boolean>(isDirectLie);
  const prevTacticRef = useRef<string | null>(lastTacticFlagged);
  const frameRef = useRef<number | null>(null);

  // Detect transitions to trigger instant biometric panic spikes
  useEffect(() => {
    if (isDirectLie && !prevLieRef.current) {
      // Instant massive panic spike!
      pulseSpikeRef.current = 32;
      pupilSpikeRef.current = 1.8;
    }
    prevLieRef.current = isDirectLie;
  }, [isDirectLie]);

  useEffect(() => {
    if (lastTacticFlagged && lastTacticFlagged !== prevTacticRef.current) {
      // Tactic exposure logic stress spike
      pulseSpikeRef.current = 16;
      pupilSpikeRef.current = 0.8;
    }
    prevTacticRef.current = lastTacticFlagged;
  }, [lastTacticFlagged]);

  useEffect(() => {
    targetRef.current = computeTargets(isDirectLie, isTyping, coherence, agentVariant);
  }, [isDirectLie, isTyping, coherence, agentVariant]);

  useEffect(() => {
    const start = performance.now();
    const tick = () => {
      const now = performance.now();
      const elapsed = (now - start) / 1000;

      setState((prev) => {
        const target = targetRef.current;

        // Decay spike values organically over time
        pulseSpikeRef.current *= 0.982;
        pupilSpikeRef.current *= 0.978;

        // Respiratory Sinus Arrhythmia: micro-fluctuations simulating normal breathing rhythm
        // Oscillates by +/- 2.2 BPM every 4.2 seconds
        const breathingBpmOsc = Math.sin(elapsed * (2 * Math.PI / 4.2)) * 2.2;
        // Minor noise jitter
        const noiseBpm = (Math.random() * 2 - 1) * 0.4;
        const noisePupil = (Math.random() * 2 - 1) * 0.02;

        const currentTargetBpm = target.bpm + breathingBpmOsc + pulseSpikeRef.current + noiseBpm;
        const currentTargetPupil = target.pupilMm + pupilSpikeRef.current + noisePupil;

        // Smoothly interpolate to target values
        const newBpm = lerp(prev.bpm, currentTargetBpm, 0.075);
        const newPupil = lerp(prev.pupilMm, currentTargetPupil, 0.075);
        const newEmotions = lerpEmotions(prev.emotions, target.emotions, 0.055);

        return {
          ...prev,
          bpm: newBpm,
          pupilMm: newPupil,
          coherence,
          emotions: newEmotions,
        };
      });
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [coherence]);

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Wireframe Canvas
// ─────────────────────────────────────────────────────────────────────────────

export function WireframeScanCanvas({
  active,
  isDirectLie,
}: {
  active: boolean;
  isDirectLie: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const now = performance.now();
      const t = (now - startRef.current) / 1000;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.fillStyle = '#020604';
      ctx.fillRect(0, 0, w, h);

      const baseColor = isDirectLie ? '#ef4444' : '#22c55e';
      const accentColor = isDirectLie ? '#7f1d1d' : '#064e3b';

      // Perspective grid
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1;

      const horizonY = h * 0.55;
      const vanishX = w * 0.5;

      // Horizontal grid lines (perspective)
      const lines = 18;
      for (let i = 0; i <= lines; i++) {
        const p = i / lines;
        const y = horizonY + (h - horizonY) * Math.pow(p, 2);
        ctx.globalAlpha = 0.15 + p * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Vertical converging lines
      const vLines = 24;
      for (let i = 0; i <= vLines; i++) {
        const p = i / vLines;
        const xTop = vanishX + (p - 0.5) * w * 0.3;
        const xBottom = (p - 0.5) * w * 3 + w * 0.5;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(xTop, horizonY);
        ctx.lineTo(xBottom, h);
        ctx.stroke();
      }

      // Scanning sweep line
      const sweepY = horizonY + ((t * 80) % (h - horizonY));
      const grad = ctx.createLinearGradient(0, sweepY - 40, 0, sweepY + 40);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, baseColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = grad;
      ctx.fillRect(0, sweepY - 40, w, 80);

      // Horizontal sweep line
      ctx.globalAlpha = 1;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, sweepY);
      ctx.lineTo(w, sweepY);
      ctx.stroke();

      // Top half: wireframe skull/face placeholder
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1.2;

      const cx = w / 2;
      const cy = horizonY * 0.5;
      const r = Math.min(w, h) * 0.22;

      // Face ellipse
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.75, r, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Eye sockets
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.32, cy - r * 0.15, r * 0.18, r * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.32, cy - r * 0.15, r * 0.18, r * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Pupils (animated)
      const pupilOffset = Math.sin(t * 2) * r * 0.04;
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(cx - r * 0.32 + pupilOffset, cy - r * 0.15, r * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + r * 0.32 + pupilOffset, cy - r * 0.15, r * 0.05, 0, Math.PI * 2);
      ctx.fill();

      // Nose
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - r * 0.08, cy + r * 0.25);
      ctx.lineTo(cx + r * 0.08, cy + r * 0.25);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      // Mouth
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.25, cy + r * 0.55);
      ctx.quadraticCurveTo(cx, cy + r * 0.7 + Math.sin(t * 1.5) * 4, cx + r * 0.25, cy + r * 0.55);
      ctx.stroke();

      // Crosshair
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Status text
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = baseColor;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('NO SIGNAL / RETINAL WIREFRAME ACTIVE', 8, 16);
      ctx.fillText(`SCAN MODE: ${isDirectLie ? 'DECEPTION' : 'BASELINE'}`, 8, 30);
      ctx.fillText(`T+${t.toFixed(1)}s`, 8, h - 10);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isDirectLie]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: active ? 'block' : 'none',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PPG Waveform Canvas
// ─────────────────────────────────────────────────────────────────────────────

export function PPGWaveformCanvas({ bpm }: { bpm: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const bpmRef = useRef<number>(bpm);
  const bufferRef = useRef<Float32Array>(new Float32Array(0));
  const phaseRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bufferRef.current = new Float32Array(Math.max(64, Math.floor(rect.width)));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // PPG pulse shape (Gaussian-like waveform with dicrotic notch)
    const pulseShape = (phase: number): number => {
      // phase in [0, 1)
      const p = phase % 1;
      // Systolic peak
      const main = Math.exp(-Math.pow((p - 0.25) / 0.08, 2));
      // Dicrotic notch + wave
      const secondary = 0.35 * Math.exp(-Math.pow((p - 0.55) / 0.12, 2));
      // Small baseline ripple
      const ripple = 0.04 * Math.sin(p * Math.PI * 8);
      return main + secondary + ripple;
    };

    const draw = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      const currentBpm = bpmRef.current;
      const beatsPerSecond = currentBpm / 60;
      phaseRef.current += beatsPerSecond * dt;

      // Shift buffer left (scroll effect)
      const buf = bufferRef.current;
      if (buf.length !== Math.floor(w)) {
        bufferRef.current = new Float32Array(Math.max(64, Math.floor(w)));
      }
      const buffer = bufferRef.current;
      // Move everything left by 1
      for (let i = 0; i < buffer.length - 1; i++) {
        buffer[i] = buffer[i + 1];
      }
      buffer[buffer.length - 1] = pulseShape(phaseRef.current);

      // Clear with slight trail
      ctx.fillStyle = 'rgba(2, 8, 4, 0.55)';
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Centerline
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w, h * 0.5);
      ctx.stroke();

      // Waveform
      const amplitude = h * 0.42;
      const centerY = h * 0.5;

      ctx.strokeStyle = '#22ff88';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = '#22ff88';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < buffer.length; i++) {
        const y = centerY - buffer[i] * amplitude;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Leading dot
      const lastY = centerY - buffer[buffer.length - 1] * amplitude;
      ctx.fillStyle = '#aaffcc';
      ctx.beginPath();
      ctx.arc(buffer.length - 1, lastY, 3, 0, Math.PI * 2);
      ctx.fill();

      // Labels
      ctx.fillStyle = 'rgba(34, 255, 136, 0.7)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('PPG / PLETHYSMOGRAPH', 6, 12);
      ctx.fillText(`${currentBpm.toFixed(1)} BPM`, w - 70, 12);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        background: '#020804',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HSEmotion Bar Charts
// ─────────────────────────────────────────────────────────────────────────────

export function EmotionBars({
  emotions,
  disabled = false,
  disabledReason,
}: {
  emotions: EmotionSet;
  disabled?: boolean;
  disabledReason?: string;
}) {
  if (disabled) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 py-4 px-2 text-center border border-dashed border-zinc-800/80 bg-black/20"
        role="status"
        aria-disabled="true"
      >
        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
          Emotions unavailable
        </span>
        <span className="text-[8px] font-mono text-zinc-600 leading-snug max-w-[220px]">
          {disabledReason || 'Classifier not loaded'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {EMOTION_KEYS.map((key) => {
        const value = emotions[key] ?? 0;
        const pct = Math.max(0, Math.min(100, value * 100));
        const color = EMOTION_COLORS[key];
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '64px',
                fontSize: '11px',
                fontFamily: 'ui-monospace, monospace',
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {key}
            </span>
            <div
              style={{
                flex: 1,
                height: '8px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '2px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: color,
                  transition: 'width 120ms linear',
                  boxShadow: `0 0 6px ${color}66`,
                }}
              />
            </div>
            <span
              style={{
                width: '38px',
                textAlign: 'right',
                fontSize: '11px',
                fontFamily: 'ui-monospace, monospace',
                color: color,
              }}
            >
              {pct.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan Circle Overlay
// ─────────────────────────────────────────────────────────────────────────────

export function ScanCircleOverlay({
  videoRef,
  isDirectLie,
  bpm,
  pupilMm,
  selectedAlgo = 'pos',
  emotions = {},
  onBpmUpdate,
}: {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  isDirectLie: boolean;
  bpm: number;
  pupilMm: number;
  selectedAlgo?: ScanAlgo;
  emotions?: Record<string, number>;
  onBpmUpdate?: (bpm: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Offscreen canvas for green channel averaging
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = 160;
    offscreenCanvas.height = 120;
    const offscreenCtx = offscreenCanvas.getContext('2d');

    // Signal processing states
    const rawSignals: Array<{ t: number; val: number }> = [];
    const filteredSignals: Array<{ t: number; val: number }> = [];
    const processedSignals: Array<{ t: number; val: number }> = [];
    const peakTimes: number[] = [];
    let lastPeakTime = 0;
    let currentBpm = bpm || 75;
    let lastNotificationTime = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const start = performance.now();
    const draw = () => {
      const nowMs = performance.now();
      const t = (nowMs - start) / 1000;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.28;

      // Extract real-time pixel data from the webcam video feed
      const video = videoRef?.current;
      if (video && video.readyState >= 2 && !video.paused && !video.ended) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw > 0 && vh > 0 && offscreenCtx) {
          // Forehead ROI: top-center 15% width, 15% height
          const cropW = Math.floor(vw * 0.15);
          const cropH = Math.floor(vh * 0.15);
          const cropX = Math.floor((vw - cropW) / 2);
          const cropY = Math.floor(vh * 0.25);

          offscreenCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, 160, 120);
          const imgData = offscreenCtx.getImageData(0, 0, 160, 120);
          const imgDataArr = imgData.data;

          let greenSum = 0;
          let pixelCount = 0;
          for (let i = 1; i < imgDataArr.length; i += 4) {
            greenSum += imgDataArr[i];
            pixelCount++;
          }
          const greenAvg = pixelCount > 0 ? greenSum / pixelCount : 0;

          if (greenAvg > 0) {
            rawSignals.push({ t: nowMs, val: greenAvg });
            if (rawSignals.length > 300) rawSignals.shift();

            // High-pass filter (DC subtraction over 3 seconds / 90 frames)
            const dcWindow = 90;
            let sumVal = 0;
            const startIdx = Math.max(0, rawSignals.length - dcWindow);
            for (let i = startIdx; i < rawSignals.length; i++) {
              sumVal += rawSignals[i].val;
            }
            const dcComponent = sumVal / (rawSignals.length - startIdx);
            const acValue = greenAvg - dcComponent;

            // Low-pass filter (Moving average of 3 frames)
            filteredSignals.push({ t: nowMs, val: acValue });
            if (filteredSignals.length > 300) filteredSignals.shift();

            const lpWindow = 3;
            let lpSum = 0;
            const lpStart = Math.max(0, filteredSignals.length - lpWindow);
            for (let i = lpStart; i < filteredSignals.length; i++) {
              lpSum += filteredSignals[i].val;
            }
            const smoothedValue = lpSum / (filteredSignals.length - lpStart);

            processedSignals.push({ t: nowMs, val: smoothedValue });
            if (processedSignals.length > 300) processedSignals.shift();

            // Peak detection: look for local maximum above a threshold
            if (processedSignals.length >= 3) {
              const prev2 = processedSignals[processedSignals.length - 3].val;
              const prev1 = processedSignals[processedSignals.length - 2].val;
              const curr = processedSignals[processedSignals.length - 1].val;
              const time1 = processedSignals[processedSignals.length - 2].t;

              if (prev1 > prev2 && prev1 > curr && prev1 > 0.03) {
                const elapsedSinceLastPeak = time1 - lastPeakTime;
                if (elapsedSinceLastPeak >= 333 && elapsedSinceLastPeak <= 1333) { // 45 to 180 BPM
                  peakTimes.push(time1);
                  if (peakTimes.length > 8) peakTimes.shift();
                  lastPeakTime = time1;

                  if (peakTimes.length >= 2) {
                    let totalInterval = 0;
                    let intervalCount = 0;
                    for (let i = 1; i < peakTimes.length; i++) {
                      totalInterval += (peakTimes[i] - peakTimes[i - 1]);
                      intervalCount++;
                    }
                    const avgIntervalMs = totalInterval / intervalCount;
                    const instantBpm = 60000 / avgIntervalMs;

                    // Dampen changes
                    currentBpm = currentBpm * 0.8 + instantBpm * 0.2;

                    if (nowMs - lastNotificationTime > 500 && onBpmUpdate) {
                      onBpmUpdate(Math.round(currentBpm));
                      lastNotificationTime = nowMs;
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Color scheme based on selected algorithm
      let baseColor = '#ff5566';
      if (isDirectLie) {
        baseColor = '#ff3344';
      } else {
        switch (selectedAlgo) {
          case 'pos': baseColor = '#10b981'; break; // Emerald
          case 'hsemotion': baseColor = '#3b82f6'; break; // Blue
        }
      }

      // Outer targeting ring
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Tick marks
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * Math.PI * 2;
        const inner = radius + 3;
        const outer = radius + (i % 5 === 0 ? 9 : 5);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.stroke();
      }

      // Rotating sweep arc
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2.5;
      const sweepAngle = t * 2.0;
      const grad = ctx.createLinearGradient(
        cx + Math.cos(sweepAngle - 0.5) * radius,
        cy + Math.sin(sweepAngle - 0.5) * radius,
        cx + Math.cos(sweepAngle) * radius,
        cy + Math.sin(sweepAngle) * radius
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, baseColor);
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, sweepAngle - 0.5, sweepAngle);
      ctx.stroke();

      // Crosshairs
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(cx - radius - 15, cy);
      ctx.lineTo(cx + radius + 15, cy);
      ctx.moveTo(cx, cy - radius - 15);
      ctx.lineTo(cx, cy + radius + 15);
      ctx.stroke();
      ctx.setLineDash([]);

      // Corner brackets
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.5;
      const b = radius * 0.9;
      const bl = 12;
      const corners = [
        [cx - b, cy - b, 1, 1],
        [cx + b, cy - b, -1, 1],
        [cx - b, cy + b, 1, -1],
        [cx + b, cy + b, -1, -1],
      ] as const;
      for (const [x, y, dx, dy] of corners) {
        ctx.beginPath();
        ctx.moveTo(x, y + dy * bl);
        ctx.lineTo(x, y);
        ctx.lineTo(x + dx * bl, y);
        ctx.stroke();
      }

      // ───────────────────────────────────────────────────────────────────────
      // ALGORITHM-SPECIFIC OVERLAYS
      // ───────────────────────────────────────────────────────────────────────

      if (selectedAlgo === 'pos') {
        // POS / pyVHR multi-ROI selection boxes (forehead and cheeks)
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 1;
        ctx.fillStyle = baseColor;

        // Forehead Box
        ctx.globalAlpha = 0.2;
        ctx.strokeRect(cx - radius * 0.35, cy - radius * 0.65, radius * 0.7, radius * 0.25);
        ctx.globalAlpha = 0.04;
        ctx.fillRect(cx - radius * 0.35, cy - radius * 0.65, radius * 0.7, radius * 0.25);
        ctx.globalAlpha = 0.6;
        ctx.font = '6px ui-monospace, monospace';
        ctx.fillText('ROI_1: FOREHEAD', cx - radius * 0.32, cy - radius * 0.68);

        // Left Cheek Box
        ctx.globalAlpha = 0.2;
        ctx.strokeRect(cx - radius * 0.55, cy + radius * 0.05, radius * 0.3, radius * 0.3);
        ctx.globalAlpha = 0.04;
        ctx.fillRect(cx - radius * 0.55, cy + radius * 0.05, radius * 0.3, radius * 0.3);
        ctx.globalAlpha = 0.6;
        ctx.fillText('ROI_2: L_CHEEK', cx - radius * 0.52, cy + radius * 0.02);

        // Right Cheek Box
        ctx.globalAlpha = 0.2;
        ctx.strokeRect(cx + radius * 0.25, cy + radius * 0.05, radius * 0.3, radius * 0.3);
        ctx.globalAlpha = 0.04;
        ctx.fillRect(cx + radius * 0.25, cy + radius * 0.05, radius * 0.3, radius * 0.3);
        ctx.globalAlpha = 0.6;
        ctx.fillText('ROI_3: R_CHEEK', cx + radius * 0.28, cy + radius * 0.02);

        // Telemetry details
        ctx.font = '7px ui-monospace, monospace';
        const snr = isDirectLie ? (6.4 + Math.sin(t * 3.5) * 0.6) : (12.2 + Math.sin(t * 1.5) * 0.2);
        ctx.fillText(`POS SIGNAL STRENGTH: LOCKED`, cx - radius + 10, cy + radius + 12);
        ctx.fillText(`SNR: +${snr.toFixed(1)} dB`, cx - radius + 10, cy + radius + 21);
        ctx.fillText(`SKIN R_INDEX: 0.945`, cx - radius + 10, cy + radius + 30);
      }
      else if (selectedAlgo === 'hsemotion') {
        // HSEmotion Facial Landmarks and Valence-Arousal Grid
        ctx.strokeStyle = baseColor;
        ctx.fillStyle = baseColor;

        // Draw eyes with dilation
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx - radius * 0.32, cy - radius * 0.15, 6, 0, Math.PI * 2); // left eye outline
        ctx.arc(cx + radius * 0.32, cy - radius * 0.15, 6, 0, Math.PI * 2); // right eye outline
        ctx.stroke();

        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(cx - radius * 0.32, cy - radius * 0.15, pupilMm * 0.8, 0, Math.PI * 2); // left pupil
        ctx.arc(cx + radius * 0.32, cy - radius * 0.15, pupilMm * 0.8, 0, Math.PI * 2); // right pupil
        ctx.fill();

        // Draw mouth curve depending on active expressions
        const isHappy = (emotions.Happy ?? 0) > 0.3;
        const isSad = (emotions.Sad ?? 0) > 0.3 || (emotions.Fear ?? 0) > 0.3;
        const isSurprise = (emotions.Surprise ?? 0) > 0.3;

        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        if (isHappy) {
          ctx.arc(cx, cy + radius * 0.25, 8, 0, Math.PI); // smile
        } else if (isSad) {
          ctx.arc(cx, cy + radius * 0.35, 8, Math.PI, 0); // frown
        } else if (isSurprise) {
          ctx.arc(cx, cy + radius * 0.3, 5, 0, Math.PI * 2); // open mouth
        } else {
          ctx.moveTo(cx - 10, cy + radius * 0.3); // neutral line
          ctx.lineTo(cx + 10, cy + radius * 0.3);
        }
        ctx.stroke();

        // Draw 2D Valence-Arousal Grid in the corner (approx size 60x60)
        const gx = w - 70;
        const gy_box = h - 70;
        const gs = 50; // grid size

        ctx.globalAlpha = 0.2;
        ctx.strokeRect(gx, gy_box, gs, gs);
        ctx.globalAlpha = 0.05;
        ctx.fillRect(gx, gy_box, gs, gs);

        // Center lines
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.moveTo(gx + gs / 2, gy_box);
        ctx.lineTo(gx + gs / 2, gy_box + gs);
        ctx.moveTo(gx, gy_box + gs / 2);
        ctx.lineTo(gx + gs, gy_box + gs / 2);
        ctx.stroke();

        // Calculate Valence-Arousal from emotions
        let val = 0.0;
        let aro = 0.0;
        const total = Object.values(emotions).reduce((a, b) => a + b, 0) || 1;
        val = (
          (emotions.Happy ?? 0) * 0.8 +
          (emotions.Neutral ?? 0) * 0.0 +
          (emotions.Surprise ?? 0) * 0.2 +
          (emotions.Sad ?? 0) * -0.8 +
          (emotions.Fear ?? 0) * -0.7 +
          (emotions.Disgust ?? 0) * -0.6 +
          (emotions.Anger ?? 0) * -0.7 +
          (emotions.Contempt ?? 0) * -0.5
        ) / total;
        aro = (
          (emotions.Happy ?? 0) * 0.3 +
          (emotions.Neutral ?? 0) * -0.2 +
          (emotions.Surprise ?? 0) * 0.8 +
          (emotions.Sad ?? 0) * -0.4 +
          (emotions.Fear ?? 0) * 0.9 +
          (emotions.Disgust ?? 0) * 0.4 +
          (emotions.Anger ?? 0) * 0.8 +
          (emotions.Contempt ?? 0) * 0.4
        ) / total;

        // Map val (-1 to +1) to gx coordinate
        const dotX = gx + (val + 1) * (gs / 2);
        const dotY = gy_box + (1 - (aro + 1) / 2) * gs; // invert Y for grid coordinates

        // Draw crosshair dot
        ctx.fillStyle = '#ef4444';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
        ctx.stroke();

        // Labels
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = 0.7;
        ctx.font = '6px ui-monospace, monospace';
        ctx.fillText('VALENCE-AROUSAL', gx, gy_box - 4);
        ctx.fillText(`V: ${val.toFixed(2)}`, gx, gy_box + gs + 8);
        ctx.fillText(`A: ${aro.toFixed(2)}`, gx + gs - 22, gy_box + gs + 8);

        ctx.font = '7px ui-monospace, monospace';
        ctx.fillText('MODEL: HSEMOTION EFFICIENTNET-B0', cx - radius + 10, cy + radius + 12);
        ctx.fillText(`VALENCE : ${val.toFixed(2)}`, cx - radius + 10, cy + radius + 21);
        ctx.fillText(`AROUSAL : ${aro.toFixed(2)}`, cx - radius + 10, cy + radius + 30);
      }

      // HUD generic labels
      ctx.globalAlpha = 1;
      ctx.fillStyle = baseColor;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('TARGET LOCK', cx - 28, cy - radius - 20);

      // Real-time signal quality stats
      ctx.font = '6px ui-monospace, monospace';
      ctx.globalAlpha = 0.5;
      ctx.fillText('30 FPS // 640x480', cx - 24, cy - radius - 12);
      ctx.globalAlpha = 1;

      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(`BPM ${bpm.toFixed(0)}`, cx - radius - 8, cy - radius - 8);
      ctx.fillText(`PUP ${pupilMm.toFixed(2)}mm`, cx + radius - 60, cy - radius - 8);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isDirectLie, bpm, pupilMm, selectedAlgo, emotions, videoRef, onBpmUpdate]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
