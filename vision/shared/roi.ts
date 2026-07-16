// ─────────────────────────────────────────────────────────────────────────────
// ROI extraction — turn a <video> frame into one spatially-averaged RGB sample
// for POS, plus (optionally) a cropped face tensor for HSEmotion.
//
// We avoid pulling in a face-detector dependency. Instead we sample a fixed
// forehead+cheek band (where blood-flow color shift is strongest and motion is
// lowest) relative to the central face region. This is the same pragmatic
// shortcut used by many browser rPPG demos; it's robust when the user keeps
// their face roughly centered, which the camera UI nudges them to do.
// ─────────────────────────────────────────────────────────────────────────────

import type { RgbSample } from './types';

/**
 * Extract one averaged RGB sample from the central forehead+cheek band.
 * Uses an internal scratch canvas to read pixels; the canvas is sized once
 * and reused to avoid GC churn at 30fps.
 */
export function extractRoiSample(
  video: HTMLVideoElement | null | undefined,
  scratch: HTMLCanvasElement | null | undefined,
  now: number,
): RgbSample | null {
  if (!video || !scratch || !Number.isFinite(now)) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  // Downsample to a small working canvas — POS only needs the average, so a
  // ~32x32 source is plenty and keeps getImageFeed cheap.
  const W = 32;
  const H = 32;
  if (scratch.width !== W || scratch.height !== H) {
    scratch.width = W;
    scratch.height = H;
  }
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Sample the central band: top third = forehead (avoid hairline by starting
  // a bit below the very top), middle = cheeks/nose bridge. Both are rich in
  // sub-visual vasculature. We draw a horizontal strip from the central column.
  const sx = Math.floor(vw * 0.30);
  const sy = Math.floor(vh * 0.18);
  const sw = Math.floor(vw * 0.40);
  const sh = Math.floor(vh * 0.40);
  try {
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
  } catch {
    return null;
  }

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    return null;
  }

  // Average all pixels, skipping near-transparent ones (defensive).
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 16) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  if (count === 0) return null;
  return { t: now / 1000, r: r / count, g: g / count, b: b / count };
}

/**
 * Capture a 224x224 face crop for HSEmotion (EfficientNet-B0 input size).
 * Returns an ImageData, or null if the video isn't ready.
 */
export function captureFaceCrop(
  video: HTMLVideoElement | null | undefined,
  scratch: HTMLCanvasElement | null | undefined,
): ImageData | null {
  if (!video || !scratch) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const SIZE = 224;
  if (scratch.width !== SIZE || scratch.height !== SIZE) {
    scratch.width = SIZE;
    scratch.height = SIZE;
  }
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Centered square crop covering the face region.
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = Math.max(0, (vh - side) / 2 - side * 0.05); // nudge up to head
  try {
    ctx.drawImage(video, sx, sy, side, side, 0, 0, SIZE, SIZE);
    return ctx.getImageData(0, 0, SIZE, SIZE);
  } catch {
    return null;
  }
}
