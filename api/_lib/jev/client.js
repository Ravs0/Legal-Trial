// A11 — JEV (TypeSafe System One) HTTP client.
//
// Direct-fetch integration (NO @typesafe-ai/sdk — see ~/jarvis/jev-needle/11-client.md
// for the decision record). Zero dependencies, global fetch only, Vercel-safe.
//
// Contract (TEAM-CONTRACT-JEV-NEEDLE.md):
// - POST https://api.typesafe.ai/v1/systemone, Bearer $TYPESAFE_API_KEY.
// - Body { state, model: "jev-latest", questions }. Batch all questions ONE call.
// - Missing key -> { ok:false, code:"chain-degraded" }, never throw, never crash,
//   never log the key. LLM path continues (chain.js degrades on this code).
// - JEV_MOCK=1 -> canned shape for tests, no network.
// - Types: Choice (distribution + confidence), Score (weighted score + confidence),
//   Noul (yes/no probability 0..1, NO confidence field).
//
// Seam for A14 chain.js: `scoreTranscript(transcript, needle)` returns
// { score, dimensions, confidence, tokens } or throws a coded
// `chain-degraded` error (chain catches it via allSettled and degrades).

import { DIMS, GATES, buildDrillQuestions, normalizeQuestions, parseDrillAnswers } from "./questions.js";

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";

/** Default drill dimensions (mirrors chain.js DIMS; A12 questions.js may override). */
export const DEFAULT_DIMS = DIMS;

const DEFAULT_TIMEOUT_MS = 15000;
const EXCERPT_CHARS = 4000;

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** True iff a live key is present. Key comes from env only — never argv/logs. */
export function isJevConfigured() {
  return Boolean(String(process.env.TYPESAFE_API_KEY || "").trim());
}

/** Build the pinned state excerpt (~32k token budget: excerpt, not the session). */
export function buildState(transcript, needle = {}) {
  const excerpt = String(transcript ?? "").slice(0, EXCERPT_CHARS);
  const fields = Object.entries(needle ?? {})
    .slice(0, 20)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)?.slice(0, 300)}`)
    .join("\n");
  return `Transcript excerpt:\n${excerpt}\n\nNeedle-extracted fields:\n${fields || "(none)"}`;
}

/** Default batched Score questions, one per dimension (5 levels each). */
export function buildDefaultQuestions(dims = DEFAULT_DIMS) {
  return Object.fromEntries(
    dims.map((k) => [
      k,
      {
        type: "Score",
        instructions: `Rate the advocate's ${k} in this trial-drill transcript.`,
        criteria: ["poor", "weak", "adequate", "strong", "excellent"],
      },
    ]),
  );
}

/** Canned per-type mock answer for a question definition (no network). */
function mockAnswerFor(def = {}, name = "") {
  const t = String(def.type || "Score").toLowerCase();
  if (t === "choice") {
    const options = def.criteria && typeof def.criteria === "object" && !Array.isArray(def.criteria)
      ? Object.keys(def.criteria)
      : ["a", "b", "c"];
    const choice = options.includes("auto") ? "auto" : options[0];
    const distribution = Object.fromEntries(options.map((option) => [option, option === choice ? 0.8 : 0.2 / Math.max(1, options.length - 1)]));
    return { type: "choice", choice, probabilities: distribution, confidence: 0.72 };
  }
  if (t === "noul") {
    const probability = /needs_escalation|thin_answer/.test(name) ? 0.08 : /cited_authority/.test(name) ? 0.9 : 0.12;
    return { type: "noul", noul: probability };
  }
  // TypeSafe Score uses the level-index scale (five levels => 0..4).
  return { type: "score", score: 2.72, confidence: 0.7 };
}

function num(v, fallback = NaN) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalize one raw JEV answer by declared question type.
 * Lenient on field aliases (exact wire names vary); strict on ranges.
 * Never invents confidence for Noul (JEV returns none) -> confidence: null.
 * Unusable shape -> { type, parseError: true, detail } (never throws).
 */
