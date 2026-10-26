// api/cron/schedules.js — Legal-Trial schedules (additive only; TODO: DB persist).
// Reuses Hermes cron/jobs.json field names: schedule{kind,expr,display}, schedule_display, enabled, state, created_at, deliver.
//
// Access: a browser caller must present a signed session token; the stored
// `user_id` is then the session owner, not whatever the body claims. A cron
// worker presenting CRON_SECRET is a service caller and may address any
// user_id (the job genuinely needs cross-user reads).
import { applyCors, allowRequest, clientError, enforceBodyLimit } from "../security.js";
import { isServiceRequest, requireSession } from "../session.js";
import { cleanId, pushBounded } from "../boundedStore.js";

const STORE = (globalThis.__lfSchedules ||= []); // TODO: DB (KV/Postgres)
const MAX_ROWS = 5_000;
const KINDS = new Set(["drill", "due", "checkin", "cohort"]);

function cronOk(e) {
  if (typeof e !== "string") return false;
  const p = e.trim().split(/\s+/);
  return p.length === 5 && p.every((f) => /^(\*|[\d,/*-]+)$/.test(f));
}

function send(res, code, obj) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  return res.status(code).json(obj);
}

function bodyOf(req) {
  let b = req.body || {};
  if (typeof b === "string") {
    try {
      b = JSON.parse(b);
    } catch {
      return null;
    }
  }
  return b && typeof b === "object" && !Array.isArray(b) ? b : null;
}

export default async (req, res) => {
  if (!applyCors(req, res, "GET, POST, OPTIONS", "Content-Type, Authorization")) {
    return send(res, 403, { error: "Origin is not allowed." });
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!allowRequest(req, { limit: 30, windowMs: 60_000, keyPrefix: "schedules:" })) {
    return send(res, 429, { error: "Too many requests. Please wait a minute and try again." });
  }

  const service = isServiceRequest(req);
  let owner = null;
  if (service) {
    owner = null;
  } else {
    const session = requireSession(req, res);
    if (!session) return;
    owner = session.owner;
  }

  if (req.method === "GET") {
    // A session always reads its own bucket; a stray user_id cannot redirect
    // the query. A service caller must name the user it is acting for.
    const requested = cleanId(req.query?.user_id, 128);
    const user_id = service ? requested : owner;
    if (!user_id) return send(res, 400, { error: "user_id required" });
    return send(res, 200, { schedules: STORE.filter((j) => j.user_id === user_id) });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return send(res, 405, { error: "method not allowed" });
  }

  if (!enforceBodyLimit(req, res)) return;
  const b = bodyOf(req);
  if (!b) return send(res, 400, { error: "invalid JSON" });

  const requestedOwner = cleanId(b.user_id, 128);
  // A session may only write to its own bucket; a service worker must name one.
  const user_id = service ? requestedOwner : owner;
  if (!user_id) return send(res, 400, { error: "user_id required" });
  if (!KINDS.has(b.kind)) return send(res, 400, { error: "kind must be drill|due|checkin|cohort" });
  if (!b.schedule || b.schedule.kind !== "cron" || !cronOk(b.schedule.expr)) {
    return send(res, 400, { error: "schedule.expr must be 5-field cron" });
  }
  const deliver = cleanId(b.deliver, 64) || "origin";
  // Bound the stored payload: 5,000 rows x an unbounded 256 KiB body would be
  // a warm-instance memory DoS all by itself.
  let payload = b.payload ?? null;
  if (payload !== null) {
    try {
      if (JSON.stringify(payload).length > 4_096) {
        return send(res, 413, { error: "payload must be at most 4096 characters" });
      }
    } catch {
      return send(res, 400, { error: "payload must be JSON-serializable" });
    }
  }
  const now = new Date().toISOString();
  const expr = b.schedule.expr.trim();
  const job = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    user_id, kind: b.kind, payload, deliver,
    schedule: { kind: "cron", expr, display: expr },
    schedule_display: expr,
    enabled: true, state: "scheduled", created_at: now,
  };
  pushBounded(STORE, job, MAX_ROWS);
  return send(res, 201, { schedule: job });
};
