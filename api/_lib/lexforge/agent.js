// api/lexforge/agent — practice-by-text bridge for Open Instinct agents.
// Server-to-server only (no CORS). Two ways in:
//   POST, `Authorization: Bearer <LEXFORGE_AGENT_KEY>`, body {action, learner, ...};
//   GET ?t=<learner token>&action=..., for Open Instinct's web_fetch, which can
//   only GET without headers. A token is `<learner>.<hmac>` signed with
//   LEXFORGE_AGENT_KEY (scripts/agent-token.mjs), so it reaches that learner's
//   drills only; rotating the key revokes every token.
// Learner ids are opaque, never a phone number or email. Scoring reuses chain.js heuristic() so text practice
// agrees with in-app chain scoring; no LLM call, so it works without provider
// keys. Progress is in-memory per instance, like drills.js and scores.js.
// Design: docs/superpowers/specs/2026-10-27-lexforge-open-instinct-bridge-design.md
import { createHmac, timingSafeEqual } from "node:crypto";
import { heuristic } from "./chain.js";
import { AGENT_DRILLS, MODES, findDrill } from "./agentDrills.js";
import { allowRequest, enforceBodyLimit, validText, clientError } from "../security.js";
import { DISCLAIMER } from "../guardrails.js";

export const MIN_WORDS = 15;
export const MAX_ANSWER_CHARS = 6000;
export const REPLY_MAX = 600;

const ATTEMPTS = (global.__lfAgentAttempts ||= new Map()); // learner -> [{drill_id, score, dimensions, ts}]

const LABELS = {
  clarity: "clarity",
  reasoning: "reasoning",
  authority: "use of authority",
  rebuttal: "rebuttal",
  delivery: "delivery",
};

const TIPS = {
  clarity: "Lead with your ask, then give two or three reasons in plain sentences.",
  reasoning: "Link each point to the next with because, therefore or however, and end on a conclusion.",
  authority: "Name the provision or case you rely on and say in one line what it held.",
  rebuttal: "Quote the other side's point, then distinguish it before making your own.",
  delivery: "Write it as you would say it aloud: short sentences, no filler, one idea each.",
};

function sec(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
}

const LEARNER_RE = /^[A-Za-z0-9_-]{1,64}$/;

function safeEqual(got, expected) {
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(learner, key) {
  return createHmac("sha256", key).update(`lexforge-agent:${learner}`).digest("base64url").slice(0, 32);
}

export function learnerToken(learner, key = process.env.LEXFORGE_AGENT_KEY) {
  if (!key) throw new Error("LEXFORGE_AGENT_KEY is not set");
  if (!LEARNER_RE.test(learner)) throw new Error("learner must be 1-64 of A-Z a-z 0-9 _ -");
  return `${learner}.${sign(learner, key)}`;
}

function bearerOk(req, key) {
  const h = String(req.headers?.authorization || "");
  return safeEqual(h.startsWith("Bearer ") ? h.slice(7).trim() : "", key);
}

// Learner id from a GET token, or null when the token is missing or forged.
function tokenLearner(token, key) {
  if (typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  const learner = token.slice(0, dot);
  if (dot < 1 || !LEARNER_RE.test(learner)) return null;
  return safeEqual(token.slice(dot + 1), sign(learner, key)) ? learner : null;
}

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

function clip(text) {
  return text.length <= REPLY_MAX ? text : `${text.slice(0, REPLY_MAX - 1).trimEnd()}…`;
}

function withDisclaimer(text) {
  const room = REPLY_MAX - DISCLAIMER.length - 1;
  const body = text.length <= room ? text : `${text.slice(0, room - 1).trimEnd()}…`;
  return `${body} ${DISCLAIMER}`;
}

function attemptsOf(learner) {
  return ATTEMPTS.get(learner) || [];
}

function weakestDimension(rows) {
  if (!rows.length) return null;
  const totals = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.dimensions)) totals[k] = (totals[k] || 0) + v;
  return Object.entries(totals).sort((a, b) => a[1] - b[1])[0][0];
}

export function nextDrill(learner, mode) {
  const pool = AGENT_DRILLS.filter((d) => !mode || d.mode === mode);
  const rows = attemptsOf(learner);
  const done = new Set(rows.map((r) => r.drill_id));
  const fresh = pool.find((d) => !done.has(d.id));
  if (fresh) return fresh;
  const weak = weakestDimension(rows);
  return pool.find((d) => d.skill === weak) || pool[0];
}