export function parseAnswer(name, raw, def = {}) {
  const type = def.type || "Unknown";
  if (raw == null || typeof raw !== "object") {
    return { type, parseError: true, detail: `answer '${name}' missing or not an object` };
  }
  const t = String(type).toLowerCase();
  if (t === "choice") {
    const distribution = raw.distribution ?? raw.dist ?? raw.probs ?? raw.probabilities;
    const confidence = num(raw.confidence ?? raw.conf);
    if (!distribution || typeof distribution !== "object" || !Number.isFinite(confidence)) {
      return { type, parseError: true, detail: `Choice '${name}' needs distribution + confidence` };
    }
    return { type: "Choice", distribution, confidence: clamp01(confidence) };
  }
  if (t === "score") {
    const confidence = num(raw.confidence ?? raw.conf);
    if (!Number.isFinite(confidence)) {
      return { type, parseError: true, detail: `Score '${name}' needs confidence` };
    }
    // TypeSafe's Score is a probability-weighted position on the level index
    // scale (0..criteria.length-1), not a 0..1 value. Keep the normalized
    // voter score for LexForge while accepting the local level alias.
    const criteria = Array.isArray(def.criteria)
      ? def.criteria
      : Array.isArray(def.levels) ? def.levels : null;
    const max = Math.max(1, (criteria?.length ?? 5) - 1);
    let score;
    if (raw.level != null) {
      const level = num(raw.level);
      if (!Number.isFinite(level) || level < 0 || level > max) {
        return { type, parseError: true, detail: `Score '${name}' level must be 0..${max}` };
      }
      score = level / max;
    } else {
      const weighted = raw.weighted ?? raw.weighted_score;
      score = weighted != null ? num(weighted) : num(raw.score ?? raw.value ?? raw.rating ?? raw.val);
      if (weighted != null && score >= 0 && score <= 1) {
        // Already normalized compatibility input.
      } else if (Number.isFinite(score) && score >= 0 && score <= max) {
        score /= max;
      }
    }
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      return { type, parseError: true, detail: `Score '${name}' needs a score on 0..${max}` };
    }
    return { type: "Score", score: clamp01(score), confidence: clamp01(confidence) };
  }
  if (t === "noul") {
    if (("confidence" in raw && raw.confidence != null) || ("conf" in raw && raw.conf != null)) {
      return { type, parseError: true, detail: `Noul '${name}' must not carry confidence` };
    }
    const probability = num(raw.noul ?? raw.probability ?? raw.prob ?? raw.p ?? raw.yes_prob ?? raw.yes_probability);
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      return { type, parseError: true, detail: `Noul '${name}' needs probability 0..1` };
    }
    return { type: "Noul", probability, confidence: null };
  }
  return { type, parseError: true, detail: `unknown question type for '${name}'` };
}

/** Normalize a full answers map against the questions map. */
export function parseAnswers(rawAnswers, questions = {}) {
  const out = {};
  for (const [name, def] of Object.entries(questions ?? {})) {
    out[name] = parseAnswer(name, rawAnswers?.[name], def);
  }
  return out;
}

function degraded(reason, extra = {}) {
  return { ok: false, code: "chain-degraded", reason, ...extra };
}

/**
 * ONE batched JEV call. Transport/key failures -> { ok:false, code } (never throw).
 * Throws TypeError ONLY on programmer error (missing state/questions).
 *
 * @param {object} args
 * @param {string} args.state - pinned transcript excerpt (+ Needle fields).
 * @param {object} args.questions - { name: { type, instructions, criteria? } }.
 * @param {string} [args.model] - default "jev-latest".
 * @param {string} [args.apiKey] - override (tests); default env TYPESAFE_API_KEY.
 * @param {function} [args.fetchImpl] - fetch override (tests); default global fetch.
 */
export async function queryJev({ state, questions, model = JEV_MODEL, apiKey, fetchImpl, signal } = {}) {
  if (!state || typeof state !== "string") throw new TypeError("queryJev: state (string) required");
  let normalizedQuestions;
  try { normalizedQuestions = normalizeQuestions(questions); }
  catch (error) { throw new TypeError(`queryJev: ${error.message}`); }
  const boundedState = state.slice(0, 8000);
  // Mock mode first: canned per-type answers, no network, no key needed.
  // (Above the fetch-capability check so JEV_MOCK=1 works even in envs
  // without global fetch — e.g. harnesses that strip fetch to prove no I/O.)
  if (process.env.JEV_MOCK === "1") {
    const answers = {};
    for (const [name, def] of Object.entries(normalizedQuestions)) answers[name] = mockAnswerFor(def, name);
    return { ok: true, mock: true, answers: parseAnswers(answers, normalizedQuestions) };
  }
  const key = String(apiKey ?? process.env.TYPESAFE_API_KEY ?? "").trim();
  if (!key) return degraded("missing-typesafe-key");
  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== "function") return degraded("fetch-unavailable");

  let res;
  try {
    res = await fetchFn(JEV_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ state: boundedState, model, questions: normalizedQuestions }),
      signal: signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (e) {
    return degraded(`jev-network: ${e?.name || "fetch-failed"}`);
  }
  if (!res.ok) {
    // 401/403 almost always means bad/missing key -> same degrade code.
    return degraded(`jev-http-${res.status}`, { status: res.status });
  }
  let body;
  try {
    body = await res.json();
  } catch {
    return degraded("jev-bad-json", { status: res.status });
  }
  const raw = body != null && typeof body === "object" ? (body.answers ?? body) : null;
  if (raw == null || typeof raw !== "object") return degraded("jev-bad-json", { status: res.status });
  return {
    ok: true,
    answers: parseAnswers(raw, normalizedQuestions),
    usage: body.usage ?? null,
  };
}

