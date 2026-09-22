// evals/chain/run.js — chain eval runner. No live key needed.
//
// Flow per fixture in fixtures.json:
//   1. build the chain input {transcript, fixture, jevBaseUrl} (transcript =
//      pinned excerpt, per the 32k-budget contract rule — never the session),
//   2. execute api/_lib/lexforge/chain.js runChain() with mock-JEV + stub-LLM
//      deps injected (mock answers per fixture; stub LLM never hits network),
//   3. assert decision + usage: observed per-fixture dep invocation counts
//      (jevCalls from the mock's stats.byFixture, llmCalls from the stub
//      counter) AND the chain's self-reported usage ({jevTokens finite,
//      llmSkipped consistent with llmCalls}).
//
// Chain resolution: imports runChain from ../../api/_lib/lexforge/chain.js
// (A14). The eval drives it with deps {jev, llmJudge} so no live key and no
// network are needed: the jev dep posts the real docs-shaped body
// {state, model:"jev-latest", questions} (5 batched Score questions + Choice
// verdict + Noul grounded, one round-trip) to the mock and maps the mock's
// name-keyed answers onto chain.js's {score,dimensions,confidence,tokens}
// voter shape via the official weighted score index convention. If chain.js is
// missing/exists-without-runChain, exits 2 with a pointer (no silent
// fallback — the harness must test the real chain). Other import errors
// (syntax/loader) propagate with their real stack, never masked as "missing".
//
// Fixture expectations (measured vs chain.js heuristics + thresholds 0.6/0.3):
//   clean-cite    h=0.426 vs JEV 0.50 -> gap 0.074, conf 0.85 -> auto, no LLM
//   no-authority  conf 0.45 < 0.6 -> human_review + 1 LLM
//   hedged        conf 0.52 < 0.6 -> human_review + 1 LLM
//   thin          conf 0.45 < 0.6 -> human_review + 1 LLM
//   conflicting   conf 0.51 < 0.6 -> human_review + 1 LLM
//   empty         rejected (<10 chars) before any JEV/LLM call -> human_review
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startMockJev } from "./mock_jev.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHAIN_PATH = path.resolve(HERE, "../../api/_lib/lexforge/chain.js");
const MIN_TRANSCRIPT = 10; // must match chain.js's reject threshold

// Eval questions: 5 batched Score (one per chain.js dimension) + Choice
// verdict + Noul grounded — one round-trip, like defaultJev's batching.
function evalQuestions() {
  const dims = ["clarity", "reasoning", "authority", "rebuttal", "delivery"];
  const q = {
    verdict: { type: "choice", instructions: "Decide auto or human_review for this drill turn.", criteria: { auto: "The turn is safe to automate.", human_review: "The turn needs human review." } },
    grounded: { type: "noul", instructions: "Is every claim grounded in the transcript excerpt?", criteria: { true: "Every claim is grounded.", false: "At least one claim is not grounded." } },
  };
  for (const k of dims) {
    q[k] = {
      type: "score",
      instructions: `Rate the advocate's ${k} in this trial-drill transcript.`,
      criteria: ["poor", "weak", "adequate", "strong", "excellent"],
    };
  }
  return q;
}

// Mock-JEV dep for runChain: real docs-shaped body, canned answers per
// fixture, mapped via the official score index convention (0..4 -> /4).
function makeMockJev(jevBaseUrl, fixture) {
  return async (transcript) => {
    const excerpt = String(transcript || "").slice(0, 4000);
    const state = `Transcript excerpt:\n${excerpt}\n\nNeedle-extracted fields:\n(none)`;
    const r = await fetch(`${jevBaseUrl}/v1/systemone`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-eval-fixture": fixture },
      body: JSON.stringify({ state, model: "jev-latest", fixture, questions: evalQuestions() }),
    });
    if (!r.ok) throw new Error(`mock jev ${r.status}: ${await r.text()}`);
    const { answers } = await r.json();
    const dims = ["clarity", "reasoning", "authority", "rebuttal", "delivery"];
    const scoreOf = (k) => {
      const a = answers?.[k] ?? {};
      const max = Array.isArray(evalQuestions()[k]?.criteria) ? evalQuestions()[k].criteria.length - 1 : 4;
      return Math.max(0, Math.min(1, Number(a.score ?? 2) / Math.max(1, max)));
    };
    const confOf = (k) => Number(answers?.[k]?.confidence ?? 0.5);
    const dimensions = Object.fromEntries(dims.map((k) => [k, +scoreOf(k).toFixed(3)]));
    const score = +(dims.reduce((a, k) => a + scoreOf(k), 0) / dims.length).toFixed(3);
    const meanScoreConf = dims.reduce((a, k) => a + confOf(k), 0) / dims.length;
    const confidence = +((Number(answers?.verdict?.confidence ?? 0.5) + meanScoreConf) / 2).toFixed(3);
    return { score, dimensions, confidence, tokens: Math.ceil(state.length / 4) };
  };
}

// Stub LLM (never network): score.js-parity midpoint, counted as 1 LLM call.
function makeStubLlm(counter) {
  return async () => {
    counter.n++;
    const dimensions = {
      clarity: 0.5,
      reasoning: 0.5,
      authority: 0.5,
      rebuttal: 0.5,
      delivery: 0.5,
    };
    return { score: 0.5, dimensions };
  };
}

