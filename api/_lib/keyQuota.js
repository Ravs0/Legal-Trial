// LexForge Legal-Trial: per-API-key token bucket (additive only, zero deps).
// Limit/window from env, default 30/min to match security.js. Deny => 429 + Retry-After.
// Usage:
//   import { allowByKey } from "../_lib/keyQuota.js";
//   const q = allowByKey(key);
//   if (!q.allowed) { res.setHeader("Retry-After", String(q.retryAfter)); return res.status(429).json({ error: "rate_limited", retry_after: q.retryAfter }); }
//
// JEV budget (A17, additive — allowByKey path untouched):
//   import { allowJev, recordJev, jevUsageSnapshot } from "../_lib/keyQuota.js";
//   const j = allowJev(key);
//   if (!j.allowed) { res.setHeader("Retry-After", String(j.retryAfter)); return res.status(429).json({ error: "rate_limited", retry_after: j.retryAfter }); }
//   ... after the JEV call: recordJev(key, inputTokens);
"use strict";

const buckets = new Map();
const jevBuckets = new Map();
const jevUsage = new Map();

function normalizeKey(key) {
  return key ? String(key).trim() || "anon" : "anon";
}

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
  const k = normalizeKey(key);
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

function jevCfg() {
  const limit = Math.max(1, Number(process.env.JEV_QUOTA_LIMIT) || 120);
  const windowMs = Math.max(1000, Number(process.env.JEV_QUOTA_WINDOW_MS) || 60000);
  const max = Math.max(1, Number(process.env.JEV_QUOTA_MAX_BUCKETS) || 5000);
  return { limit, windowMs, max };
}

function jevKey(key) {
  return normalizeKey(key);
}

function pruneJev(now, windowMs, max) {
  for (const [k, b] of jevBuckets) if (now - b.updated >= windowMs) jevBuckets.delete(k);
  for (const [k, u] of jevUsage) if (now - u.windowStart >= windowMs) jevUsage.delete(k);
  while (jevBuckets.size > max) jevBuckets.delete(jevBuckets.keys().next().value);
  while (jevUsage.size > max) jevUsage.delete(jevUsage.keys().next().value);
}

function jevWindowUsage(key, now, windowMs) {
  const k = jevKey(key);
  const u = jevUsage.get(k);
  if (!u || now - u.windowStart >= windowMs) {
    return { key: k, calls: 0, tokens: 0, windowStart: now, windowMs };
  }
  return { key: k, calls: u.calls, tokens: u.tokens, windowStart: u.windowStart, windowMs };
}

function allowJev(key, now) {
  const { limit, windowMs, max } = jevCfg();
  const t = typeof now === "number" ? now : Date.now();
  const k = jevKey(key);
  let b = jevBuckets.get(k);
  if (!b) { b = { tokens: limit, updated: t }; jevBuckets.set(k, b); }
  const elapsed = Math.max(0, t - b.updated);
  b.tokens = Math.min(limit, b.tokens + (elapsed * limit) / windowMs);
  b.updated = t;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    pruneJev(t, windowMs, max);
    return { allowed: true, remaining: Math.floor(b.tokens), limit };
  }
  const retryAfter = Math.max(1, Math.ceil(((1 - b.tokens) * windowMs) / limit / 1000));
  pruneJev(t, windowMs, max);
  return { allowed: false, status: 429, retryAfter, remaining: 0, limit };
}

function recordJev(key, tokens, now) {
  const { windowMs } = jevCfg();
  const t = typeof now === "number" ? now : Date.now();
  const k = jevKey(key);
  const n = Math.max(0, Math.floor(Number(tokens) || 0));
  let u = jevUsage.get(k);
  if (!u || t - u.windowStart >= windowMs) {
    u = { calls: 0, tokens: 0, windowStart: t };
    jevUsage.set(k, u);
  }
  u.calls += 1;
  u.tokens += n;
  return { key: k, calls: u.calls, tokens: u.tokens, windowStart: u.windowStart, windowMs };
}

function jevUsageSnapshot(key, now) {
  const { windowMs, max } = jevCfg();
  const t = typeof now === "number" ? now : Date.now();
  pruneJev(t, windowMs, max);
  if (key !== undefined && key !== null) return jevWindowUsage(key, t, windowMs);
  const out = {};
  for (const [k, u] of jevUsage) {
    if (t - u.windowStart >= windowMs) continue;
    out[k] = { key: k, calls: u.calls, tokens: u.tokens, windowStart: u.windowStart, windowMs };
  }
  return out;
}

function clearQuotas() {
  buckets.clear();
  jevBuckets.clear();
  jevUsage.clear();
}

export { allowByKey, allowJev, recordJev, jevUsageSnapshot, clearQuotas };