function codedError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Chain seam (A14): score a drill transcript via ONE batched JEV call.
 * Returns { score, dimensions, confidence, tokens } (all 0..1).
 * Missing key / transport failure -> THROWS coded `chain-degraded` error
 * (chain.js runs this via allSettled and degrades to heuristic+LLM).
 */
export async function scoreTranscript(transcript, needle = {}, opts = {}) {
  if (!transcript || typeof transcript !== "string" || transcript.length < 10) {
    throw codedError("chain-bad-request", "scoreTranscript: transcript required");
  }
  // The drill path has one source of truth for both the wire body and the
  // answer names.  Keep the explicit questions override for low-level client
  // callers (the playground endpoint uses it), but the chain always takes
  // this ten-question contract.
  const drill = opts.questions ? null : buildDrillQuestions(transcript, needle);
  const questions = opts.questions ?? drill.questions;
  const state = drill?.state ?? buildState(transcript, needle);
  const r = await queryJev({ state, questions, model: opts.model, apiKey: opts.apiKey, fetchImpl: opts.fetchImpl, signal: opts.signal });
  if (!r.ok) throw codedError(r.code, `scoreTranscript: ${r.reason}`);
  const parsed = drill ? parseDrillAnswers(r.answers) : null;
  const dims = {};
  let confSum = 0;
  let n = 0;
  const scoreAnswers = drill
    ? DIMS.map((dim) => [`score_${dim}`, parsed?.[`score_${dim}`]])
    : Object.entries(r.answers);
  for (const [name, answer] of scoreAnswers) {
    const a = drill ? answer : answer;
    const score = drill ? a?.value : a?.score;
    if (a?._error || a?.parseError || typeof score !== "number" || typeof a?.confidence !== "number") {
      throw codedError("jev-bad-shape", `scoreTranscript: unusable answer for '${name}'`);
    }
    const dim = drill ? String(name).replace(/^score_/, "") : name;
    dims[dim] = +score.toFixed(3);
    confSum += a.confidence;
    n += 1;
  }
  if (n === 0) throw codedError("jev-bad-shape", "scoreTranscript: empty answers");
  let route = null;
  let gates = null;
  if (drill) {
    const routeAnswer = parsed.route_turn;
    const gateAnswers = Object.fromEntries(GATES.map((gate) => {
      const answer = parsed[`gate_${gate}`];
      return [gate, answer];
    }));
    if (!routeAnswer || routeAnswer._error || typeof routeAnswer.option !== "string") {
      throw codedError("jev-bad-shape", "scoreTranscript: unusable route answer");
    }
    if (!new Set(["auto", "probe", "human_review"]).has(routeAnswer.option)) {
      throw codedError("jev-bad-shape", `scoreTranscript: unknown route '${routeAnswer.option}'`);
    }
    for (const [gate, answer] of Object.entries(gateAnswers)) {
      if (!answer || answer._error || typeof answer.probability !== "number" || answer.probability < 0 || answer.probability > 1) {
        throw codedError("jev-bad-shape", `scoreTranscript: unusable gate answer for '${gate}'`);
      }
    }
    route = routeAnswer.option;
    gates = Object.fromEntries(Object.entries(gateAnswers).map(([gate, answer]) => [gate, answer.probability]));
  }
  const score = +((Object.values(dims).reduce((x, y) => x + y, 0)) / n).toFixed(3);
  const confidence = +(confSum / n).toFixed(3);
  const tokens = Number.isFinite(Number(r.usage?.input_tokens))
    ? Number(r.usage.input_tokens)
    : Math.ceil(state.length / 4);
  return { score, dimensions: dims, confidence, tokens, ...(route ? { route } : {}), ...(gates ? { gates } : {}), ...(r.mock ? { mock: true } : {}) };
}
