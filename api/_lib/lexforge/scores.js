// api/_lib/lexforge/scores.js — owner-scoped trial scores (Legal-Trial).
//
// Owner identity comes from a signed session token (POST /api/lexforge/session),
// never from a caller-supplied bearer string. Rows are still process-global
// until the DB store lands, so both the total row count and per-owner history
// are hard-capped to keep a warm instance from being grown without limit.
import { applyCors, allowRequest, clientError, enforceBodyLimit } from "../security.js";
import { requireSession } from "../session.js";
import { cleanId, pushBounded, trimOwner } from "../boundedStore.js";

const S = (globalThis.__lfScores ||= []);
const MAX_ROWS = 5_000;
const MAX_ROWS_PER_OWNER = 1_000;
const RATE_LIMIT = 60;

function sec(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
}

function bodyOf(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export default async (req, res) => {
  sec(res);
  if (!applyCors(req, res, "GET, POST, OPTIONS", "Content-Type, Authorization")) {
    return res.status(403).json(clientError("Origin is not allowed."));
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!allowRequest(req, { limit: RATE_LIMIT, windowMs: 60_000, keyPrefix: "scores:" })) {
    return res.status(429).json(clientError("Too many requests. Please wait a minute and try again."));
  }

  const session = requireSession(req, res);
  if (!session) return;
  const uid = session.owner;

  if (req.method === "GET") {
    const sessionId = cleanId(req.query?.session_id, 128);
    const drillId = cleanId(req.query?.drill_id, 128);
    const rows = S.filter((r) => r.owner === uid
      && (!sessionId || r.session_id === sessionId)
      && (!drillId || r.drill_id === drillId));
    return res.status(200).json({ scores: rows });
  }

  if (req.method === "POST") {
    if (!enforceBodyLimit(req, res)) return;
    const { session_id, drill_id, points } = bodyOf(req);
    const sessionId = cleanId(session_id, 128);
    const drillId = cleanId(drill_id, 128);
    if (!sessionId || !drillId || typeof points !== "number" || !Number.isFinite(points)) {
      return res.status(400).json({ error: "session_id, drill_id, points required" });
    }
    const row = { owner: uid, session_id: sessionId, drill_id: drillId, points, ts: Date.now() };
    pushBounded(S, row, MAX_ROWS);
    trimOwner(S, uid, MAX_ROWS_PER_OWNER);
    return res.status(201).json({ score: row });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
};
