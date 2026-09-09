// Legal-BERT cross-encoder stub (heuristic). Swap `CrossEncoder.score`
// with a real model later — same signature, no call-site changes.
export interface RerankQuery { text: string; jurisdiction?: string; citations?: string[] }
export interface RerankPassage { id: string; text: string; jurisdiction?: string; year?: number; citations?: string[] }
export interface RankedPassage extends RerankPassage { score: number }
export type ScoreFn = (query: RerankQuery | string, passages: RerankPassage[], opts?: { now?: number }) => RankedPassage[];
export interface CrossEncoder { score: ScoreFn }

const W = { term: 0.45, cite: 0.2, juris: 0.2, recency: 0.15 };
const MIN = 0.4;
const TOP_K = 8;
const STOP = new Set("a,an,the,and,or,of,to,in,on,for,with,by,is,are,was,were,what,when,where,which,who,how,does,do,did,v,vs".split(","));
const toks = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2 && !STOP.has(t));
const CITE_RE = /\b\d+\s+[A-Z][\w.]*\s+\d+\b/g;
const norm = (s?: string): string => (s ?? "").trim().toLowerCase();
const citesOf = (text: string, extra?: string[]): Set<string> =>
  new Set([...(text.match(CITE_RE) ?? []).map((c) => norm(c)), ...(extra ?? []).map(norm)]);
function termCoverage(qt: string[], pt: Set<string>): number {
  if (!qt.length) return 0;
  return qt.filter((t) => pt.has(t)).length / qt.length;
}
const jurisScore = (q?: string, p?: string): number => (!q || !p ? 0.5 : norm(q) === norm(p) ? 1 : 0);
const recencyScore = (y?: number, now = new Date().getFullYear()): number =>
  y == null ? 0.5 : Math.max(0, Math.min(1, 1 - (now - y) / 30));
function citeOverlap(q: Set<string>, p: Set<string>): number {
  if (!q.size) return 0.5;
  let hit = 0;
  for (const c of q) if (p.has(c)) hit++;
  return hit / q.size;
}
export function score(query: RerankQuery | string, passages: RerankPassage[], opts?: { now?: number }): RankedPassage[] {
  const q = typeof query === "string" ? { text: query } : query;
  const qt = [...new Set(toks(q.text ?? ""))];
  const qc = citesOf(q.text ?? "", q.citations);
  const now = opts?.now ?? new Date().getFullYear();
  return passages
    .map((p) => {
      const s =
        W.term * termCoverage(qt, new Set(toks(p.text ?? ""))) +
        W.cite * citeOverlap(qc, citesOf(p.text ?? "", p.citations)) +
        W.juris * jurisScore(q.jurisdiction, p.jurisdiction) +
        W.recency * recencyScore(p.year, now);
      return { ...p, score: Math.round(s * 1000) / 1000 };
    })
    .filter((r) => r.score >= MIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}
export const LegalBertStub: CrossEncoder = { score };
