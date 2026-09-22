// A14 — LexForge sequential chain orchestrator with early exit.
//
// Needle-extract (explicit fields, free, local — arrives as JSON input) ->
// ONE batched JEV step after the local heuristic -> confidence gate -> LLM
// judge ONLY on gated turns.
//
// Lives under api/_lib (never a routed function; the dispatcher in
// api/lexforge.js calls runChain). Extends score.js thresholds, never forks
// score.js itself (heuristic/llmJudge are mirrored below because score.js
// only exports its HTTP handler).
//
// Missing TYPESAFE_API_KEY -> degrade to heuristic+LLM with code
// "chain-degraded". Never crash, never block drills on JEV absence.

import { DIMS } from "../jev/questions.js";
import { fromSidecar } from "../needle/schemas.js";

export const W_H = 0.3; // heuristic weight (score.js parity)
export const W_JEV = 0.7; // JEV weight on the early-exit path
export const W_LLM = 0.7; // LLM weight on the gated path (score.js parity)
export const ABSTAIN_GAP = 0.3; // score.js parity
export const JEV_CONF_THRESHOLD = 0.6; // below -> human_review (sticky)

const clamp = (x) => Math.max(0, Math.min(1, x));

// Heuristic port (score.js parity): keyword/coverage/length signals, 0..1.
export function heuristic(transcript) {
  const t = transcript || "";
  const n = t.split(/\s+/).filter(Boolean).length;
  const hits = (re) => (t.match(re) || []).length;
  const dimensions = {
    clarity: clamp(0.4 + n / 800 - hits(/\bum\b|\buh\b|like,|you know/gi) * 0.05),
    reasoning: clamp(
      0.25 +
        hits(/because|therefore|however|it follows|given that/gi) * 0.12 +
        hits(/issue|rule|application|conclusion/gi) * 0.08,
    ),
    authority: clamp(
      0.15 + hits(/ v\.| vs\.|AIR|SCC|section|article|§|precedent|held that/gi) * 0.15,
    ),
    rebuttal: clamp(
      0.2 + hits(/objection|overruled|sustained|distinguish|rebuttal|cross-examin/gi) * 0.18,
    ),
    delivery: clamp(0.5 + n / 1200 - hits(/\?\?+|!!+/g) * 0.1),
  };
  const score = DIMS.reduce((a, k) => a + dimensions[k], 0) / DIMS.length;
  return { score: +score.toFixed(3), dimensions };
}

