// LEGAL/api/_lib/jev/questions.js
// JEV System One question-batch builders for LexForge drills (A12).
// Pure module: no fetch, no env reads, no deps, no keys.
// A11 client.js sends the batch; chain consumes parsed answers.
// JEV type rules (per TypeSafe's wire contract): Choice <=255 options in a
// criteria map, Score 2-10 ordered levels in a criteria array, and Noul
// criteria as an optional {true,false} object. Answers are typed values.

export const JEV_MODEL = "jev-latest";
export const STATE_MAX = 8000;
export const DIMS = ["clarity", "reasoning", "authority", "rebuttal", "delivery"];
export const GATES = ["cited_authority", "hedged", "thin_answer", "needs_escalation"];
export const MAX_CHOICE_OPTIONS = 255;

// Matches Indian + US legal citations: "Kesavananda v. Bharati",
// "AIR 1973 SC 1461", "SCC", "Section 302 IPC", "Article 21", "§",
// "precedent", "held that". Kept in sync with score.js heuristic signals.
const CITATION_RE =
  /\bv\.?\s|\bvs\.?\s|\bAIR\b|\bSCC\b|\bsection\b|\barticle\b|§|\bprecedent\b|\bheld that\b|\bU\.?\s?S\.?\b|\bCir\.?\b|\bIPC\b|\bCrPC\b|\bCPC\b|\bEvidence Act\b/i;

const clamp01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
};

// Pin a transcript to the ~32k-token JEV state budget (we use <=8000
// chars). Keeps the first turn (drill prompt), every turn carrying a
// legal citation, and the last turn (latest answer). Truncates the
// middle first; marks the cut so judges know excerpting happened.
export function pinExcerpt(transcript, maxChars = STATE_MAX) {
  if (transcript == null) return "";
  const text = String(transcript);
  if (text.length <= maxChars) return text;
  const raw = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const turns = raw.length > 1 ? raw : [text];
  const last = turns.length - 1;
  const keepIdx = new Set([0, last]);
  turns.forEach((t, i) => {
    if (CITATION_RE.test(t)) keepIdx.add(i);
  });
  const ordered = [...keepIdx].sort((a, b) => a - b);
  let out = ordered.map((i) => turns[i]).join("\n\n");
  if (out.length <= maxChars) return out;
  // Still over budget: keep head (prompt + early cites) and tail
  // (latest answer), cut the middle with an explicit marker.
  // Guard: tiny maxChars (<= marker) has no room for head+tail framing,
  // so hard-truncate instead of producing a longer-than-budget string.
  const MARK = "\n\n[... middle excerpted to fit JEV state budget ...]\n\n";
  if (maxChars <= MARK.length + 8) return out.slice(0, maxChars);
  const room = maxChars - MARK.length;
  const tailWant = Math.min(Math.ceil(room * 0.6), turns[last].length + 500);
  const tail = out.slice(-tailWant);
  const headLen = Math.max(0, room - tail.length);
  const head = out.slice(0, headLen);
  return head + MARK + tail;
}

