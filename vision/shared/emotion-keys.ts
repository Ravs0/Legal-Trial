// ─────────────────────────────────────────────────────────────────────────────
// Emotion taxonomy — mirrors DreadlerArenaScreen.tsx exactly.
// HSEmotion's AffectNet 8-class output maps onto these keys 1:1.
// ─────────────────────────────────────────────────────────────────────────────

export type EmotionKey =
  | 'Neutral'
  | 'Happy'
  | 'Sad'
  | 'Surprise'
  | 'Fear'
  | 'Disgust'
  | 'Anger'
  | 'Contempt';

export interface EmotionSet extends Record<EmotionKey, number> {}

export const EMOTION_KEYS: EmotionKey[] = [
  'Neutral',
  'Happy',
  'Sad',
  'Surprise',
  'Fear',
  'Disgust',
  'Anger',
  'Contempt',
];

// AffectNet class-index order used by the published HSEmotion EfficientNet-B0
// weights (indices 0..7). Keep in sync with backend/hsemotion.py.
export const AFFECTNET_CLASS_ORDER: EmotionKey[] = [
  'Neutral',   // 0
  'Happy',     // 1
  'Sad',       // 2
  'Surprise',  // 3
  'Fear',      // 4
  'Disgust',   // 5
  'Anger',     // 6
  'Contempt',  // 7
];

export const NEUTRAL_EMOTIONS: EmotionSet = {
  Neutral: 0.8,
  Happy: 0.05,
  Sad: 0.05,
  Surprise: 0.02,
  Fear: 0.02,
  Disgust: 0.02,
  Anger: 0.02,
  Contempt: 0.02,
};

export function normalizeEmotions(input: EmotionSet): EmotionSet {
  let sum = 0;
  for (const k of EMOTION_KEYS) sum += input[k];
  if (sum <= 0) return { ...NEUTRAL_EMOTIONS };
  const out = {} as EmotionSet;
  for (const k of EMOTION_KEYS) out[k] = input[k] / sum;
  return out;
}
