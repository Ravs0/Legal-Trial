// api/cron/drills.js — Vercel Cron: evening spaced drills (3 due + 2 weakest-skill).
// Hermes jobs.json names reused: id, name, schedule{kind,expr}, schedule_display,
// skills, state, created_at, last_run_at, last_status, last_error.
const { randomUUID } = require("crypto");

const EXPR = "30 19 * * *";

module.exports = async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ state: "error", last_error: "method_not_allowed" });
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ state: "error", last_error: "unauthorized" });
  try {
    const { getDueDrills, getWeakestDrills } = require("../_lib/curriculum");
    const { saveAssignment } = require("../_lib/assignments");
    const created_at = new Date().toISOString();
    const due = await getDueDrills(3);
    const seen = new Set(due.map((d) => d.id));
    const weak = (await getWeakestDrills(2)).filter((d) => !seen.has(d.id)).slice(0, 2);
    const drills = [...due, ...weak];
    const skills = [...new Set(drills.flatMap((d) => d.skills || (d.skill ? [d.skill] : [])))];
    const assignment = {
      id: randomUUID(),
      name: `evening-drills-${created_at.slice(0, 10)}`,
      schedule: { kind: "cron", expr: EXPR },
      schedule_display: EXPR,
      skills,
      state: "scheduled",
      created_at,
      last_run_at: created_at,
      last_status: "ok",
      drills,
    };
    await saveAssignment(assignment);
    return res.status(200).json(assignment);
  } catch (err) {
    return res.status(500).json({ state: "error", last_status: "error", last_error: String((err && err.message) || err) });
  }
};
