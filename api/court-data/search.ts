// Vercel Node.js 18+ serverless function — official Indian court data gateway.
//
// Pure catalog / filter / ranking logic lives in services/courtDataGateway.ts
// (single source of truth; covered by unit tests). This file is the thin HTTP
// shell: CORS, rate limit, body size, method routing, and error mapping.
//
// Compliance: returns official source references only. Does not scrape
// captcha-protected / session-only court portals or paid legal databases.
// CORS / origin policy lives only in security.js (ALLOWED_ORIGINS / APP_ORIGIN).

import {
  allowRequest,
  applyCors,
  clientError,
  enforceBodyLimit,
} from '../security.js';
import {
  ALLOWED_COURT_DATA_FILTERS,
  buildCourtDataResponse,
  CourtDataQueryError,
} from '../../services/courtDataGateway';

const CACHE_CONTROL_GET = 'public, max-age=60, stale-while-revalidate=300';

/** Minimal Vercel-style request surface used by this handler. */
type CourtDataRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined> & {
    origin?: string;
    'x-forwarded-for'?: string;
    'content-length'?: string;
  };
  url?: string;
  socket?: { remoteAddress?: string };
};

/** Minimal Vercel-style response surface used by this handler. */
type CourtDataResponseWriter = {
  status: (code: number) => CourtDataResponseWriter;
  json: (body: unknown) => unknown;
  setHeader: (name: string, value: string) => unknown;
  end: () => unknown;
};

function parseBody(req: CourtDataRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    const trimmed = req.body.trim();
    if (!trimmed) return {};
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new CourtDataQueryError('Query payload must be an object.');
    }
    return parsed as Record<string, unknown>;
  }
  if (typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  throw new CourtDataQueryError('Query payload must be an object.');
}

function parseGetQuery(req: CourtDataRequest): Record<string, unknown> {
  // Prefer already-parsed Vercel query when present (avoids double-parse).
  if (req.query && typeof req.query === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) out[key] = value[0];
      else if (value !== undefined) out[key] = value;
    }
    return out;
  }
  // Base URL is only used to resolve relative req.url; not an allow-list origin.
  const url = new URL(req.url || '/api/court-data/search', 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

function setSafeHeaders(res: CourtDataResponseWriter, method: string | undefined) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Directory responses are cacheable briefly for GET; POST stays private.
  if (method === 'GET') {
    res.setHeader('Cache-Control', CACHE_CONTROL_GET);
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
}

export default async function handler(req: CourtDataRequest, res: CourtDataResponseWriter) {
  if (!applyCors(req, res, 'GET, POST, OPTIONS')) {
    return res.status(403).json(clientError('Origin is not allowed.'));
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json(clientError('Method not allowed'));
  }
  if (!allowRequest(req, { limit: 60, windowMs: 60_000 })) {
    return res
      .status(429)
      .json(clientError('Too many requests. Please wait a minute and try again.'));
  }
  if (req.method === 'POST' && !enforceBodyLimit(req, res)) return;

  try {
    const rawQuery = req.method === 'GET' ? parseGetQuery(req) : parseBody(req);
    const payload = buildCourtDataResponse(rawQuery);
    setSafeHeaders(res, req.method);
    return res.status(200).json(payload);
  } catch (error) {
    if (error instanceof CourtDataQueryError) {
      setSafeHeaders(res, req.method);
      return res.status(400).json(
        clientError(error.message, {
          allowed: ALLOWED_COURT_DATA_FILTERS,
        }),
      );
    }
    if (error instanceof SyntaxError) {
      setSafeHeaders(res, req.method);
      return res.status(400).json(clientError('Invalid JSON'));
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('Court data gateway failure:', message);
    setSafeHeaders(res, req.method);
    return res.status(500).json(clientError('Court data gateway failed'));
  }
}
