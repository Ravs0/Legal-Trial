// api/cron/[...job].js — consolidated cron dispatcher.
// Vercel caps serverless functions per deployment (12 on Hobby), so the three
// scheduled jobs live in api/_lib/cron/* as plain modules and this one entry
// keeps their public URLs intact:
//   /api/cron/drills | /api/cron/due | /api/cron/schedules
import drills from "../_lib/cron/drills.js";
import due from "../_lib/cron/due.js";
import schedules from "../_lib/cron/schedules.js";

const JOBS = { drills, due, schedules };

export default async function handler(req, res) {
  const seg = req.query?.job;
  const job = Array.isArray(seg) ? seg[0] : seg;
  const fn = JOBS[job];
  if (!fn) return res.status(404).json({ ok: false, error: "unknown cron job" });
  return fn(req, res);
}
