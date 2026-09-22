// evals/chain/mock_jev.js — mock TypeSafe System One (JEV) server for chain evals.
//
// Shape-verified from TEAM-CONTRACT-JEV-NEEDLE.md (public docs, NO live key):
//   POST {state, model:"jev-latest", questions:{name:{type,instructions,criteria}}}
// Answers are keyed by the REQUEST's question names (like the real service),
// each typed to match the question's declared type (case-insensitive):
//   Choice -> {type, choice, probabilities, confidence}
//   Score  -> {type, score (0..4 weighted level index), confidence}
//   Noul   -> {type, noul} (NO confidence field, per docs)
// Unknown question types -> 400. Extra body keys (e.g. `fixture`) and any
// POST path are tolerated: "shape-verified" = required fields only.
// Fixture = `body.fixture` or the `x-eval-fixture` header ("default" absent).
//
// Per-fixture calibration (measured vs chain.js runChain, threshold 0.6,
// ABSTAIN_GAP 0.3; heuristic scores in run.js comments): clean-cite is the
// only high-confidence fixture and its mean dim score sits inside the
// agreement gate; every other fixture is low-confidence by construction, so
// the chain's gate (not the labels) produces human_review. Quality signal
// rides on choice.confidence + noul; Score levels exist to
// exercise the gate, not to grade the prose.
//
// Library: `import { startMockJev, CANNED } from "./mock_jev.js"`.
// CLI: `node mock_jev.js [port]` (0 = ephemeral; prints URL, runs until killed).
import http from "node:http";
import { pathToFileURL } from "node:url";

const S = (score, confidence) => ({ type: "score", score, confidence });

export const CANNED = {
  "clean-cite": {
    // mean dim score 0.50 vs heuristic 0.426 -> gap 0.074 <= 0.3, conf 0.85
    // -> early-exit auto, LLM skipped. Authority/reasoning high, delivery low.
    choice: { type: "choice", choice: "auto", probabilities: { auto: 0.88, human_review: 0.12 }, confidence: 0.85 },
    scores: {
      clarity: S(2, 0.85),
      reasoning: S(3, 0.85),
      authority: S(3, 0.85),
      rebuttal: S(1, 0.85),
      delivery: S(1, 0.85),
    },
    noul: { type: "noul", noul: 0.93 },
  },
  "no-authority": {
    // low confidence (0.45) -> LLM -> human_review. Authority level 0: no
    // statute/case cited anywhere in the answer.
    choice: { type: "choice", choice: "human_review", probabilities: { auto: 0.31, human_review: 0.69 }, confidence: 0.45 },
    scores: {
      clarity: S(1, 0.45),
      reasoning: S(1, 0.45),
      authority: S(0, 0.45),
      rebuttal: S(0, 0.45),
      delivery: S(1, 0.45),
    },
    noul: { type: "noul", noul: 0.22 },
  },
  "hedged": {
    // low confidence (0.52) -> LLM -> human_review.
    choice: { type: "choice", choice: "human_review", probabilities: { auto: 0.44, human_review: 0.56 }, confidence: 0.52 },
    scores: {
      clarity: S(2, 0.52),
      reasoning: S(1, 0.52),
      authority: S(1, 0.52),
      rebuttal: S(1, 0.52),
      delivery: S(1, 0.52),
    },
    noul: { type: "noul", noul: 0.48 },
  },
  "thin": {
    // low confidence (0.45) -> LLM -> human_review.
    choice: { type: "choice", choice: "human_review", probabilities: { auto: 0.35, human_review: 0.65 }, confidence: 0.45 },
    scores: {
      clarity: S(1, 0.45),
      reasoning: S(0, 0.45),
      authority: S(1, 0.45),
      rebuttal: S(0, 0.45),
      delivery: S(1, 0.45),
    },
    noul: { type: "noul", noul: 0.3 },
  },
  "conflicting": {
    // low confidence (0.51) -> LLM -> human_review. Mid levels: two real
    // holdings cited, conflict never resolved.
    choice: { type: "choice", choice: "human_review", probabilities: { auto: 0.51, human_review: 0.49 }, confidence: 0.51 },
    scores: {
      clarity: S(2, 0.51),
      reasoning: S(2, 0.51),
      authority: S(2, 0.51),
      rebuttal: S(1, 0.51),
      delivery: S(2, 0.51),
    },
    noul: { type: "noul", noul: 0.52 },
  },
  "empty": {
    // Degenerate input. chain.js rejects transcripts <10 chars before any
    // JEV call, so these answers are unreachable — present for completeness.
    choice: { type: "choice", choice: "human_review", probabilities: { auto: 0.2, human_review: 0.8 }, confidence: 0.8 },
    scores: {
      clarity: S(0, 0.7),
      reasoning: S(0, 0.7),
      authority: S(0, 0.7),
      rebuttal: S(0, 0.7),
      delivery: S(0, 0.7),
    },
    noul: { type: "noul", noul: 0.05 },
  },
  "default": {
    choice: { type: "choice", choice: "human_review", probabilities: { auto: 0.5, human_review: 0.5 }, confidence: 0.5 },
    scores: {
      clarity: S(2, 0.5),
      reasoning: S(2, 0.5),
      authority: S(2, 0.5),
      rebuttal: S(2, 0.5),
      delivery: S(2, 0.5),
    },
    noul: { type: "noul", noul: 0.5 },
  },
};

