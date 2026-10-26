// Anonymous session tokens for the public LexForge API.
//
// There are no user accounts. A caller who needs durable owner scoping (scores,
// drills, key metadata, schedules) asks POST /api/lexforge/session for a token
// and sends it as `Authorization: Bearer v1.<payload>.<sig>`. The token is
// stateless and HMAC-SHA256 signed, so an owner id can no longer be forged by
// putting an arbitrary string in the Authorization header.
//
// Secret resolution: LEXFORGE_SESSION_SECRET, then LEXFORGE_KEY. When neither
// is configured (local dev / preview), a per-process random secret is used.
// That is consistent with the in-memory stores these routes already use: a cold
// instance starts with no rows anyway, so tokens are no more instance-bound
// than the data itself. Set the env var in production to keep sessions valid
// across instances.
import crypto from 'node:crypto';

const VERSION = 'v1';
const MAX_TOKEN_CHARS = 512;
const MAX_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;
const OWNER_RE = /^[a-f0-9]{32}$/;

function sessionSecret() {
  const configured = String(
    process.env.LEXFORGE_SESSION_SECRET || process.env.LEXFORGE_KEY || '',
  ).trim();
  if (configured.length >= 16) return configured;
  if (!globalThis.__lfSessionSecret) {
    globalThis.__lfSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalThis.__lfSessionSecret;
}

function sign(payloadB64) {
  return crypto
    .createHmac('sha256', sessionSecret())
    .update(`${VERSION}.${payloadB64}`)
    .digest('base64url');
}

/** Length-safe, constant-time string comparison. */
export function timingSafeEqualText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Extract a bearer token without trusting case/whitespace accidents. */
export function bearerToken(req) {
  const raw = req?.headers?.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return '';
  return value.replace(/^Bearer\s+/i, '').trim();
}

/**
 * Mint a fresh anonymous session.
 * @returns {{ token: string, owner: string, expiresAt: number }}
 */
export function issueSession(options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const requestedTtl = Number(options.ttlSeconds);
  const ttl = Number.isFinite(requestedTtl) && requestedTtl > 0
    ? Math.min(MAX_TTL_SECONDS, Math.floor(requestedTtl))
    : DEFAULT_TTL_SECONDS;
  const owner = crypto.randomBytes(16).toString('hex');
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + ttl;
  const payload = Buffer.from(JSON.stringify({ v: 1, sub: owner, iat, exp }), 'utf8')
    .toString('base64url');
  return {
    token: `${VERSION}.${payload}.${sign(payload)}`,
    owner,
    expiresAt: exp * 1000,
  };
}

/**
 * Verify a session token.
 * @returns {{ owner: string, expiresAt: number } | null}
 */
export function verifySession(token, nowMs = Date.now()) {
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_CHARS) return null;
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payload, signature] = parts;
  if (!payload || !signature) return null;
  if (!timingSafeEqualText(sign(payload), signature)) return null;

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data || data.v !== 1 || typeof data.sub !== 'string' || !OWNER_RE.test(data.sub)) {
    return null;
  }
  if (!Number.isFinite(data.exp) || data.exp <= 0) return null;
  const expiresAt = data.exp * 1000;
  if (expiresAt <= now) return null;
  return { owner: data.sub, expiresAt };
}

/** Resolve the caller's session from the Authorization header, if any. */
export function sessionOf(req) {
  return verifySession(bearerToken(req));
}

/**
 * Require a valid session. On failure writes 401 and returns null; on success
 * sets req.ownerId and returns the session.
 */
export function requireSession(req, res) {
  const session = sessionOf(req);
  if (!session) {
    if (res && typeof res.status === 'function') {
      res.status(401).json({ error: 'unauthorized', code: 'session_required' });
    }
    return null;
  }
  if (req && typeof req === 'object') req.ownerId = session.owner;
  return session;
}

/** True when the request carries the CRON_SECRET service credential. */
export function isServiceRequest(req, envName = 'CRON_SECRET') {
  const expected = String(process.env[envName] || '');
  if (!expected) return false;
  return timingSafeEqualText(bearerToken(req), expected);
}

export const SESSION_LIMITS = Object.freeze({
  maxTokenChars: MAX_TOKEN_CHARS,
  defaultTtlSeconds: DEFAULT_TTL_SECONDS,
  maxTtlSeconds: MAX_TTL_SECONDS,
});
