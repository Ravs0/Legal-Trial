// api/cron/drills.js — Vercel Cron: evening spaced drills (3 due + 2 weakest-skill).
// Hermes jobs.json names reused: id, name, schedule{kind,expr}, schedule_display,
// skills, state, created_at, last_run_at, last_status, last_error.
import crypto from 'node:crypto';
import { isServiceRequest } from '../session.js';

const EXPR = "30 19 * * *";
/** Cap calibration input so the query-string sample cannot pin the function. */
const MAX_CALIBRATION_ROWS = 5_000;
const MAX_CALIBRATION_QUERY_CHARS = 20_000;

// Curriculum + assignment stores are server TODOs: keep this endpoint
// fail-soft (empty drills, 200) until api/_lib/curriculum.js and
// api/_lib/assignments.js land, so the cron never 500s on Vercel.
async function getDueDrills(_n) { return []; }
async function getWeakestDrills(_n) { return []; }
async function saveAssignment(a) { return a; }

// ---- B18 calibration (log-only, never auto-tune) ----
// Nightly job: JEV confidence vs outcomes sample -> threshold RECOMMENDATION.
// Log-only: this job never writes any threshold file/env. Human approval required.
const CALIBRATE_EXPR = "15 3 * * *";
const JEV_CONF_THRESHOLD = 0.6; // seam parity with A14 _lib/lexforge/chain.js
const CALIBRATE_PRECISION_TARGET = 0.8;

// Outcome store is a server TODO (same as curriculum/assignments above):
// fail-soft with an empty sample until the trace/KV store lands.
async function getCalibrationSample() { return []; }

// Pure: { confidence: 0..1, correct: bool } rows (also accepts conf/outcome aliases).
// Invalid rows are dropped and counted, never throw.
function runCalibration(sample, opts = {}) {
  const current = Number(opts.threshold ?? JEV_CONF_THRESHOLD);
  const rows = [];
  let dropped = 0;
  for (const r of (Array.isArray(sample) ? sample.slice(0, MAX_CALIBRATION_ROWS) : [])) {
    const c = Number(r && (r.confidence ?? r.conf));
    const o = r && (r.correct ?? r.outcome);
    if (!Number.isFinite(c) || c < 0 || c > 1 || typeof o !== "boolean") { dropped += 1; continue; }
    rows.push({ confidence: c, correct: o });
  }
  const logOnly = { autoTune: false, note: "log-only; human approval required before any threshold change" };
  if (!rows.length)
    return { n: 0, dropped, threshold: current, recommended: current, changed: false, reason: "no-sample", ...logOnly };
  const n = rows.length;
  const acc = rows.filter((r) => r.correct).length / n;
  const meanConf = rows.reduce((a, r) => a + r.confidence, 0) / n;
  // ECE over 5 equal-width buckets.
  const K = 5;
  const buckets = Array.from({ length: K }, (_, i) => ({ lo: i / K, hi: (i + 1) / K, n: 0, acc: 0, meanConf: 0 }));
  for (const r of rows) {
    const b = buckets[Math.min(K - 1, Math.floor(r.confidence * K))];
    b.n += 1; b.acc += r.correct ? 1 : 0; b.meanConf += r.confidence;
  }
  let ece = 0;
  for (const b of buckets) {
    if (!b.n) continue;
    b.acc = +(b.acc / b.n).toFixed(3); b.meanConf = +(b.meanConf / b.n).toFixed(3);
    ece += (b.n / n) * Math.abs(b.acc - b.meanConf);
  }
  const above = (t) => rows.filter((r) => r.confidence >= t - 1e-9);
  const atT = above(current);
  const precisionAtThreshold = atT.length ? atT.filter((r) => r.correct).length / atT.length : 0;
  const coverage = atT.length / n;
  // Recommend the smallest t in [0.50..0.90] with precision >= target and support.
  const minAbove = Math.min(5, n);
  let recommended = current;
  for (let t = 0.5; t <= 0.9001; t += 0.05) {
    const tR = +t.toFixed(2);
    const ab = above(tR);
    if (ab.length < minAbove) continue;
    if (ab.filter((r) => r.correct).length / ab.length >= CALIBRATE_PRECISION_TARGET) { recommended = tR; break; }
  }
  let reason = "threshold-ok";
  if (recommended !== current) reason = recommended > current ? "recommend-raised" : "recommend-lowered";
  else if (precisionAtThreshold < CALIBRATE_PRECISION_TARGET && atT.length >= minAbove) reason = "below-target-keep";
  return {
    n, dropped,
    accuracy: +acc.toFixed(3), meanConfidence: +meanConf.toFixed(3), ece: +ece.toFixed(3),
    buckets: buckets.map((b) => ({ lo: +b.lo.toFixed(2), hi: +b.hi.toFixed(2), n: b.n, acc: b.acc, meanConf: b.meanConf })),
    threshold: current,
    precisionAtThreshold: +precisionAtThreshold.toFixed(3), coverage: +coverage.toFixed(3),
    recommended, changed: recommended !== current, reason,
    ...logOnly,
  };
}

export { runCalibration, getCalibrationSample, CALIBRATE_EXPR, JEV_CONF_THRESHOLD };

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ state: "error", last_error: "method_not_allowed" });
  // Fail closed: without a secret, anyone could trigger provider-backed work
  // and read the job payload. Vercel Cron sends Authorization: Bearer <secret>.
  if (!process.env.CRON_SECRET)
    return res.status(503).json({ state: "error", last_error: "cron_not_configured" });
  if (!isServiceRequest(req))
    return res.status(401).json({ state: "error", last_error: "unauthorized" });
  try {
    const created_at = new Date().toISOString();
    // B18: nightly calibration branch (log-only). Default path below untouched.
    if (req.query?.mode === "calibrate") {
      let sample = await getCalibrationSample();
      const q = req.query?.sample;
      if (typeof q === "string" && q && q.length <= MAX_CALIBRATION_QUERY_CHARS) {
        try {
          const parsed = JSON.parse(q);
          if (Array.isArray(parsed)) sample = parsed.slice(0, MAX_CALIBRATION_ROWS);
        } catch { /* keep store sample */ }
      }
      const calibration = runCalibration(sample);
      console.log(JSON.stringify({ calibrate: calibration }));
      const job = {
        id: crypto.randomUUID(),
        name: `evening-drills-calibrate-${created_at.slice(0, 10)}`,
        schedule: { kind: "cron", expr: CALIBRATE_EXPR },
        schedule_display: CALIBRATE_EXPR,
        state: "scheduled",
        created_at,
        last_run_at: created_at,
        last_status: "ok",
        calibration,
        autoTune: false,
      };
      return res.status(200).json(job);
    }
    const due = await getDueDrills(3);
    const seen = new Set(due.map((d) => d.id));
    const weak = (await getWeakestDrills(2)).filter((d) => !seen.has(d.id)).slice(0, 2);
    const drills = [...due, ...weak];
    const skills = [...new Set(drills.flatMap((d) => d.skills || (d.skill ? [d.skill] : [])))];
    const assignment = {
      id: crypto.randomUUID(),
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
    console.error('[cron/drills] failed', err?.message || err);
    return res.status(500).json({ state: "error", last_status: "error", last_error: "job_failed" });
  }
};
