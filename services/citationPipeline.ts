// LexForge citationPipeline: retrieve → rerank → fetch → NLI verify. Interfaces + stubs, no heavy deps.
export type Source = "courtlistener" | "cap";
export type Verdict = "VERIFIED" | "UNVERIFIED-LEAD";
export interface CitationQuery { text: string; topK?: number; alpha?: number }
export interface Candidate { id: string; source: Source; cite: string; bm25: number; emb: number; ret: number; snippet: string }
export interface Reranked extends Candidate { rank: number }
export interface Verified extends Reranked { fullText: string | null; fetch: number; entail: number; conf: number; status: Verdict }
export interface RawHit { id: string; cite: string; snippet: string }
export const RERANK_MIN = 0.40, VERIFY_MIN = 0.80;
export const hybrid = (b: number, e: number, a = 0.5): number => a * b + (1 - a) * e;
const tok = (s: string): Set<string> => new Set(s.toLowerCase().split(/\W+/).filter(Boolean));
const overlap = (q: string, d: string): number => {
  const a = tok(q), b = tok(d); if (!a.size || !b.size) return 0;
  let n = 0; for (const t of a) if (b.has(t)) n++;
  return n / Math.sqrt(a.size * b.size);
};
// --- Retrieval stubs: wire to CourtListener Search API + CAP API ---
export function bm25Stub(q: string, d: string): number { return Math.min(1, overlap(q, d) * 1.2); }
export function embedStub(q: string, d: string): number { return overlap(q, d); } // swap for real embeddings
async function searchCourtListener(_q: string): Promise<RawHit[]> { return []; } // TODO: GET courtlistener.com/api/v3/search/
async function searchCAP(_q: string): Promise<RawHit[]> { return []; } // TODO: GET api.case.law/v1/cases/?search=
function toCandidate(h: RawHit, source: Source, q: string, alpha: number): Candidate {
  const bm25 = bm25Stub(q, h.snippet), emb = embedStub(q, h.snippet);
  return { ...h, source, bm25, emb, ret: hybrid(bm25, emb, alpha), snippet: h.snippet };
}
export async function retrieve(query: CitationQuery): Promise<Candidate[]> {
  const alpha = query.alpha ?? 0.5, topK = query.topK ?? 10;
  const [cl, cap] = await Promise.all([searchCourtListener(query.text), searchCAP(query.text)]);
  return [...cl.map((h) => toCandidate(h, "courtlistener", query.text, alpha)),
    ...cap.map((h) => toCandidate(h, "cap", query.text, alpha))]
    .sort((x, y) => y.ret - x.ret).slice(0, topK);
}
// --- Rerank: cross-encoder stub, drop < 0.40 ---
export function crossEncodeStub(q: string, d: string): number { return overlap(q, d); } // TODO: real cross-encoder
export function rerank(q: string, cs: Candidate[]): Reranked[] {
  return cs.map((c) => ({ ...c, rank: crossEncodeStub(q, c.snippet + " " + c.cite) }))
    .filter((c) => c.rank >= RERANK_MIN).sort((x, y) => y.rank - x.rank);
}
// --- Fetch full text via citation-lookup stub ---
export async function lookupFullText(_cite: string): Promise<{ text: string | null; fetch: number }> {
  return { text: null, fetch: 0 }; // TODO: resolve via citation-lookup (reporter → CAP/CL opinion text)
}
// --- NLI entailment verify stub ---
export function nliEntailStub(claim: string, ev: string | null): number {
  if (!ev) return 0; return overlap(claim, ev.slice(0, 2000)); // TODO: real NLI (entail/contra/neutral)
}
export const confidence = (rank: number, entail: number, fetch: number, ret: number): number =>
  Math.min(1, Math.max(0, 0.3 * rank + 0.3 * entail + 0.25 * fetch + 0.15 * ret));
export async function verifyCitation(claim: string, r: Reranked): Promise<Verified> {
  const { text, fetch } = await lookupFullText(r.cite);
  const entail = nliEntailStub(claim, text);
  const conf = confidence(r.rank, entail, fetch, r.ret);
  const status: Verdict = conf >= VERIFY_MIN ? "VERIFIED" : "UNVERIFIED-LEAD";
  return { ...r, fullText: text, fetch, entail, conf, status };
}
export async function runPipeline(query: CitationQuery): Promise<Verified[]> {
  const rs = rerank(query.text, await retrieve(query));
  return Promise.all(rs.map((r) => verifyCitation(query.text, r)));
}
// UNVERIFIED-LEAD is blocked from export; only VERIFIED leaves the pipeline.
export const isExportable = (v: Verified): boolean => v.status === "VERIFIED";
export function exportVerified(vs: Verified[]): Verified[] {
  const blocked = vs.filter((v) => !isExportable(v)).length;
  if (blocked) console.warn(`[LexForge] blocked ${blocked} UNVERIFIED-LEAD from export`);
  return vs.filter(isExportable);
}