// Five ordered levels per scoring dimension, legal-worded. Index 0 is
// the weakest performance, index 4 the strongest.
const SCORE_LEVELS = {
  clarity: [
    "1 - Incoherent: the examiner cannot follow the submission.",
    "2 - Muddled: key points buried; structure hard to track.",
    "3 - Adequate: competent and followable, neither crisp nor confused.",
    "4 - Clear: well-structured submission, easy to follow.",
    "5 - Compelling: crisp, court-ready clarity throughout.",
  ],
  reasoning: [
    "1 - No legal reasoning: bare conclusions without IRAC footing.",
    "2 - Thin reasoning: issue or rule stated, application missing.",
    "3 - Adequate: IRAC present but mechanical or incomplete.",
    "4 - Strong: rule applied to facts with sound distinctions.",
    "5 - Airtight: rigorous IRAC chain, anticipates counter-analysis.",
  ],
  authority: [
    "1 - No authority: no case, statute, or principle cited.",
    "2 - Nominal: authority named but off-point or mis-stated.",
    "3 - Adequate: at least one relevant authority correctly stated.",
    "4 - Strong: precedent/statute on point, correctly applied.",
    "5 - Commanding: controlling authority precisely deployed.",
  ],
  rebuttal: [
    "1 - Evasive: opposing argument ignored or dodged.",
    "2 - Weak: opposition noted but not engaged.",
    "3 - Adequate: counters the point without distinguishing authority.",
    "4 - Strong: distinguishes adverse authority on facts or law.",
    "5 - Devastating: turns the opposition's best case against it.",
  ],
  delivery: [
    "1 - Unfit: filler, rambling, or improper courtroom tone.",
    "2 - Shaky: hesitant, disorganized, or overly casual.",
    "3 - Adequate: professional and audible, unremarkable.",
    "4 - Polished: confident pacing, respectful address to court.",
    "5 - Commanding: advocate-grade presence and precision.",
  ],
};

const ROUTE_OPTIONS = ["auto", "probe", "human_review"];

// Build the ONE batched JEV call body for a drill turn. Batching all
// questions in a single call is ~11.5x cheaper than sequential calls.
export function buildDrillQuestions(transcriptExcerpt, needle = {}) {
  const excerpt = pinExcerpt(transcriptExcerpt);
  const fields = Object.entries(needle ?? {})
    .slice(0, 20)
    .map(([k, v]) => {
      let value;
      try { value = JSON.stringify(v); } catch { value = '"[unserializable]"'; }
      return `${k}: ${String(value).slice(0, 300)}`;
    })
    .join("\n");
  const state = `Transcript excerpt:\n${excerpt}\n\nNeedle-extracted fields:\n${fields || "(none)"}`.slice(0, STATE_MAX);
  const questions = {
    route_turn: {
      type: "choice",
      instructions:
        "Route this drill turn: 'auto' if the answer is clearly right or wrong, " +
        "'probe' if a follow-up question would resolve doubt, 'human_review' if " +
        "the response is unsafe, incoherent, or beyond automated judgment.",
      criteria: {
        auto: "Answer is solid; score it and move on.",
        probe: "Answer is borderline; one follow-up drill question resolves doubt.",
        human_review: "Answer is unsafe, fabricated, or unevaluable; escalate to a human.",
      },
    },
  };
  for (const dim of DIMS) {
    questions[`score_${dim}`] = {
      type: "score",
      instructions: `Rate the advocate's ${dim} on the 5 ordered levels below (level 1 weakest, level 5 strongest).`,
      criteria: [...SCORE_LEVELS[dim]],
    };
  }
  const gateText = {
    cited_authority:
      "Probability the answer cites at least one real, on-point legal authority (case, statute, or settled principle).",
    hedged:
      "Probability the answer hedges, waffles, or refuses to commit to a legal position.",
    thin_answer:
      "Probability the answer is too thin to judge (under ~2 sentences or no substantive content).",
    needs_escalation:
      "Probability a human reviewer must see this turn (unsafe content, fabricated citation, or total breakdown).",
  };
  const GATE_CRITERIA = {
    cited_authority:
      "Yes when a recognizable case, statute, article, or settled principle is cited; no otherwise.",
    hedged:
      "Yes when filler or hedging dominates and the answer evades taking a position; no when it commits.",
    thin_answer:
      "Yes for one-liners or content-free replies with nothing substantive to judge; no for substantive turns.",
    needs_escalation:
      "Yes only on genuine red flags (unsafe content, fabricated citation, total breakdown); no for ordinary weak answers.",
  };
  for (const gate of GATES) {
    questions[`gate_${gate}`] = {
      type: "noul",
      instructions: gateText[gate],
      criteria: { true: GATE_CRITERIA[gate], false: "The condition is not present." },
    };
  }
  return { state, model: JEV_MODEL, questions };
}

