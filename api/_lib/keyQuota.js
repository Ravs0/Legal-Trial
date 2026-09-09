// LexForge Legal-Trial: per-API-key token bucket (additive only, zero deps).
// Limit/window from env, default 30/min to match security.js. Deny => 429 + Retry-After.
// Usage:
//   const { allowByKey } = require("../_lib/keyQuota");
//   const q = allowByKey(key);
//   if (!q.allowed) { res.setHeader("Retry-After", String(q.retryAfter)); return res.status(429).json({ error: "rate_limited", retry_after: q.retryAfter }); }
"use strict";

const buckets = new Map();

function cfg() {
  const limit = Math.max(1, Number(process.env.KEY_QUOTA_LIMIT) || 30);
  const windowMs = Math.max(1000, Number(process.env.KEY_QUOTA_WINDOW_MS) || 60000);
  const max = Math.max(1, Number(process.env.KEY_QUOTA_MAX_BUCKETS) || 5000);
  return { limit, windowMs, max };
}

function prune(now, windowMs, max) {
  for (const [k, b] of buckets) if (now - b.updated >= windowMs) buckets.delete(k);
  while (buckets.size > max) buckets.delete(buckets.keys().next().value);
}

function allowByKey(key, now) {
  const { limit, windowMs, max } = cfg();
  const t = typeof now === "number" ? now : Date.now();
  const k = key ? String(key).trim() || "anon" : "anon";
  let b = buckets.get(k);
  if (!b) { b = { tokens: limit, updated: t }; buckets.set(k, b); }
  const elapsed = Math.max(0, t - b.updated);
  b.tokens = Math.min(limit, b.tokens + (elapsed * limit) / windowMs);
  b.updated = t;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    prune(t, windowMs, max);
    return { allowed: true, remaining: Math.floor(b.tokens), limit };
  }
  const retryAfter = Math.max(1, Math.ceil(((1 - b.tokens) * windowMs) / limit / 1000));
  prune(t, windowMs, max);
  return { allowed: false, status: 429, retryAfter, remaining: 0, limit };
}

module.exports = { allowByKey };