async function loadChain() {
  let mod;
  try {
    mod = await import(pathToFileURL(CHAIN_PATH).href);
  } catch (e) {
    if (e && (e.code === "ERR_MODULE_NOT_FOUND" || /Cannot find module/.test(String(e.message)))) {
      console.error("BLOCKED: api/_lib/lexforge/chain.js missing — harness tests the real chain, no fallback.");
      process.exit(2);
    }
    throw e; // syntax/loader errors surface with their real stack
  }
  if (typeof mod.runChain !== "function") {
    console.error("BLOCKED: api/_lib/lexforge/chain.js has no runChain() export — harness tests the real chain, no fallback.");
    process.exit(2);
  }
  return mod.runChain;
}

async function main() {
  const runChain = await loadChain();
  const { url, close, stats } = await startMockJev(0);
  const fixtures = JSON.parse(await readFile(path.join(HERE, "fixtures.json"), "utf8"));
  // Only "empty" may exercise the reject path; anything else short is a
  // fixture-data typo, not a different assertion.
  for (const f of fixtures) {
    const short = !f.state || f.state.length < MIN_TRANSCRIPT;
    if (short && f.name !== "empty")
      throw new Error(`fixture ${JSON.stringify(f.name)} is <${MIN_TRANSCRIPT} chars but is not the "empty" reject-path fixture`);
  }
  console.log(`chain source: chain.js runChain + mock-JEV deps\nmock: ${url}\n`);
  let pass = 0;
  for (const f of fixtures) {
    const before = stats.byFixture[f.name] || 0;
    const llmCount = { n: 0 };
    let got;
    let err = null;
    try {
      got =
        !f.state || f.state.length < MIN_TRANSCRIPT
          ? await (async () => {
              // Empty state: chain.js must reject with chain-bad-request
              // before any JEV/LLM call; assert the error path.
              try {
                await runChain(
                  { transcript: f.state },
                  { jev: makeMockJev(url, f.name), llmJudge: makeStubLlm(llmCount) }
                );
              } catch (e) {
                if (e?.code === "chain-bad-request") return { rejectPath: true, decision: "human_review", usage: { jevTokens: 0, llmSkipped: true } };
                throw e;
              }
              throw new Error("expected chain-bad-request, chain resolved");
            })()
          : await runChain(
              { transcript: f.state },
              { jev: makeMockJev(url, f.name), llmJudge: makeStubLlm(llmCount) }
            );
    } catch (e) {
      err = e;
    }
    // Observed usage (never hardcoded): per-fixture mock hits + stub count.
    const jevCalls = err ? null : (stats.byFixture[f.name] || 0) - before;
    const usage = err ? null : { jevCalls, llmCalls: llmCount.n > 0 ? 1 : 0 };
    // Chain self-report consistency: llmSkipped must agree with the stub
    // counter; jevTokens must be a finite number.
    const selfOk =
      !err &&
      got?.usage &&
      (got.usage.llmSkipped === (llmCount.n === 0) || got.rejectPath === true) &&
      Number.isFinite(got.usage.jevTokens);
    const ok =
      !err &&
      selfOk &&
      got?.decision === f.expectedDecision &&
      usage.jevCalls === f.expectedUsage.jevCalls &&
      usage.llmCalls === f.expectedUsage.llmCalls;
    if (ok) pass++;
    const why = err
      ? `ERROR:${err.message}`
      : [
          got.decision !== f.expectedDecision ? `decision ${got.decision} != ${f.expectedDecision}` : null,
          usage.jevCalls !== f.expectedUsage.jevCalls ? `jevCalls ${usage.jevCalls} != ${f.expectedUsage.jevCalls}` : null,
          usage.llmCalls !== f.expectedUsage.llmCalls ? `llmCalls ${usage.llmCalls} != ${f.expectedUsage.llmCalls}` : null,
          !selfOk ? `chain self-report inconsistent: ${JSON.stringify(got?.usage)}` : null,
        ]
          .filter(Boolean)
          .join("; ") || "decision+usage match";
    console.log(
      `${ok ? "PASS" : "FAIL"} ${f.name}: ` +
      `decision=${err ? "ERROR" : got.decision} (want ${f.expectedDecision}), ` +
      `usage=${err ? "-" : JSON.stringify(usage)} (want ${JSON.stringify(f.expectedUsage)}) — ${why}`
    );
  }
  console.log(`\n${pass}/${fixtures.length} passed`);
  console.log(`mock stats: ${JSON.stringify(stats)}`);
  await close();
  const nonEmpty = fixtures.filter((f) => f.state && f.state.length >= MIN_TRANSCRIPT).length;
  if (stats.requests !== nonEmpty) {
    console.error(`REGRESSION: mock saw ${stats.requests} JEV calls, want ${nonEmpty} (one batched call per non-empty turn)`);
    process.exit(1);
  }
  if (stats.shapeErrors !== 0) {
    console.error(`REGRESSION: mock saw ${stats.shapeErrors} malformed JEV requests`);
    process.exit(1);
  }
  if (pass !== fixtures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
