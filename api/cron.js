// api/cron.js — consolidated cron dispatcher (single literal function file).
// The three scheduled jobs live in api/_lib/cron/* as plain modules; their
// public URLs are mapped onto this handler by vercel.json rewrites, which turn
// the path segment into a query param:
//   /api/cron/drills    -> /api/cron?job=drills
//   /api/cron/due       -> /api/cron?job=due
//   /api/cron/schedules -> /api/cron?job=schedules
// (Dynamic [..slug].js filenames do NOT create routes on no-framework Vercel
// projects — only literal files do — hence this mapping.)
import drills from "./_lib/cron/drills.js";
import due from "./_lib/cron/due.js";
import schedules from "./_lib/cron/schedules.js";

const JOBS = { drills, due, schedules };

export default async function handler(req, res) {
  const seg = req.query?.job;
  const job = Array.isArray(seg) ? seg[0] : seg;
  const fn = JOBS[job];
  if (!fn) return res.status(404).json({ ok: false, error: "unknown cron job" });
  return fn(req, res);
}
