// api/cron/schedules.js — Legal-Trial schedules (additive only; TODO: DB persist).
// Reuses Hermes cron/jobs.json field names: schedule{kind,expr,display}, schedule_display, enabled, state, created_at, deliver.
const STORE = (globalThis.__lfSchedules ||= []); // TODO: DB (KV/Postgres)
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
module.exports = async (req, res) => {
  if (req.method === "GET") {
    const user_id = req.query && req.query.user_id;
    if (!user_id) return send(res, 400, { error: "user_id required" });
    return send(res, 200, { schedules: STORE.filter((j) => j.user_id === user_id) });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "method not allowed" });
  }
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { return send(res, 400, { error: "invalid JSON" }); } }
  const { user_id, kind, schedule, payload = null, deliver = "origin" } = b;
  if (!user_id || typeof user_id !== "string") return send(res, 400, { error: "user_id required" });
  if (!KINDS.has(kind)) return send(res, 400, { error: "kind must be drill|due|checkin|cohort" });
  if (!schedule || schedule.kind !== "cron" || !cronOk(schedule.expr)) return send(res, 400, { error: "schedule.expr must be 5-field cron" });
  const now = new Date().toISOString();
  const expr = schedule.expr.trim();
  const job = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    user_id, kind, payload, deliver,
    schedule: { kind: "cron", expr, display: expr },
    schedule_display: expr,
    enabled: true, state: "scheduled", created_at: now,
  };
  STORE.push(job);
  return send(res, 201, { schedule: job });
};