// assertDrillBody: contract self-check for the batched JEV body.
// Choice <=255 criteria options; Score 2-10 criteria levels; Noul criteria is
// optional and never carries confidence; every question carries instructions.
export function assertDrillBody(body) {
  if (!body || typeof body !== "object") throw new TypeError("assertDrillBody: body required");
  if (body.model !== JEV_MODEL) throw new Error(`assertDrillBody: model must be ${JEV_MODEL}`);
  if (typeof body.state !== "string" || !body.state.length)
    throw new Error("assertDrillBody: state must be a non-empty excerpt");
  const qs = body.questions;
  if (!qs || typeof qs !== "object") throw new Error("assertDrillBody: questions map required");
  const names = Object.keys(qs);
  if (names.length !== 10)
    throw new Error(`assertDrillBody: expected 10 batched questions, got ${names.length}`);
  for (const [name, q] of Object.entries(qs)) {
    if (typeof q.instructions !== "string" || !q.instructions.length)
      throw new Error(`assertDrillBody: ${name} needs instructions`);
    if (q.type === "choice") {
      if (!q.criteria || typeof q.criteria !== "object" || Array.isArray(q.criteria))
        throw new Error(`assertDrillBody: ${name} Choice needs criteria map`);
      const options = Object.keys(q.criteria);
      if (!options.length) throw new Error(`assertDrillBody: ${name} Choice needs options`);
      if (options.length > MAX_CHOICE_OPTIONS)
        throw new Error(`assertDrillBody: ${name} has ${options.length} options > ${MAX_CHOICE_OPTIONS}`);
    } else if (q.type === "score") {
      const n = Array.isArray(q.criteria) ? q.criteria.length : 0;
      if (n < 2 || n > 10)
        throw new Error(`assertDrillBody: ${name} Score needs 2-10 criteria levels, got ${n}`);
    } else if (q.type === "noul") {
      if (q.criteria !== undefined && (typeof q.criteria !== "object" || Array.isArray(q.criteria)))
        throw new Error(`assertDrillBody: ${name} Noul criteria must be an object`);
    } else {
      throw new Error(`assertDrillBody: ${name} unknown type ${q && q.type}`);
    }
  }
  return true;
}

/**
 * Normalize a caller-supplied question map to TypeSafe's wire contract.
 * This keeps the playground backwards-compatible with the old capitalized
 * type/options/levels shape while bounding provider-facing work.
 */
export function normalizeQuestions(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("questions must be a non-empty object");
  }
  const entries = Object.entries(raw);
  if (!entries.length || entries.length > 32) throw new TypeError("questions must contain 1-32 items");
  const out = {};
  for (const [rawName, rawDef] of entries) {
    const name = String(rawName).trim();
    if (!name || name.length > 100) throw new TypeError("question names must be 1-100 characters");
    if (!rawDef || typeof rawDef !== "object" || Array.isArray(rawDef)) throw new TypeError(`question '${name}' must be an object`);
    const def = rawDef;
    const type = String(def.type || "").toLowerCase();
    const instructions = typeof def.instructions === "string" ? def.instructions.trim().slice(0, 4000) : "";
    if (!instructions) throw new TypeError(`question '${name}' needs instructions`);
    if (type === "choice") {
      let criteria = def.criteria;
      if (Array.isArray(def.options)) criteria = Object.fromEntries(def.options.map((x) => [String(x), String(x)]));
      if (Array.isArray(criteria)) criteria = Object.fromEntries(criteria.map((x) => [String(x), String(x)]));
      if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) throw new TypeError(`question '${name}' needs Choice criteria`);
      const options = Object.entries(criteria)
        .slice(0, MAX_CHOICE_OPTIONS)
        .map(([option, description]) => [String(option).slice(0, 255), String(description).slice(0, 2000)]);
      if (!options.length) throw new TypeError(`question '${name}' needs Choice options`);
      out[name] = { type: "choice", instructions, criteria: Object.fromEntries(options) };
    } else if (type === "score") {
      const criteria = Array.isArray(def.criteria) ? def.criteria : def.levels;
      if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 10) {
        throw new TypeError(`question '${name}' needs 2-10 Score criteria levels`);
      }
      out[name] = { type: "score", instructions, criteria: criteria.slice(0, 10).map((level) => String(level).slice(0, 2000)) };
    } else if (type === "noul") {
      const criteria = def.criteria;
      if (criteria !== undefined && (typeof criteria !== "object" || criteria === null || Array.isArray(criteria))) {
        out[name] = { type: "noul", instructions, criteria: { true: String(criteria), false: "Condition is not present." } };
      } else {
        out[name] = {
          type: "noul",
          instructions,
          ...(criteria ? {
            criteria: {
              true: String(criteria.true ?? "The condition is present.").slice(0, 2000),
              false: String(criteria.false ?? "The condition is not present.").slice(0, 2000),
            },
          } : {}),
        };
      }
    } else {
      throw new TypeError(`question '${name}' has unsupported type`);
    }
  }
  return out;
}

