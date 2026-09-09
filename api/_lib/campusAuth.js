'use strict';
// LexForge Legal-Trial: campus-scoped Bearer auth. Zero deps (node:crypto only).
const crypto = require('crypto');
const GRANTS = new Set(['scorer:status', 'coach:dispatch', 'coach:approve']);
const allowlist = () => (process.env.LEXFORGE_CAMPUS_ALLOWLIST || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
function safeEqual(a, b) { // timing-safe compare (hmac.compare_digest equiv), fail-closed
  if (!a || !b) return false;
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
const bearerOf = (req) => ((req.headers || {})['authorization'] || '').replace(/^Bearer\s+/i, '');
const campusOf = (req) => (req.headers || {})['x-lexforge-campus']
  || (req.headers || {})['x-campus'] || ((req.query || {}).campus || '').toString().trim();
function deny(res, code, error) {
  if (res && typeof res.status === 'function') return res.status(code).json({ ok: false, error });
  if (res) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: false, error })); }
  return { ok: false, error };
}
function requireCampus(requiredScope) { // e.g. requireCampus('coach:dispatch')
  return (req, res, next) => {
    if (!GRANTS.has(requiredScope)) return deny(res, 403, 'unknown_scope');
    if (!safeEqual(bearerOf(req), process.env.LEXFORGE_KEY)) return deny(res, 401, 'unauthorized');
    const campus = campusOf(req), list = allowlist();
    if (!campus || !list.includes(campus)) return deny(res, 403, 'campus_denied');
    req.campus = campus; req.scope = requiredScope;
    return typeof next === 'function' ? next() : { ok: true, campus, scope: requiredScope };
  };
}
// Stubs: wire to a grant store later; fail-closed (deny by default).
const refreshGrant = () => ({ ok: false, error: 'stub: refresh not implemented' });
const revokeGrant = () => ({ ok: false, error: 'stub: revoke not implemented' });
module.exports = { requireCampus, refreshGrant, revokeGrant, GRANTS };
