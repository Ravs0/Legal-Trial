// Synthetic-pulse tests for POS (TypeScript) — mirrors backend/test_pos.py.
// Embeds a known heartbeat into a fake RGB signal and checks the recovered BPM.
// Run with:  npx tsx vision/shared/pos.test.ts
import { posEstimate, DEFAULT_FPS } from './pos';
import type { RgbSample } from './types';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function synthSamples(
  bpm: number,
  seconds = 10,
  fps = DEFAULT_FPS,
  amplitude = 1.5,
  noise = 0.05,
): RgbSample[] {
  const n = Math.floor(seconds * fps);
  const out: RgbSample[] = [];
  const freq = bpm / 60;
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const pulse = Math.sin(2 * Math.PI * freq * t);
    const jitterR = noise * (2 * Math.random() - 1);
    const jitterG = noise * (2 * Math.random() - 1);
    // Green carries the strongest PPG component in practice.
    const r = 150 + amplitude * pulse * 0.6 + jitterR;
    const g = 120 + amplitude * pulse * 1.0 + jitterG;
    const b = 110 + amplitude * pulse * 0.3;
    out.push({ t, r, g, b });
  }
  return out;
}

function testRecovers72bpm(): void {
  const samples = synthSamples(72, 10, DEFAULT_FPS, 2.0, 0.02);
  const res = posEstimate(samples);
  assert(res.bpm !== null, `expected a BPM, got null (snr=${res.snr.toFixed(2)})`);
  assert(Math.abs(res.bpm - 72) < 4, `recovered ${res.bpm.toFixed(1)}, expected ~72`);
  assert(res.snr >= 6, `snr ${res.snr.toFixed(2)} below threshold`);
}

function testRecovers90bpm(): void {
  const samples = synthSamples(90, 10, DEFAULT_FPS, 2.0, 0.02);
  const res = posEstimate(samples);
  assert(res.bpm !== null, 'expected a BPM, got null');
  assert(Math.abs(res.bpm - 90) < 4, `recovered ${res.bpm.toFixed(1)}, expected ~90`);
}

function testFlatSignalReturnsNull(): void {
  // No pulse — pure noise. Should stay below the SNR threshold.
  const samples = synthSamples(72, 10, DEFAULT_FPS, 0.0, 2.0);
  const res = posEstimate(samples);
  assert(res.bpm === null, `flat signal should yield null, got ${res.bpm}`);
}

function testShortWindowReturnsNull(): void {
  const samples = synthSamples(72, 0.5);
  const res = posEstimate(samples);
  assert(res.bpm === null, 'short window should yield null');
}

const tests: Array<() => void> = [
  testRecovers72bpm,
  testRecovers90bpm,
  testFlatSignalReturnsNull,
  testShortWindowReturnsNull,
];

let passed = 0;
let failed = 0;
for (const fn of tests) {
  try {
    fn();
    console.log(`  PASS  ${fn.name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${fn.name}: ${(e as Error).message}`);
    failed++;
  }
}
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);
process.exit(failed ? 1 : 0);