// LLM judge (score.js parity): temp 0, JSON out.
export async function llmJudge(transcript, rubric_version = "v1", phase = "trial", signal) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.LF_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are LexForge trial judge. Rubric ${rubric_version}, phase ${phase}. Score 0..1. Return JSON only: {"score":0..1,"dimensions":{"clarity":0..1,"reasoning":0..1,"authority":0..1,"rebuttal":0..1,"delivery":0..1}}.`,
        },
        { role: "user", content: transcript.slice(0, 12000) },
      ],
    }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`llm ${res.status}`);
  const j = await res.json();
  const o = JSON.parse(j.choices[0].message.content);
  const dimensions = Object.fromEntries(
    DIMS.map((k) => [k, clamp(Number(o.dimensions?.[k] ?? o[k] ?? 0))]),
  );
  return { score: clamp(Number(o.score)), dimensions };
}

// Default JEV voter: ONE batched System One call using the ten-question
// drill contract (Choice + five Score + four Noul questions, one round-trip).
// A11/A12's client owns that wire path; this chain only consumes its voter
// result.
export async function defaultJev(transcript, needle = {}, opts = {}) {
  // Keep one JEV integration. The client owns key lookup, mock mode, request
  // shape, timeout, and answer parsing; this chain only consumes its voter
  // shape. In particular, do not preflight the key here: JEV_MOCK must work
  // without a production key, while a missing live key degrades coherently.
  try {
    const m = await import("../jev/client.js");
    if (typeof m.scoreTranscript === "function") return m.scoreTranscript(transcript, needle, opts);
  } catch (cause) {
    const e = new Error("JEV client unavailable", { cause });
    e.code = "chain-degraded";
    throw e;
  }
  const e = new Error("JEV client unavailable");
  e.code = "chain-degraded";
  throw e;
}

const blendDims = (a, wa, b, wb) =>
  Object.fromEntries(DIMS.map((k) => [k, +((a.dimensions[k] * wa + b.dimensions[k] * wb).toFixed(3))]));
const blendScore = (a, wa, b, wb) => +((a.score * wa + b.score * wb).toFixed(3));

function normalizeNeedleInput(needle) {
  if (!needle || typeof needle !== "object" || Array.isArray(needle)) {
    return { fields: {}, escalate: false, code: null };
  }
  const looksLikeSidecar = [
    "ok", "authority", "turn_facts", "authority_status", "cited_status",
  ].some((key) => Object.hasOwn(needle, key));
  if (!looksLikeSidecar) {
    return {
      fields: needle,
      escalate: needle.escalate === true,
      code: needle.escalate === true ? "EXTRACTION_UNGROUNDED" : null,
    };
  }
  try {
    const side = fromSidecar(needle);
    const fields = {
      ...(side.authority ? { authority: side.authority } : {}),
      ...(side.turnFacts ? { turnFacts: side.turnFacts } : {}),
    };
    return {
      fields,
      escalate: side.escalate === true || side.ok !== true,
      code: side.codes?.[0] || side.code || (side.ok ? null : "EXTRACTION_UNGROUNDED"),
    };
  } catch {
    return { fields: {}, escalate: true, code: "EXTRACTION_ERROR" };
  }
}

// Sequential chain with early exit.
// input: { transcript, needle?, rubric_version?, phase?, threshold? }
// deps:  { jev?(transcript, needle, opts)->{score,dimensions,confidence,tokens},
//          llmJudge?(transcript, rubric_version, phase, signal)->{score,dimensions} }
// returns { score, dimensions, voters, decision, usage, code? }
export async function runChain(input = {}, deps = {}) {
  const {
    transcript,
    needle = {},
    rubric_version = "v1",
    phase = "trial",
    threshold = JEV_CONF_THRESHOLD,
    signal,
  } = input;
  if (!transcript || typeof transcript !== "string" || transcript.length < 10) {
    const e = new Error("transcript required");
    e.code = "chain-bad-request";
    throw e;
  }
  const jevFn = deps.jev || defaultJev;
  const llmFn = deps.llmJudge || llmJudge;

  const hv = heuristic(transcript);
  const needleGate = normalizeNeedleInput(needle);
  if (needleGate.escalate) {
    return {
      score: hv.score,
      dimensions: hv.dimensions,
      voters: [
        { source: "heuristic", score: hv.score },
        { source: "needle", score: null, error: needleGate.code || "EXTRACTION_UNGROUNDED" },
      ],
      decision: "human_review",
      code: needleGate.code || "EXTRACTION_UNGROUNDED",
      usage: { jevTokens: 0, llmSkipped: true },
    };
  }

  // Step 2 — ONE batched JEV step. The heuristic is local and already
  // available; keeping it outside the provider promise also makes the
  // Needle confidence gate explicit and testable.
  const jevResult = await Promise.allSettled([
    Promise.resolve().then(() => jevFn(transcript, needleGate.fields, { signal })),
  ]).then((results) => results[0]);

  // Missing key / JEV down -> degrade to heuristic+LLM, never crash.
  if (jevResult.status === "rejected") {
    try {
      const l = await llmFn(transcript, rubric_version, phase, signal);
      return {
        score: blendScore(hv, W_H, l, W_LLM),
        dimensions: blendDims(hv, W_H, l, W_LLM),
        voters: [
          { source: "heuristic", score: hv.score },
          { source: "jev", score: null, error: jevResult.reason?.code || "chain-degraded" },
          { source: "llm", score: l.score },
        ],
        decision: "human_review",
        code: "chain-degraded",
        usage: { jevTokens: 0, llmSkipped: false },
      };
    } catch (error) {
      return {
        score: hv.score,
        dimensions: hv.dimensions,
        voters: [
          { source: "heuristic", score: hv.score },
          { source: "jev", score: null, error: jevResult.reason?.code || "chain-degraded" },
          { source: "llm", score: null, error: error?.name === "AbortError" ? "aborted" : "chain-degraded" },
        ],
        decision: "human_review",
        code: "chain-degraded",
        usage: { jevTokens: 0, llmSkipped: false },
      };
    }
  }
  const jv = jevResult.value;
  const gap = Math.abs(hv.score - jv.score);
  const lowConf = (jv.confidence ?? 1) < threshold;
  const routeReview = jv.route === "human_review";
  const gateReview = Number(jv.gates?.needs_escalation) >= 0.5 || Number(jv.gates?.thin_answer) >= 0.5;
  const forcedReview = routeReview || gateReview;

  if (forcedReview) {
    return {
      score: blendScore(hv, W_H, jv, W_JEV),
      dimensions: blendDims(hv, W_H, jv, W_JEV),
      voters: [
        { source: "heuristic", score: hv.score },
        { source: "jev", score: jv.score, confidence: jv.confidence, route: jv.route, gates: jv.gates },
      ],
      decision: "human_review",
      code: routeReview ? "jev-route-human-review" : "jev-escalation-gate",
      usage: { jevTokens: jv.tokens ?? 0, llmSkipped: true },
    };
  }

  // Step 3 — confidence gate. Clean pass -> early exit, no LLM spend.
  if (!lowConf && gap <= ABSTAIN_GAP) {
    return {
      score: blendScore(hv, W_H, jv, W_JEV),
      dimensions: blendDims(hv, W_H, jv, W_JEV),
      voters: [
        { source: "heuristic", score: hv.score },
        { source: "jev", score: jv.score, confidence: jv.confidence, route: jv.route, gates: jv.gates },
      ],
      decision: "auto",
      usage: { jevTokens: jv.tokens ?? 0, llmSkipped: true },
    };
  }

  // Step 4 — gated turn only: LLM judge breaks the tie.
  let l;
  try {
    l = await llmFn(transcript, rubric_version, phase, signal);
  } catch (error) {
    return {
      score: hv.score,
      dimensions: hv.dimensions,
      voters: [
        { source: "heuristic", score: hv.score },
        { source: "jev", score: jv.score, confidence: jv.confidence, route: jv.route, gates: jv.gates },
        { source: "llm", score: null, error: error?.name === "AbortError" ? "aborted" : "chain-degraded" },
      ],
      decision: "human_review",
      code: "chain-degraded",
      usage: { jevTokens: jv.tokens ?? 0, llmSkipped: false },
    };
  }
  // Low-confidence gate is sticky (JEV itself was unsure -> human eyes).
  // Gap-only gate clears if the LLM agrees with the heuristic within gap.
  const gap2 = Math.abs(hv.score - l.score);
  const decision = lowConf || gap2 > ABSTAIN_GAP ? "human_review" : "auto";
  return {
    score: blendScore(hv, W_H, l, W_LLM),
    dimensions: blendDims(hv, W_H, l, W_LLM),
    voters: [
      { source: "heuristic", score: hv.score },
      { source: "jev", score: jv.score, confidence: jv.confidence, route: jv.route, gates: jv.gates },
      { source: "llm", score: l.score },
    ],
    decision,
    usage: { jevTokens: jv.tokens ?? 0, llmSkipped: false },
  };
}

// Thin HTTP wrapper for the dispatcher (api/lexforge.js, A15's call).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const out = await runChain(req.body || {});
    return res.status(out.decision === "human_review" ? 202 : 200).json(out);
  } catch (e) {
    if (e.code === "chain-bad-request") return res.status(400).json({ error: e.message });
    // Keep internal provider/network errors out of the public response. The
    // caller only needs the stable degraded state to decide whether to retry
    // or route the matter to human review.
    return res.status(202).json({ error: "chain-degraded", code: "chain-degraded", decision: "human_review" });
  }
}