// --- Answer parsing (matches A11 client.js answer shapes) ---

function pickKey(obj, names) {
  const lower = Object.create(null);
  for (const [k, v] of Object.entries(obj)) lower[String(k).toLowerCase()] = v;
  for (const n of names) if (lower[n] !== undefined) return lower[n];
  return undefined;
}

// Choice answer: {option|choice|value|label, distribution, confidence}.
export function parseChoice(ans) {
  if (!ans || typeof ans !== "object") throw new TypeError("parseChoice: expected object");
  const norm = (v) => (typeof v === "string" ? v : v == null ? v : String(v));
  let distribution = pickKey(ans, ["distribution", "dist", "weights", "probs", "probabilities"]);
  if (distribution instanceof Map) distribution = Object.fromEntries(distribution);
  let winner = norm(pickKey(ans, ["option", "choice", "value", "label", "winner", "top"]));
  if (winner == null && distribution && typeof distribution === "object") {
    let best = -Infinity;
    for (const [k, v] of Object.entries(distribution)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > best) {
        best = n;
        winner = k;
      }
    }
  }
  if (winner == null) throw new Error("parseChoice: no winning option found");
  if (distribution != null) {
    if (typeof distribution !== "object" || Array.isArray(distribution)) {
      throw new Error("parseChoice: distribution must be an object");
    }
    for (const [key, raw] of Object.entries(distribution)) {
      const p = strictNum(raw);
      if (!Number.isFinite(p) || p < 0 || p > 1) {
        throw new Error(`parseChoice: probability for '${key}' must be 0..1`);
      }
    }
  }
  const out = { option: winner };
  if (distribution != null) out.distribution = distribution;
  const conf = pickKey(ans, ["confidence", "conf", "certainty"]);
  if (conf != null) out.confidence = clamp01(conf);
  return out;
}

// strictNum: Number() coerces null/""//false/[] to 0, which would turn
// missing input into a confident 0. Reject those shapes first; accept
// numbers and non-empty numeric strings.
function strictNum(raw) {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") return Number(raw);
  return NaN;
}

