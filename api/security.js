// Shared safeguards for public Vercel function entry points. These controls are
// deliberately small and dependency-free so they also work in local development.

const DEV_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173',
]);

/** Default JSON body budget for non-media routes (~256 KiB). */
export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

/** Shared upstream timeout for provider fetches (ms). */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 25_000;

const buckets = new Map();
const MAX_BUCKETS = 5_000;

function allowedOrigins() {
  return new Set([
    ...DEV_ORIGINS,
    ...(process.env.ALLOWED_ORIGINS || process.env.APP_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]);
}

/**
 * Apply CORS headers for an allow-listed Origin (or same-origin / no Origin).
 * Returns false when the request Origin is present and not allowed — caller
 * should respond 403 without reflecting that origin.
 *
 * Never sets Access-Control-Allow-Credentials (keep credentialless).
 */
export function applyCors(req, res, methods = 'POST, OPTIONS', headers = 'Content-Type') {
  const origin = req.headers.origin;
  // Same-origin requests normally have no Origin header and remain valid.
  if (origin && !allowedOrigins().has(origin)) return false;

  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', headers);
  // Explicitly do not set Access-Control-Allow-Credentials.
  return true;
}

/** Evict expired rate-limit buckets; cap map size to avoid warm-instance leak. */
function pruneBuckets(now, windowMs) {
  if (buckets.size < MAX_BUCKETS / 2) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.startedAt >= windowMs) buckets.delete(key);
  }
  // Hard cap: drop oldest if still over limit (Map preserves insertion order).
  while (buckets.size >= MAX_BUCKETS) {
    const first = buckets.keys().next().value;
    if (first === undefined) break;
    buckets.delete(first);
  }
}

/**
 * Fixed-window per-IP rate limit (in-memory; per warm instance on Vercel).
 * Optional keyPrefix isolates buckets by route (e.g. 'caselaw:') so traffic
 * to one handler does not exhaust another route's budget.
 */
export function allowRequest(req, { limit, windowMs, keyPrefix = '' }) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  const prefix = typeof keyPrefix === 'string'
    ? keyPrefix.slice(0, 64).replace(/[^\w:.-]/g, '')
    : '';
  const key = `${prefix}${ip}`;
  const now = Date.now();
  pruneBuckets(now, windowMs);
  const current = buckets.get(key);
  const bucket = !current || now - current.startedAt >= windowMs
    ? { startedAt: now, count: 0 }
    : current;
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count <= limit;
}

export function clampNumber(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function validText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength;
}

/**
 * Client-safe error payload. Never include stacks, provider bodies, or raw
 * exception messages. Log those server-side instead.
 */
export function clientError(message, extra = {}) {
  return { error: message, ...extra };
}

/**
 * Estimate request body size from Content-Length (when present) or a
 * already-parsed/string body. Returns null when size cannot be determined.
 */
export function estimateBodyBytes(req) {
  const raw = req.headers?.['content-length'];
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const body = req.body;
  if (body == null) return 0;
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  if (Buffer.isBuffer(body)) return body.length;
  try {
    return Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Reject oversized bodies early. Returns true when the request is within limit.
 * On failure, writes 413 and returns false.
 */
export function enforceBodyLimit(req, res, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const size = estimateBodyBytes(req);
  if (size != null && size > maxBytes) {
    res.status(413).json(clientError('Request body is too large.'));
    return false;
  }
  return true;
}

/**
 * fetch with AbortController timeout. Throws AbortError on timeout.
 */
export async function fetchWithTimeout(url, init = {}, timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sanitize a short upstream error string for optional logging-only use.
 * Prefer not sending this to clients at all.
 */
export function sanitizeProviderSnippet(text, maxLen = 160) {
  if (!text || typeof text !== 'string') return '';
  const clipped = text.replace(/\s+/g, ' ').trim().slice(0, maxLen);
  if (/api[-_ ]?key|subscription|unauthorized|token|secret|stack|traceback/i.test(clipped)) {
    return '[redacted provider message]';
  }
  return clipped;
}
