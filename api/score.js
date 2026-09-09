// LexForge hybrid scorer: heuristic (port of trialScoring.ts) + LLM judge.
// POST {transcript,rubric_version,phase} -> {score,dimensions,voters,decision}
const DIMS = ["clarity", "reasoning", "authority", "rebuttal", "delivery"];
const W_H = 0.3, W_LLM = 0.7, ABSTAIN_GAP = 0.3;
const traces = (globalThis.__lfTraces ??= []);
const clamp = (x) => Math.max(0, Math.min(1, x));
// Heuristic port: keyword/coverage/length signals per dimension, 0..1.
function heuristic(transcript) {
  const t = transcript || "";
  const n = t.split(/\s+/).filter(Boolean).length;
  const hits = (re) => (t.match(re) || []).length;
  const dimensions = {
    clarity: clamp(0.4 + n / 800 - hits(/\bum\b|\buh\b|like,|you know/gi) * 0.05),
    reasoning: clamp(0.25 + hits(/because|therefore|however|it follows|given that/gi) * 0.12 + hits(/issue|rule|application|conclusion/gi) * 0.08),
    authority: clamp(0.15 + hits(/ v\.| vs\.|AIR|SCC|section|article|§|precedent|held that/gi) * 0.15),
    rebuttal: clamp(0.2 + hits(/objection|overruled|sustained|distinguish|rebuttal|cross-examin/gi) * 0.18),
    delivery: clamp(0.5 + n / 1200 - hits(/\?\?+|!!+/g) * 0.1),
  };
  const score = DIMS.reduce((a, k) => a + dimensions[k], 0) / DIMS.length;
  return { score: +score.toFixed(3), dimensions };
}
// LLM judge: temp 0, JSON out.
async function llmJudge(transcript, rubric_version, phase) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.LF_MODEL || "gpt-4o-mini", temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `You are LexForge trial judge. Rubric ${rubric_version}, phase ${phase}. Score 0..1. Return JSON only: {"score":0..1,"dimensions":{"clarity":0..1,"reasoning":0..1,"authority":0..1,"rebuttal":0..1,"delivery":0..1}}.` },
        { role: "user", content: transcript.slice(0, 12000) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`llm ${res.status}`);
  const j = await res.json();
  const o = JSON.parse(j.choices[0].message.content);
  const dimensions = Object.fromEntries(DIMS.map((k) => [k, clamp(Number(o.dimensions?.[k] ?? o[k] ?? 0))]));
  return { score: clamp(Number(o.score)), dimensions };
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { transcript, rubric_version = "v1", phase = "trial" } = req.body || {};
  if (!transcript || typeof transcript !== "string" || transcript.length < 10)
    return res.status(400).json({ error: "transcript required" });
  try {
    const [h, l] = await Promise.all([Promise.resolve(heuristic(transcript)), llmJudge(transcript, rubric_version, phase)]);
    const dimensions = Object.fromEntries(DIMS.map((k) => [k, +((h.dimensions[k] * W_H + l.dimensions[k] * W_LLM).toFixed(3))]));
    const score = +((h.score * W_H + l.score * W_LLM).toFixed(3));
    const gap = Math.abs(h.score - l.score);
    const decision = gap > ABSTAIN_GAP ? "human_review" : "auto";
    const voters = [{ source: "heuristic", score: h.score }, { source: "llm", score: l.score }];
    const trace = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), rubric_version, phase, h, l, score, gap, decision };
    traces.push(trace); // in-memory; swap for KV/Blob in prod
    console.log(JSON.stringify({ lexforge_trace: trace, len: transcript.length }));
    return res.status(decision === "human_review" ? 202 : 200).json({ score, dimensions, voters, decision });
  } catch (e) {
    const h = heuristic(transcript); // LLM down -> abstain to human queue
    const trace = { id: `${Date.now()}-err`, at: new Date().toISOString(), rubric_version, phase, h, error: String(e), decision: "human_review" };
    traces.push(trace); console.error(JSON.stringify({ lexforge_trace: trace }));
    return res.status(202).json({ score: h.score, dimensions: h.dimensions, voters: [{ source: "heuristic", score: h.score }, { source: "llm", score: null, error: "judge_failed" }], decision: "human_review" });
  }
}
