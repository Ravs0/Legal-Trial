// B20 — end-to-end integration test: mock JEV + live-local Needle sidecar + chain + dispatcher.
// Owns exactly this file. Run: `npx tsx evals/chain/integration.test.ts` (from repo root).
// NOT discovered by scripts/run-tests.sh (ROOTS = services vision hooks utils) and NOT
// covered by tsconfig include (no evals/ entry) — so it cannot break `npm run check`;
// it is the verifier's standalone gate. Mock JEV only (no TYPESAFE_API_KEY needed,
// no live network except localhost mock + local python sidecar).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runChain, heuristic, defaultJev } from "../../api/_lib/lexforge/chain.js";
import { fromSidecar } from "../../api/_lib/needle/schemas.js";
import { startMockJev } from "./mock_jev.js";
import dispatcher from "../../api/lexforge.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DIMS = ["clarity", "reasoning", "authority", "rebuttal", "delivery"] as const;

// Strong transcript: heuristic lands ~0.69 (near mock scores) so the clean
// path early-exits; hedged path gates. Both decisions are asserted, not assumed.
const STRONG_TRANSCRIPT = [
  "Counsel for the tenant: my client received a three-day notice to quit.",
  "Under Section 1942 of the Civil Code the landlord must maintain habitable premises,",
  "because habitability is non-waivable. In Green v. Superior Court the court held that",
  "retaliatory eviction is barred, and therefore the notice fails. However the landlord",
  "argues waiver; that issue fails on the rule that statutory duties cannot be waived.",
  "In application here the notice misstates the cure period, so I distinguish any contrary",
  "authority. I object to the arrears calculation and conclude the eviction must be overruled.",
  "The conclusion follows: no valid notice, no judgment for possession.",
].join(" ");
const HEDGED_TRANSCRIPT =
  "Maybe there is arguably a possible breach of contract, I'm not really sure. " +
  "It could perhaps be negligence, or maybe not. I guess damages might possibly " +
  "be available, though I can't say for certain.";

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${label}`);
}
function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected)
    throw new Error(`${label}: want ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function in01(x: unknown, label: string): void {
  assert(typeof x === "number" && x >= 0 && x <= 1, `${label} in 0..1 (got ${JSON.stringify(x)})`);
}

// Live-local Needle sidecar: stdin JSON {text} -> stdout JSON (never in request path).
function sidecarExtract(text: string): any {
  const r = spawnSync("python3", ["api/_lib/needle/extract.py"], {
    input: JSON.stringify({ text }),
    encoding: "utf8",
    timeout: 120_000,
    cwd: ROOT,
  });
  assert(r.error === undefined, `sidecar spawn (${String(r.error)})`);
  assertEqual(r.status, 0, "sidecar exit 0");
  return JSON.parse(String(r.stdout));
}

// Chain seam adapter: real mock-JEV HTTP wire (shape-verified: state string,
// model jev-latest, non-empty questions) mapped to chain's voter shape.
// Mock answers use TypeSafe's documented {choice, score(0..4), noul} shapes.
function mockJevAdapter(jevBaseUrl: string, fixture: string) {
  return async (transcript: string, _needle: unknown) => {
    const res = await fetch(`${jevBaseUrl}/v1/systemone`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-eval-fixture": fixture },
      body: JSON.stringify({
        state: String(transcript).slice(0, 4000),
        model: "jev-latest",
        fixture,
        questions: {
          verdict: { type: "choice", instructions: "Decide auto or human_review.", criteria: { auto: "Safe to automate.", human_review: "Needs human review." } },
          quality: { type: "score", instructions: "Rate quality on five ordered levels.", criteria: ["poor", "weak", "adequate", "strong", "excellent"] },
          grounded: { type: "noul", instructions: "Every claim grounded?", criteria: { true: "Every claim is grounded.", false: "A claim is not grounded." } },
        },
      }),
    });
    assert(res.ok, `mock jev 200 (got ${res.status})`);
    const { answers } = (await res.json()) as any;
    // The request names this Score question `quality`; keep the adapter keyed
    // to the actual wire name so a missing answer cannot silently become NaN.
    const scoreAnswer = answers.quality;
    // Normalize TypeSafe's weighted Score index (0..4) to the chain's 0..1 score.
    const score = Math.max(0, Math.min(1, Number(scoreAnswer?.score) / 4));
    // The route Choice carries the fixture's gate confidence; use it for the
    // chain confidence so the clean fixture exercises the early-exit path.
    const confidence = Number(answers.verdict?.confidence);
    return {
      score: +score.toFixed(3),
      dimensions: Object.fromEntries(DIMS.map((k) => [k, +score.toFixed(3)])),
      confidence,
      tokens: Math.ceil(String(transcript).length / 4),
    };
  };
}

function llmStub(calls: { n: number }) {
  return async () => {
    calls.n += 1;
    return {
      score: 0.35,
      dimensions: Object.fromEntries(DIMS.map((k) => [k, 0.35])),
    };
  };
}

function fakeRes(): any {
  const r: any = { statusCode: 0, body: null };
  r.setHeader = () => undefined;
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (o: unknown) => { r.body = o; return r; };
  return r;
}