// Score answer: TypeSafe returns a probability-weighted score on the level
// index scale (0..criteria.length-1), plus confidence. `level` remains a
// compatibility alias for the local harness and is interpreted as 0-based.
export function parseScore(ans) {
  if (!ans || typeof ans !== "object") throw new TypeError("parseScore: expected object");
  const entries = {};
  for (const [k, v] of Object.entries(ans)) entries[String(k).toLowerCase()] = v;
  const has = (...names) => names.find((n) => entries[n] !== undefined);
  const levelKey = has("level");
  const scoreKey = has("value", "score", "rating", "val");
  const answerType = String(entries.type ?? "").toLowerCase();
  const asLevel = (n) => (Number.isInteger(n) && n >= 0 && n <= 4 ? n / 4 : null);
  let value = null;
  if (levelKey !== undefined) {
    const n = strictNum(entries[levelKey]);
    value = asLevel(n);
    if (value == null || !Number.isFinite(n))
      throw new Error(`parseScore: ${JSON.stringify(entries[levelKey])} not a 0..4 level index`);
  } else if (scoreKey !== undefined) {
    const n = strictNum(entries[scoreKey]);
    // queryJev first converts the official 0..4 weighted score into the
    // chain's normalized 0..1 value. Do not divide that value a second time
    // when scoreTranscript feeds it through this compatibility parser.
    value = Number.isFinite(n) && n >= 0 && n <= 1 && answerType === "score"
      ? n
      : Number.isFinite(n) && n >= 0 && n <= 4 ? n / 4 : null;
    if (value == null) throw new Error(`parseScore: ${JSON.stringify(entries[scoreKey])} not a 0..4 score`);
  } else {
    throw new Error("parseScore: no value/score/rating/level key found");
  }
  const out = { value: +value.toFixed(3) };
  const dist = pickKey(ans, ["distribution", "dist", "weights"]);
  if (dist != null) out.distribution = dist;
  const conf = pickKey(ans, ["confidence", "conf", "certainty"]);
  if (conf != null) out.confidence = clamp01(conf);
  return out;
}

// Noul answer: TypeSafe returns {noul: 0..1} and no confidence. Compatibility
// aliases remain accepted for injected test clients.
export function parseNoul(ans) {
  if (!ans || typeof ans !== "object") throw new TypeError("parseNoul: expected object");
  if (pickKey(ans, ["confidence", "conf", "certainty"]) != null)
    throw new Error("parseNoul: Noul must not carry confidence");
  const raw = pickKey(ans, ["noul", "probability", "prob", "p", "value", "score", "chance"]);
  const p = strictNum(raw);
  if (!Number.isFinite(p) || p < 0 || p > 1)
    throw new Error(`parseNoul: ${JSON.stringify(raw)} not a probability in 0..1`);
  return { probability: p };
}

const CANONICAL = {
  route_turn: "route_turn",
  route: "route_turn",
  routing: "route_turn",
  score_clarity: "score_clarity",
  clarity: "score_clarity",
  score_reasoning: "score_reasoning",
  reasoning: "score_reasoning",
  score_authority: "score_authority",
  authority: "score_authority",
  score_rebuttal: "score_rebuttal",
  rebuttal: "score_rebuttal",
  score_delivery: "score_delivery",
  delivery: "score_delivery",
  gate_cited_authority: "gate_cited_authority",
  cited_authority: "gate_cited_authority",
  cited: "gate_cited_authority",
  gate_hedged: "gate_hedged",
  hedged: "gate_hedged",
  gate_thin_answer: "gate_thin_answer",
  thin_answer: "gate_thin_answer",
  thin: "gate_thin_answer",
  gate_needs_escalation: "gate_needs_escalation",
  needs_escalation: "gate_needs_escalation",
  escalation: "gate_needs_escalation",
};

function canonicalKey(key) {
  const k = String(key).toLowerCase().replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
  return CANONICAL[k] ?? k;
}

// Parse a full JEV judgment object into per-question results.
// Per-question failures are captured as {_error, raw}, never thrown.
export function parseDrillAnswers(judgment) {
  if (!judgment || typeof judgment !== "object")
    throw new TypeError("parseDrillAnswers: expected object");
  const out = {};
  for (const [k, val] of Object.entries(judgment)) {
    const key = canonicalKey(k);
    try {
      if (key === "route_turn") out[key] = parseChoice(val);
      else if (key.startsWith("score_")) out[key] = parseScore(val);
      else if (key.startsWith("gate_")) out[key] = parseNoul(val);
      else out[key] = { _error: "unknown question key", raw: val };
    } catch (e) {
      out[key] = { _error: String(e && e.message ? e.message : e), raw: val };
    }
  }
  return out;
}
