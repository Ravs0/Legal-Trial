// ─────────────────────────────────────────────────────────────────────────────
// HSEmotion ONNX session — lazy, cached, degrades gracefully.
//
// Loads EfficientNet-B0 / AffectNet8 weights as ONNX and runs them via
// onnxruntime-web (WebGL EP). If the .onnx file is absent (the common case
// until you fetch it per README), the session stays null and the pipeline
// runs POS-only. No hard dependency on the model existing.
//
// HSEmotion has TWO outputs: classification logits (8 classes) AND a valence/
// arousal regression. We use the classification head; valence/arousal are
// available on the second output tensor if you want them later.
// ─────────────────────────────────────────────────────────────────────────────

import * as ort from 'onnxruntime-web';
import {
  EMOTION_KEYS,
  AFFECTNET_CLASS_ORDER,
  NEUTRAL_EMOTIONS,
  normalizeEmotions,
  type EmotionSet,
} from '../shared/emotion-keys';

const MODEL_URL = '/models/hsemotion_effnet_b0_affectnet.onnx';
const INPUT_SIZE = 224;

let sessionPromise: Promise<ort.InferenceSession | null> | null = null;

/**
 * Lazily create the ONNX session. Resolves to null if the model file isn't
 * fetchable, so callers can treat emotion inference as best-effort.
 */
export function getHsemotionSession(): Promise<ort.InferenceSession | null> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    try {
      // Probe with a HEAD-ish fetch so a 404 doesn't throw a confusing error.
      const probe = await fetch(MODEL_URL, { method: 'GET' });
      if (!probe.ok) {
        console.warn(`[hsemotion] model not found at ${MODEL_URL} (${probe.status}). Running POS-only.`);
        return null;
      }
      const bytes = await probe.arrayBuffer();
      return await ort.InferenceSession.create(bytes, {
        executionProviders: ['webgl', 'wasm'],
      });
    } catch (err) {
      console.warn('[hsemotion] failed to load session:', err);
      return null;
    }
  })();
  return sessionPromise;
}

/**
 * Run HSEmotion on a 224x224 face crop. Returns a normalized EmotionSet, or
 * NEUTRAL_EMOTIONS if the model isn't available. HSEmotion expects a
 * ImageNet-normalized, NCHW float32 tensor.
 */
export async function inferEmotions(
  session: ort.InferenceSession,
  crop: ImageData,
): Promise<EmotionSet> {
  const input = imageDataToNchw(crop, INPUT_SIZE);

  const feeds: Record<string, ort.Tensor> = {};
  const inputName = session.inputNames[0];
  feeds[inputName] = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);

  const results = await session.run(feeds);
  // Classification logits are the FIRST output in the published HSEmotion graph.
  const outName = session.outputNames[0];
  const logits = results[outName].data as Float32Array;

  const probs = softmax(Array.from(logits));
  const emotions = { ...NEUTRAL_EMOTIONS } as EmotionSet;
  // Map AffectNet class order onto our EmotionKey set.
  for (let i = 0; i < AFFECTNET_CLASS_ORDER.length && i < probs.length; i++) {
    emotions[AFFECTNET_CLASS_ORDER[i]] = probs[i];
  }
  return normalizeEmotions(emotions);
}

/** Convert ImageData → NCHW float32 with ImageNet normalization. */
function imageDataToNchw(img: ImageData, size: number): Float32Array {
  const out = new Float32Array(3 * size * size);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const src = img.data;
  const plane = size * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = src[i + c] / 255.0;
        out[c * plane + y * size + x] = (v - mean[c]) / std[c];
      }
    }
  }
  return out;
}

function softmax(xs: number[]): number[] {
  let max = -Infinity;
  for (const x of xs) if (x > max) max = x;
  let sum = 0;
  const exps = xs.map((x) => {
    const e = Math.exp(x - max);
    sum += e;
    return e;
  });
  return exps.map((e) => e / (sum || 1));
}

export { EMOTION_KEYS, NEUTRAL_EMOTIONS };
