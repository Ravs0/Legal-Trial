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
  source?: string;
  verification?: 'provider_metadata' | 'public_web_discovery';
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
  /** Optional abort signal so callers can cancel stale searches. */
  signal?: AbortSignal;
}

const INDIAN_COURT_FILTERS: readonly IndianCourtFilter[] = [
  'all',
  'supreme_court',
  'high_courts',
  'delhi_high_court',
  'bombay_high_court',
  'karnataka_high_court',
  'allahabad_high_court',
  'madras_high_court',
] as const;

const MAX_QUERY_LENGTH = 500;
const MIN_LIMIT = 1;
const MAX_LIMIT = 25;
const DEFAULT_LIMIT = 8;
const SAFE_URL = /^https?:\/\//i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CaselawServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaselawServiceError';
  }
}

function asString(value: unknown, maxLen = 2000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function sanitizeUrl(raw: unknown): string {
  const url = asString(raw, 2000);
  if (!url || !SAFE_URL.test(url)) return '';
  try {
    return new URL(url).toString();
  } catch {
    return '';
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeCourtFilter(court: unknown): IndianCourtFilter | undefined {
  if (court === undefined || court === null || court === '') return undefined;
  if (typeof court === 'string' && (INDIAN_COURT_FILTERS as readonly string[]).includes(court)) {
    return court as IndianCourtFilter;
  }
  throw new CaselawServiceError(
    `Invalid court filter. Allowed: ${INDIAN_COURT_FILTERS.join(', ')}.`,
  );
}

function normalizeDateField(value: unknown, field: 'fromDate' | 'toDate'): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const date = asString(value, 32);
  if (!isIsoDate(date)) {
    throw new CaselawServiceError(`${field} must be a valid ISO date (YYYY-MM-DD).`);
  }
  return date;
}

function normalizeOptions(options: CaselawSearchOptions = {}): CaselawSearchOptions {
  const court = normalizeCourtFilter(options.court);
  const fromDate = normalizeDateField(options.fromDate, 'fromDate');
  const toDate = normalizeDateField(options.toDate, 'toDate');

  if (fromDate && toDate && fromDate > toDate) {
    throw new CaselawServiceError('fromDate must be on or before toDate.');
  }

  return {
    ...(court ? { court } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
  };
}

function normalizeResult(raw: unknown): CaselawResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const title = asString(row.title, 400);
  const url = sanitizeUrl(row.url);
  const snippet = asString(row.snippet, 800);
  // Drop empty shells so callers never render placeholder cards as hits.
  if (!title && !url && !snippet) return null;

  const verificationRaw = asString(row.verification, 64);
  const verification =
    verificationRaw === 'provider_metadata' || verificationRaw === 'public_web_discovery'
      ? verificationRaw
      : undefined;

  return {
    title: title || 'Untitled judgment',
    citation: asString(row.citation, 200),
    court: asString(row.court, 200),
    date: asString(row.date, 64),
    docid: asString(row.docid, 120),
    url,
    snippet,
    source: asString(row.source, 120) || undefined,
    verification,
  };
}

/** Normalize a raw API payload into a stable CaselawResponse contract. */
export function normalizeCaselawResponse(
  data: unknown,
  fallbackJurisdiction: CaselawJurisdiction,
): CaselawResponse {
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const results = Array.isArray(body.results)
    ? body.results.map(normalizeResult).filter((r): r is CaselawResult => r !== null)
    : [];

  const jurisdiction: CaselawJurisdiction =
    body.jurisdiction === 'indian' || body.jurisdiction === 'common'
      ? body.jurisdiction
      : fallbackJurisdiction;

  const provider =
    typeof body.provider === 'string' && body.provider.trim()
      ? body.provider.trim()
      : null;

  const available = Boolean(body.available);
  let message = typeof body.message === 'string' ? body.message.trim() : undefined;

  if (!available && !message) {
    message = jurisdiction === 'common'
      ? 'Common-law live lookup is not configured. Use official court portals for verification.'
      : 'Case-law lookup is currently unavailable.';
  } else if (available && results.length === 0 && !message) {
    message = 'No judgments matched those filters.';
  }

  return {
    results,
    jurisdiction,
    provider,
    available,
    message,
  };
}

function emptyResponse(
  jurisdiction: CaselawJurisdiction,
  message: string,
): CaselawResponse {
  return {
    results: [],
    jurisdiction,
    provider: null,
    available: false,
    message,
  };
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
  limit: number = DEFAULT_LIMIT,
  pagenum: number = 0,
  options: CaselawSearchOptions = {},
): Promise<CaselawResponse> => {
  const jurisdiction: CaselawJurisdiction = practiceMode === 'indian' ? 'indian' : 'common';
  const trimmed = (query || '').trim().replace(/\s+/g, ' ');

  if (!trimmed) {
    return emptyResponse(jurisdiction, 'Enter a case name, citation, or legal issue to search.');
  }
  if (trimmed.length < 2) {
    return emptyResponse(jurisdiction, 'Query is too short. Use at least 2 characters.');
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return emptyResponse(
      jurisdiction,
      `Query is too long (max ${MAX_QUERY_LENGTH} characters).`,
    );
  }

  const safeLimit = clampInt(limit, DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT);
  const safePage = clampInt(pagenum, 0, 0, 1000);
  const { signal, ...optionFields } = options;
  const safeOptions = normalizeOptions(optionFields);

  if (signal?.aborted) {
    throw new CaselawServiceError('Search cancelled.');
  }

  let res: Response;
  try {
    res = await fetch('/api/caselaw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: trimmed,
        jurisdiction,
        limit: safeLimit,
        pagenum: safePage,
        ...safeOptions,
      }),
      signal,
    });
  } catch (err) {
    if (
      signal?.aborted
      || (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message)))
      || (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
    ) {
      throw new CaselawServiceError('Search cancelled.');
    }
    throw new CaselawServiceError(
      `Network error reaching case-law service: ${(err as Error).message || 'request failed'}`,
    );
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    const errMsg =
      errData && typeof errData === 'object' && typeof (errData as { error?: unknown }).error === 'string'
        ? (errData as { error: string }).error
        : `Case-law service error (${res.status})`;
    throw new CaselawServiceError(errMsg);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new CaselawServiceError('Case-law service returned invalid JSON.');
  }

  return normalizeCaselawResponse(data, jurisdiction);
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
