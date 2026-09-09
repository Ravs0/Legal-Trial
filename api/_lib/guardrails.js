// LexForge guardrails — Express-style middleware chain. Pure JS, zero deps.
// Order: requireKey → corsAllowlist → rateLimit30 → blocklistCheck → flagLead → injectDisclaimer.
export const RATE_LIMIT_MAX = 30;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const DISCLAIMER = "LexForge output is general information only and is not legal advice. Consult a licensed attorney.";
const buckets = new Map(); // key -> { tokens, updated }
export function getAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
export function requireKey(req, res, next) {
  const expected = process.env.LEXFORGE_API_KEY ?? process.env.API_KEY;
  if (!expected) return res.status(500).json({ error: "server_misconfigured" });
  const auth = String(req.headers?.authorization ?? "").replace(/^Bearer /i, "");
  const got = req.headers?.["x-api-key"] ?? req.headers?.["x-lexforge-key"] ?? auth;
  if (!got || got !== expected) return res.status(401).json({ error: "unauthorized" });
  return next();
}
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
  const key = req.headers?.["x-api-key"] ?? req.ip ?? req.socket?.remoteAddress ?? "anon";
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
export const guardrails = [requireKey, corsAllowlist, rateLimit30, blocklistCheck, flagLead, injectDisclaimer];
export function clearRateLimits() { buckets.clear(); }
