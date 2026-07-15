import type { PracticeMode } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────
//
// The 7-Phase Synthesis chamber uses these to (a) feed Stage 2 with real
// retrieved precedents instead of model param-memory, and (b) feed Stage 5
// with treatment-status evidence for citation audit. The shape matches the
// response of /api/caselaw so the wire is one-to-one with no translation.

export interface CaselawResult {
  title: string;
  citation: string;
  court: string;
  date: string;
  docid: string;
  url: string;
  snippet: string;
}

export interface CaselawResponse {
  results: CaselawResult[];
  jurisdiction: 'indian' | 'common';
  provider: string | null;
  available: boolean;
  message?: string;
}

export type CaselawJurisdiction = 'indian' | 'common';
export type IndianCourtFilter =
  | 'all'
  | 'supreme_court'
  | 'high_courts'
  | 'delhi_high_court'
  | 'bombay_high_court'
  | 'karnataka_high_court'
  | 'allahabad_high_court'
  | 'madras_high_court';

export interface CaselawSearchOptions {
  court?: IndianCourtFilter;
  fromDate?: string;
  toDate?: string;
}

class CaselawServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaselawServiceError';
  }
}

// ─── Single-shot search ───────────────────────────────────────────────────────
//
// Translates the app's `practiceMode` ('indian' | 'common' from types.ts) into
// the wire-up jurisdiction the backend expects. The backend returns 200 even
// on failure-with-graceful-fallback so callers can rely on the resolved
// promise and read `.available` + `message` to decide UI treatment.

export const searchCaselaw = async (
  query: string,
  practiceMode: PracticeMode | 'common',
  limit: number = 8,
  pagenum: number = 0,
  options: CaselawSearchOptions = {},
): Promise<CaselawResponse> => {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    return {
      results: [],
      jurisdiction: practiceMode === 'indian' ? 'indian' : 'common',
      provider: null,
      available: false,
      message: 'Empty query.',
    };
  }

  const jurisdiction: CaselawJurisdiction = practiceMode === 'indian' ? 'indian' : 'common';

  let res: Response;
  try {
    res = await fetch('/api/caselaw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: trimmed, jurisdiction, limit, pagenum, ...options }),
    });
  } catch (err) {
    throw new CaselawServiceError(`Network error reaching /api/caselaw: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new CaselawServiceError(errData.error || `Caselaw service error (${res.status})`);
  }

  const data = (await res.json()) as CaselawResponse;
  // Backend always includes these; ensure they're never absent in caller code.
  return {
    results: Array.isArray(data.results) ? data.results : [],
    jurisdiction: data.jurisdiction || jurisdiction,
    provider: data.provider ?? null,
    available: !!data.available,
    message: data.message,
  };
};

// ─── Citation candidate extraction prompt ─────────────────────────────────────
//
// Stage 5 of Synthesis needs to know which case-citation strings appear in
// Stage 4's strategy text so it can batch-verify them. We don't ship this
// prompt through /api/caselaw (which is a search proxy only); the caller
// POSTs it to /api/chat directly and hands the parsed list back. Keeping the
// prompt next to the service means there's one place that knows the JSON
// contract the reasoner is asked to emit.

export const CITATION_EXTRACTOR_SYSTEM = `You extract case-citation candidates from legal text.
Read the supplied legal strategy text and return ONLY a raw JSON array of objects
with keys "caseName" (string, the popular or short case name as written) and
"citation" (string, the neutral or reporter citation as written, or "" if none).
Do not include surrounding markdown, no commentary, no prose. If you find no
citations, return the empty array []. Identify at most 12 candidates, ranked by
prominence in the text.`;
