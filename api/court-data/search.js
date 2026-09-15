// Vercel Node.js serverless function — official Indian court data gateway.
// Plain .js on purpose: the previous search.ts imported TS directly, which
// broke the remote bundle while local tests stayed green (prod 500 on every
// query). Logic lives in api/_lib/courtDataGateway.js, compiled from
// services/courtDataGateway.ts via esbuild. Recompile after editing the TS:
//   ./node_modules/.bin/esbuild services/courtDataGateway.ts --platform=node \
//     --format=esm --outfile=api/_lib/courtDataGateway.js
import {
  allowRequest,
  applyCors,
  clientError,
  enforceBodyLimit,
} from '../_lib/security.js';
import {
  ALLOWED_COURT_DATA_FILTERS,
  buildCourtDataResponse,
  CourtDataQueryError,
} from '../_lib/courtDataGateway.js';

const CACHE_CONTROL_GET = 'public, max-age=60, stale-while-revalidate=300';

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    const trimmed = req.body.trim();
    if (!trimmed) return {};
    const parsed = JSON.parse(trimmed);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new CourtDataQueryError('Query payload must be an object.');
    }
    return parsed;
  }
  if (typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body;
  }
  throw new CourtDataQueryError('Query payload must be an object.');
}

function parseGetQuery(req) {
  if (req.query && typeof req.query === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) out[key] = value[0];
      else if (value !== undefined) out[key] = value;
    }
    return out;
  }
  const url = new URL(req.url || '/api/court-data/search', 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

function setSafeHeaders(res, method) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (method === 'GET') {
    res.setHeader('Cache-Control', CACHE_CONTROL_GET);
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
}

export default async function handler(req, res) {
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
