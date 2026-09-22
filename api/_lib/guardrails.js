// LexForge guardrails — Express-style middleware chain. Pure JS, zero deps.
// Order: requireKey → keyQuota → corsAllowlist → rateLimit30 → blocklistCheck → flagLead → injectDisclaimer.
import { allowByKey, allowJev } from "./keyQuota.js";

export const RATE_LIMIT_MAX = 30;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const DISCLAIMER = "LexForge output is general information only and is not legal advice. Consult a licensed attorney.";
const buckets = new Map(); // key -> { tokens, updated }
export function getAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Resolve the caller identity once so every quota bucket uses the same key. */
export function requestKey(req) {
  // Only use a key after requireKey has authenticated it. Client supplied
  // key headers are not identities: accepting them here lets callers rotate
  // arbitrary values to evade an IP based limiter on public routes.
  const raw = req.apiKey || req.ip || req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "anon";
  return String(raw).split(",")[0].trim() || "anon";
}

export function requireKey(req, res, next) {
  const expected = process.env.LEXFORGE_API_KEY ?? process.env.API_KEY;
  if (!expected) return res.status(500).json({ error: "server_misconfigured" });
  const auth = String(req.headers?.authorization ?? "").replace(/^Bearer /i, "");
  const got = req.headers?.["x-api-key"] ?? req.headers?.["x-lexforge-key"] ?? auth;
  if (!got || got !== expected) return res.status(401).json({ error: "unauthorized" });
  req.apiKey = String(got);
  return next();
}

/** Apply the shared per-key quota before spending a route's provider budget. */
export function keyQuota(req, res, next) {
  const key = requestKey(req);
  let quota;
  try {
    quota = allowByKey(key);
  } catch {
    // A quota failure must not turn a valid request into a server error. The
    // in-memory limiter is an optimization; the route guard remains usable.
    return next();
  }
  req.keyQuota = quota;
  if (quota?.allowed === false) {
    const retryAfter = quota.retryAfter ?? 60;
    res.setHeader?.("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "rate_limited", retry_after: retryAfter });
  }
  return next();
}

// Descriptive alias for callers that prefer the middleware name in a route.
export const quotaByKey = keyQuota;
export function corsAllowlist(req, res, next) {
  const origin = req.headers?.origin;
  if (origin) {
    if (!getAllowedOrigins().includes(origin)) return res.status(403).json({ error: "origin_not_allowed" });
    res.setHeader?.("Access-Control-Allow-Origin", origin);
    res.setHeader?.("Vary", "Origin");
  }
  res.setHeader?.("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader?.("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
}
export function rateLimit30(req, res, next) {
  const key = requestKey(req);
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: RATE_LIMIT_MAX, updated: now };
  b.tokens = Math.min(RATE_LIMIT_MAX, b.tokens + ((now - b.updated) / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_MAX);
  b.updated = now;
  if (b.tokens < 1) {
    res.setHeader?.("Retry-After", "60");
    return res.status(429).json({ error: "rate_limited" });
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return next();
}
function isBlockedHost(h) {
  const host = String(h).toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "metadata.google.internal" || host === "169.254.169.254") return true;
  if (/^(127|10|0)\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^::1$|^::ffff:|^fd|^fe[89ab]/i.test(host)) return true;
  return false;
}
export function blocklistCheck(req, res, next) {
  const raw = req.body?.url ?? req.body?.target ?? req.query?.url;
  if (raw == null) return next();
  let u;
  try { u = new URL(String(raw)); } catch { return res.status(400).json({ error: "invalid_url" }); }
  if (u.protocol !== "http:" && u.protocol !== "https:") return res.status(403).json({ error: "blocked_protocol" });
  if (isBlockedHost(u.hostname)) return res.status(403).json({ error: "blocked_host" });
  return next();
}
export function flagLead(req, res, next) {
  const lead = req.body?.lead;
  if (lead && lead.verified === false && (req.body.assertCitation || req.body.citations)) {
    return res.status(422).json({ error: "unverified_lead_cannot_assert_citation" });
  }
  req.leadFlag = lead ? (lead.verified ? "verified" : "unverified") : "none";
  return next();
}
export function injectDisclaimer(req, res, next) {
  req.disclaimer = DISCLAIMER;
  if (typeof res.json === "function") {
    const orig = res.json.bind(res);
    res.json = (body) => orig(Array.isArray(body) ? { data: body, disclaimer: DISCLAIMER } : { disclaimer: DISCLAIMER, ...(body ?? {}) });
  } else res.setHeader?.("X-LexForge-Disclaimer", DISCLAIMER);
  return next();
}
export const guardrails = [requireKey, keyQuota, corsAllowlist, rateLimit30, blocklistCheck, flagLead, injectDisclaimer];
export function clearRateLimits() { buckets.clear(); }

// --- JEV/Needle chain error codes (A16, additive-only; chain order above untouched) ---
export const chainCodes = {
  chain_degraded: 503,      // JEV unavailable (e.g. missing TYPESAFE_API_KEY); LLM path continues
  jev_low_confidence: 202,  // accepted into human_review queue, not a failure
  jev_bad_shape: 502,       // JEV returned an unusable shape; upstream bad gateway
};
export function chainError(res, code, extra = {}) {
  const status = chainCodes[code] ?? 500;
  const body = { error: code, ...(extra ?? {}) };
  if (code === "jev_low_confidence" && body.queue == null) body.queue = "human_review";
  return res.status(status).json(body);
}
// Optional route-level pre-check: JEV has its own bucket because one JEV call
// can fan into a gated LLM call. Keep this out of the general guardrail array;
// non-JEV routes should not spend JEV budget.
export function jevBudget(req, res, next) {
  const key = req.apiKey || requestKey(req);
  let q;
  try {
    q = allowJev(key);
  } catch {
    // Budget gate must never crash the chain — fail open.
    return next();
  }
  req.jevQuota = q;
  req.jevQuotaKey = key;
  if (q?.allowed === false) {
    const retryAfter = q.retryAfter ?? 60;
    res.setHeader?.("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "jev_budget_exceeded", retry_after: retryAfter });
  }
  return next();
}
