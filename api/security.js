// Shared safeguards for public Vercel function entry points. These controls are
// deliberately small and dependency-free so they also work in local development.

const DEV_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]);

const buckets = new Map();

function allowedOrigins() {
  return new Set([
    ...DEV_ORIGINS,
    ...(process.env.ALLOWED_ORIGINS || process.env.APP_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]);
}

export function applyCors(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers.origin;
  // Same-origin requests normally have no Origin header and remain valid.
  if (origin && !allowedOrigins().has(origin)) return false;

  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

export function allowRequest(req, { limit, windowMs }) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  const now = Date.now();
  const current = buckets.get(ip);
  const bucket = !current || now - current.startedAt >= windowMs
    ? { startedAt: now, count: 0 }
    : current;
  bucket.count += 1;
  buckets.set(ip, bucket);
  return bucket.count <= limit;
}

export function clampNumber(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function validText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength;
}