export function shapeError(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return "body must be a JSON object";
  if (typeof b.state !== "string") return "state must be a string";
  if (b.model !== "jev-latest") return 'model must be "jev-latest"';
  const q = b.questions;
  if (!q || typeof q !== "object" || Array.isArray(q) || Object.keys(q).length === 0)
    return "questions must be a non-empty object";
  for (const [name, def] of Object.entries(q)) {
    if (!def || typeof def !== "object" || Array.isArray(def)) return `questions.${name} must be an object`;
    if (typeof def.type !== "string" || !def.type) return `questions.${name}.type must be a non-empty string`;
    if (typeof def.instructions !== "string" || !def.instructions)
      return `questions.${name}.instructions must be a non-empty string`;
    const t = String(def.type).toLowerCase();
    const c = def.criteria;
    if (t === "choice") {
      if (!c || typeof c !== "object" || Array.isArray(c) || !Object.keys(c).length)
        return `questions.${name}.criteria must be a non-empty option map`;
    } else if (t === "score") {
      if (!Array.isArray(c) || c.length < 2 || c.length > 10 || !c.every((x) => typeof x === "string" && x.length > 0))
        return `questions.${name}.criteria must be a 2-10 item level array`;
    } else if (t === "noul") {
      if (c !== undefined && (!c || typeof c !== "object" || Array.isArray(c)))
        return `questions.${name}.criteria must be a true/false map`;
    } else {
      return `unknown question type ${JSON.stringify(def.type)}`;
    }
  }
  return null;
}

// Build the answers object keyed by the request's question names.
export function cannedAnswers(name, questions) {
  const canned = CANNED[name] || CANNED.default;
  const answers = {};
  for (const [qname, def] of Object.entries(questions)) {
    const t = String(def.type || "").toLowerCase();
    if (t === "choice") answers[qname] = canned.choice;
    else if (t === "noul") answers[qname] = canned.noul;
    else if (t === "score") answers[qname] = canned.scores[qname] || { type: "score", score: 2, confidence: 0.5 };
    else return { error: `unknown question type ${JSON.stringify(def.type)} for ${JSON.stringify(qname)}` };
  }
  return { answers };
}

export function startMockJev(port = 0) {
  const stats = { requests: 0, shapeErrors: 0, byFixture: {} };
  const server = http.createServer((req, res) => {
    const json = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.method !== "POST") return json(405, { error: "POST only" });
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      stats.requests++;
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        stats.shapeErrors++;
        return json(400, { error: "invalid JSON" });
      }
      const err = shapeError(body);
      if (err) {
        stats.shapeErrors++;
        return json(400, { error: err });
      }
      const name = body.fixture || req.headers["x-eval-fixture"] || "default";
      const out = cannedAnswers(name, body.questions);
      if (out.error) {
        stats.shapeErrors++;
        return json(400, { error: out.error });
      }
      stats.byFixture[name] = (stats.byFixture[name] || 0) + 1;
      return json(200, { fixture: name, answers: out.answers });
    });
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const { port: p } = server.address();
      resolve({ url: `http://127.0.0.1:${p}`, close: () => new Promise((r) => server.close(r)), stats });
    });
  });
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.argv[2] || 0);
  const { url } = await startMockJev(port);
  console.log(`mock JEV listening at ${url}/v1/systemone`);
}