async function main(): Promise<void> {
  const { url, close, stats } = await startMockJev(0);

  // 1. Live Needle sidecar on the strong transcript.
  const side = sidecarExtract(STRONG_TRANSCRIPT);
  assertEqual(side.ok, true, "sidecar ok");
  assert(typeof side.turn_facts?.hedge_count === "number", "hedge_count is regex int");
  assert(typeof side.turn_facts?.cited_any !== "undefined", "cited_any present");
  const gated = fromSidecar(side);
  assert(gated.turnFacts !== null, "gate keeps turnFacts");
  console.log(`sidecar: ok ms=${side.ms} authority=${side.authority_status} cited=${side.cited_status} hedge_count=${side.turn_facts.hedge_count}`);

  // 2. Chain early-exit: high-conf mock JEV near heuristic -> auto, LLM skipped.
  const h = heuristic(STRONG_TRANSCRIPT);
  const llm1 = { n: 0 };
  const early = await runChain(
    { transcript: STRONG_TRANSCRIPT, needle: gated.turnFacts ?? {} },
    { jev: mockJevAdapter(url, "clean-cite"), llmJudge: llmStub(llm1) },
  );
  const gap = Math.abs(h.score - 0.8);
  assert(gap <= 0.3, `precondition gap<=0.3 (h=${h.score} gap=${gap.toFixed(3)})`);
  assertEqual(early.decision, "auto", "clean path decision");
  assertEqual(early.voters.length, 2, "early-exit voters [heuristic, jev]");
  assertEqual(early.usage.llmSkipped, true, "LLM skipped on clean turn");
  assertEqual(llm1.n, 0, "LLM judge not called");
  in01(early.score, "early score");
  for (const k of DIMS) in01((early.dimensions as any)[k], `dim ${k}`);

  // 3. Chain gated: low-conf mock JEV (0.52 < 0.6) -> LLM runs -> human_review (sticky).
  const llm2 = { n: 0 };
  const gatedOut = await runChain(
    { transcript: HEDGED_TRANSCRIPT },
    { jev: mockJevAdapter(url, "hedged"), llmJudge: llmStub(llm2) },
  );
  assertEqual(gatedOut.decision, "human_review", "hedged path decision");
  assertEqual(gatedOut.voters.length, 3, "gated voters [heuristic, jev, llm]");
  assertEqual(gatedOut.usage.llmSkipped, false, "LLM ran on gated turn");
  assertEqual(llm2.n, 1, "LLM judge called exactly once");

  // 4. Real missing-key path: defaultJev with no TYPESAFE_API_KEY -> chain-degraded,
  //    chain degrades to heuristic+LLM, never crashes.
  const savedKey = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    await defaultJev(STRONG_TRANSCRIPT, {});
    throw new Error("defaultJev should have thrown without key");
  } catch (e: any) {
    assertEqual(e?.code, "chain-degraded", "missing key code");
  }
  const llm3 = { n: 0 };
  const degraded = await runChain({ transcript: STRONG_TRANSCRIPT }, { llmJudge: llmStub(llm3) });
  assertEqual(degraded.code, "chain-degraded", "degraded code");
  assertEqual(degraded.decision, "human_review", "degraded decision");
  assertEqual((degraded.voters as any[])[1]?.error, "chain-degraded", "jev voter error");
  assertEqual(llm3.n, 1, "LLM covers degraded turn");
  if (savedKey !== undefined) process.env.TYPESAFE_API_KEY = savedKey;

  // 5. Dispatcher routing behind api/lexforge.js (JEV_MOCK=1 canned client, no net).
  // The production JEV client honors JEV_MOCK=1 without requiring a key.
  process.env.JEV_MOCK = "1";
  const savedKey2 = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "test-dummy-key-not-real";
  try {
    const get = fakeRes();
    await (dispatcher as any)({ method: "GET", query: { fn: "chain" }, body: {} }, get);
    assertEqual(get.statusCode, 405, "GET chain -> 405");
    const nf = fakeRes();
    await (dispatcher as any)({ method: "POST", query: { fn: "nope" }, body: {} }, nf);
    assertEqual(nf.statusCode, 404, "unknown fn -> 404");
    const ok = fakeRes();
    await (dispatcher as any)(
      { method: "POST", query: { fn: "chain" }, body: { transcript: STRONG_TRANSCRIPT } },
      ok,
    );
    assertEqual(ok.statusCode, 200, "POST chain -> 200 (early exit, no LLM)");
    assertEqual((ok.body as any)?.decision, "auto", "dispatcher chain decision");
    assertEqual((ok.body as any)?.voters?.length, 2, "dispatcher voters");
  } finally {
    delete process.env.JEV_MOCK;
    if (savedKey2 === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = savedKey2;
  }

  // 6. Mock wire honesty: exactly the 2 adapter calls above, zero shape errors.
  assertEqual(stats.requests, 2, "mock saw exactly 2 JEV calls");
  assertEqual(stats.shapeErrors, 0, "zero malformed JEV requests");
  await close();
  console.log("integration.test.ts passed (mock JEV + live sidecar + chain + dispatcher)");
}

main().catch((e) => {
  console.error(`FAIL: ${e?.stack || e}`);
  process.exit(1);
});