export function scoreAnswer(text) {
  const { score, dimensions } = heuristic(text);
  const ranked = Object.entries(dimensions).sort((a, b) => b[1] - a[1]);
  const strongest = ranked[0][0];
  const weakest = ranked.slice(-2).reverse().map(([k]) => k);
  const feedback = weakest.map((k) => `${LABELS[k]}: ${TIPS[k]}`);
  return { score: Math.round(score * 100), dimensions, strongest, weakest, feedback };
}

function drillAction(learner, body) {
  const mode = MODES.includes(body.mode) ? body.mode : undefined;
  const d = nextDrill(learner, mode);
  const drill = { id: d.id, mode: d.mode, skill: d.skill, prompt: d.prompt };
  return { status: 200, body: { drill, reply: clip(`Drill (${LABELS[d.skill]}): ${d.prompt} Reply with your argument.`) } };
}

function answerAction(learner, body) {
  const drill = findDrill(body.drill_id);
  if (!drill) return { status: 400, body: clientError("unknown drill_id") };
  if (!validText(body.text, MAX_ANSWER_CHARS)) {
    return { status: 400, body: clientError(`text required, at most ${MAX_ANSWER_CHARS} characters`) };
  }
  const words = body.text.split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS) {
    return {
      status: 200,
      body: {
        drill_id: drill.id,
        score: null,
        reply: clip(`That's ${words} words. Give me at least ${MIN_WORDS} so there is an argument to score.`),
      },
    };
  }
  const s = scoreAnswer(body.text);
  const rows = attemptsOf(learner);
  rows.push({ drill_id: drill.id, score: s.score, dimensions: s.dimensions, ts: Date.now() });
  ATTEMPTS.set(learner, rows);
  const reply = withDisclaimer(
    `Score ${s.score}/100. Strongest: ${LABELS[s.strongest]}. Work on ${s.feedback[0]} Text "next" for another drill.`,
  );
  return {
    status: 200,
    body: { drill_id: drill.id, score: s.score, dimensions: s.dimensions, feedback: s.feedback, reply },
  };
}

function progressAction(learner) {
  const rows = attemptsOf(learner);
  if (!rows.length) {
    return {
      status: 200,
      body: { attempts: 0, average: null, best: null, weakest: null, reply: 'No drills yet. Text "drill" to start one.' },
    };
  }
  const scores = rows.map((r) => r.score);
  const average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const best = Math.max(...scores);
  const weakest = weakestDimension(rows);
  const reply = clip(
    `${rows.length} drill${rows.length === 1 ? "" : "s"} done. Average ${average}/100, best ${best}. Weakest area: ${LABELS[weakest]}. ${TIPS[weakest]}`,
  );
  return { status: 200, body: { attempts: rows.length, average, best, weakest, reply } };
}

const ACTIONS = { drill: drillAction, answer: answerAction, progress: progressAction };

export default async function agent(req, res) {
  sec(res);
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const key = process.env.LEXFORGE_AGENT_KEY;
  if (!key) return res.status(503).json(clientError("agent_not_configured"));
  let body;
  let learner;
  if (req.method === "GET") {
    const q = req.query || {};
    learner = tokenLearner(first(q.t), key);
    if (!learner) return res.status(401).json({ error: "unauthorized" });
    body = { action: first(q.action), drill_id: first(q.drill_id), text: first(q.text), mode: first(q.mode) };
  } else {
    if (!bearerOk(req, key)) return res.status(401).json({ error: "unauthorized" });
    if (!enforceBodyLimit(req, res, 32 * 1024)) return;
    body = req.body && typeof req.body === "object" ? req.body : {};
    if (!validText(body.learner, 128) || !body.learner.trim()) {
      return res.status(400).json(clientError("learner id required"));
    }
    learner = body.learner.trim();
  }
  if (!allowRequest(req, { limit: 30, windowMs: 60_000, keyPrefix: "lexforge-agent:" })) {
    return res.status(429).json(clientError("Too many requests. Please wait a minute and try again."));
  }
  const run = ACTIONS[body.action];
  if (!run) return res.status(400).json(clientError("action must be drill, answer or progress"));
  const out = run(learner, body);
  return res.status(out.status).json(out.body);
}
