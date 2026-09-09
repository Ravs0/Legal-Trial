// api/_lib/caselawAdapters.ts — unified case/statute search: IndianKanoon + CourtListener v4 + Congress.gov/eCFR.
// searchCases(q, jurisdiction) → normalized CaseHit[]. Per-source confidence base, 8s timeout, zero deps.
export interface CaseHit { title: string; citation: string; court: string; date: string; url: string; snippet: string; confidence: number; verified: boolean }
const TIMEOUT_MS = 8000;
const BASE = { kanoon: 0.75, cl: 0.85, congress: 0.8, ecfr: 0.8 }; // per-source confidence base
const ok = (r: Response) => { if (!r.ok) throw new Error(`http:${r.status}`); return r.json() as Promise<any>; };
async function get(url: string, init: RequestInit = {}, ms = TIMEOUT_MS): Promise<any> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await ok(await fetch(url, { ...init, signal: c.signal })); } finally { clearTimeout(t); }
}
const snip = (s: unknown, n = 240): string => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const conf = (b: number, x = 0): number => Math.round(Math.min(0.98, b + x) * 1000) / 1000;
const isCite = (q: string): boolean => /\b\d+\s+(U\.S\.|F\.\d+d|S\.Ct\.|AIR|SCC|SCR)\s+\d+/i.test(q);
// --- IndianKanoon: POST search, Token auth, structured docs ---
async function fromKanoon(q: string): Promise<CaseHit[]> {
  const tok = process.env.INDIANKANOON_TOKEN; if (!tok) return [];
  const d = await get("https://api.indiankanoon.org/search/", {
    method: "POST", headers: { Authorization: `Token ${tok}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ formInput: q, pagenum: "0" }),
  });
  return (d?.docs ?? []).slice(0, 5).map((x: any): CaseHit => ({
    title: x.title ?? "Unknown", citation: x.citation ?? x.docsource ?? "", court: x.docsource ?? "IndianKanoon",
    date: x.date ?? "", url: `https://indiankanoon.org/doc/${x.tid ?? ""}/`, snippet: snip(x.headline ?? x.title),
    confidence: conf(BASE.kanoon, x.citation ? 0.08 : 0), verified: true,
  }));
}
// --- CourtListener v4: Token auth; citation-lookup for cites, search/ for text ---
async function fromCL(q: string): Promise<CaseHit[]> {
  const tok = process.env.COURTLISTENER_TOKEN; if (!tok) return [];
  const H = { Authorization: `Token ${tok}` };
  if (isCite(q)) {
    const d = await get("https://www.courtlistener.com/api/rest/v4/citation-lookup/", {
      method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ text: q }),
    });
    const arr = Array.isArray(d) ? d : (d?.results ?? []);
    return arr.slice(0, 3).map((x: any): CaseHit => ({
      title: x.case_name ?? x.caseName ?? q, citation: q, court: x.court ?? "", date: x.date_filed ?? "",
      url: x.absolute_url ? `https://www.courtlistener.com${x.absolute_url}` : "", snippet: snip(x.snippet ?? x.case_name),
      confidence: conf(BASE.cl, 0.1), verified: true,
    }));
  }
  const d = await get(`https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(q)}&type=o`, { headers: H });
  return (d?.results ?? []).slice(0, 5).map((x: any): CaseHit => ({
    title: x.caseName ?? "Unknown", citation: x.citation?.[0] ?? "", court: x.court ?? "",
    date: x.dateFiled ?? "", url: x.absolute_url ? `https://www.courtlistener.com${x.absolute_url}` : "",
    snippet: snip(x.snippet), confidence: conf(BASE.cl, x.citation?.length ? 0.05 : 0), verified: true,
  }));
}
// --- Statutes: Congress.gov (api_key) + eCFR (open) ---
async function fromStatutes(q: string): Promise<CaseHit[]> {
  const out: CaseHit[] = [];
  const key = process.env.CONGRESS_API_KEY;
  if (key) {
    const d = await get(`https://api.congress.gov/v3/search?q=${encodeURIComponent(q)}&api_key=${key}`);
    for (const x of (d?.search?.results ?? d?.results ?? []).slice(0, 3)) out.push({
      title: x.title ?? q, citation: x.citation ?? x.number ?? "", court: "U.S. Congress",
      date: x.updateDate ?? "", url: x.url ?? "", snippet: snip(x.title), confidence: conf(BASE.congress), verified: true,
    });
  }
  const e = await get(`https://www.ecfr.gov/api/search/v1/results?query=${encodeURIComponent(q)}&per_page=3`);
  for (const x of (e?.results ?? []).slice(0, 3)) out.push({
    title: x.headings?.title ?? x.title ?? q, citation: x.citation ?? x.part ?? "", court: "eCFR",
    date: x.date ?? "", url: x.source_url ?? "https://www.ecfr.gov/", snippet: snip(x.excerpts?.[0] ?? x.title),
    confidence: conf(BASE.ecfr), verified: true,
  });
  return out;
}
// --- Unified entry: IN→Kanoon first; US→CL+statutes; default→all, best-confidence first ---
export async function searchCases(q: string, jurisdiction = "US"): Promise<CaseHit[]> {
  const j = jurisdiction.toUpperCase();
  const jobs: Promise<CaseHit[]>[] = j.startsWith("IN")
    ? [fromKanoon(q), fromCL(q)]
    : j === "US" ? [fromCL(q), fromStatutes(q)] : [fromCL(q), fromKanoon(q), fromStatutes(q)];
  const got = await Promise.all(jobs.map((p) => p.catch((): CaseHit[] => [])));
  return got.flat().sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}
export const TIMEOUT = TIMEOUT_MS;
