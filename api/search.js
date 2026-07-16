// Vercel Node.js 18+ serverless function — Web Search API proxy
// Providers (waterfall): Tavily → Serper → DuckDuckGo HTML scrape.
// All results are sanitized (http/https only) before returning to the client.
import {
  allowRequest,
  applyCors,
  clientError,
  enforceBodyLimit,
  fetchWithTimeout,
} from './security.js';

const SAFE_URL_SCHEMES = /^(https?:\/\/)/i;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS = 8;
const MAX_TITLE = 300;
const MAX_SNIPPET = 600;
const MAX_URL = 2000;
/** Per-provider upstream budget (ms). */
const UPSTREAM_TIMEOUT_MS = 20_000;
/** Cap total waterfall so multi-provider fallback cannot burn a full Vercel window. */
const TOTAL_BUDGET_MS = 45_000;
/** Bound DuckDuckGo HTML scrape memory/time. */
const MAX_HTML_CHARS = 500_000;

function decodeHtmlEntities(str) {
  if (!str) return '';
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => entities[m] || m);
}

function cleanText(value, maxLen = MAX_SNIPPET) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function sanitizeUrl(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url) return null;
  if (url.startsWith('//')) url = `https:${url}`;
  if (!SAFE_URL_SCHEMES.test(url)) return null; // blocks javascript:, data:, etc.
  if (url.length > MAX_URL) return null;
  try {
    const parsed = new URL(url);
    // Only allow http/https after URL parse (rejects other schemes that slipped through).
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = cleanText(raw.title, MAX_TITLE);
  const url = sanitizeUrl(raw.url);
  const snippet = cleanText(raw.snippet, MAX_SNIPPET);
  if (!title && !url && !snippet) return null;
  if (!url) return null; // web hits without a safe URL are not useful
  return {
    title: title || 'Untitled',
    url,
    snippet,
  };
}

function normalizeResults(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (out.length >= MAX_RESULTS) break;
    const normalized = normalizeResult(item);
    if (!normalized) continue;
    // Dedupe by URL to avoid double-hits across scrapes.
    if (seen.has(normalized.url)) continue;
    seen.add(normalized.url);
    out.push(normalized);
  }
  return out;
}

function remainingTimeout(deadline) {
  return Math.max(1_500, Math.min(UPSTREAM_TIMEOUT_MS, deadline - Date.now()));
}

async function searchTavily(query, apiKey, timeoutMs) {
  try {
    const response = await fetchWithTimeout(
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: 'basic',
          max_results: MAX_RESULTS,
        }),
      },
      timeoutMs,
    );
    if (!response.ok) {
      console.error('Tavily search non-OK:', response.status);
      return null;
    }
    const data = await response.json();
    const mapped = (data.results || []).map((r) => ({
      title: r.title || 'Untitled',
      url: r.url || '',
      snippet: r.content || '',
    }));
    const results = normalizeResults(mapped);
    return results.length > 0 ? results : [];
  } catch (err) {
    if (err?.name === 'AbortError') {
      console.error('Tavily search timed out');
    } else {
      console.error('Tavily search failure:', err?.message || err);
    }
    return null;
  }
}

async function searchSerper(query, apiKey, timeoutMs) {
  try {
    const response = await fetchWithTimeout(
      'https://google.serper.dev/search',
      {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ q: query, num: MAX_RESULTS }),
      },
      timeoutMs,
    );
    if (!response.ok) {
      console.error('Serper search non-OK:', response.status);
      return null;
    }
    const data = await response.json();
    const mapped = (data.organic || []).map((r) => ({
      title: r.title || 'Untitled',
      url: r.link || '',
      snippet: r.snippet || '',
    }));
    const results = normalizeResults(mapped);
    return results.length > 0 ? results : [];
  } catch (err) {
    if (err?.name === 'AbortError') {
      console.error('Serper search timed out');
    } else {
      console.error('Serper search failure:', err?.message || err);
    }
    return null;
  }
}

async function searchDuckDuckGo(query, timeoutMs) {
  try {
    const response = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
      timeoutMs,
    );
    if (!response.ok) {
      console.error('DuckDuckGo scraper non-OK:', response.status);
      return null;
    }

    // Bound HTML size so a huge page cannot inflate memory on the function.
    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    const results = [];
    const blocks = html.split('<div class="result ');

    for (let i = 1; i < blocks.length && results.length < MAX_RESULTS; i++) {
      const block = blocks[i];

      const urlMatch =
        block.match(/class="result__a" href="([^"]+)"/) ||
        block.match(/href="([^"]*uddg=[^"]*)"/);
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(
        /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span|div)>/,
      );

      if (!urlMatch || !titleMatch) continue;

      let url = urlMatch[1];
      // Decode DuckDuckGo redirect if present
      if (url.includes('uddg=')) {
        const parts = url.split('uddg=');
        if (parts.length > 1) {
          try {
            url = decodeURIComponent(parts[1].split('&')[0]);
          } catch {
            continue; // Skip malformed redirects
          }
        }
      }

      const sanitizedUrl = sanitizeUrl(url);
      if (!sanitizedUrl) continue;

      // Skip internal DuckDuckGo links
      try {
        const host = new URL(sanitizedUrl).hostname.toLowerCase();
        if (host === 'duckduckgo.com' || host.endsWith('.duckduckgo.com')) continue;
      } catch {
        continue;
      }

      const title = cleanText(titleMatch[1], MAX_TITLE);
      if (!title) continue;
      const snippet = snippetMatch ? cleanText(snippetMatch[1], MAX_SNIPPET) : '';

      results.push({ title, url: sanitizedUrl, snippet });
    }
    return normalizeResults(results);
  } catch (err) {
    if (err?.name === 'AbortError') {
      console.error('DuckDuckGo search timed out');
    } else {
      console.error('DuckDuckGo search failure:', err?.message || err);
    }
    // Soft-fail: null means "provider failed", distinct from empty [] hits.
    return null;
  }
}

function parseBody(req) {
  let body = req.body;
  if (body == null || body === '') return { ok: true, body: {} };
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { ok: false, error: 'Invalid JSON' };
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  return { ok: true, body };
}

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    return res.status(403).json(clientError('Origin is not allowed.'));
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json(clientError('Method not allowed'));
  }
  if (!allowRequest(req, { limit: 20, windowMs: 60_000 })) {
    return res
      .status(429)
      .json(clientError('Too many requests. Please wait a minute and try again.'));
  }
  if (!enforceBodyLimit(req, res)) return;

  const parsed = parseBody(req);
  if (!parsed.ok) {
    return res.status(400).json(clientError(parsed.error));
  }
  const body = parsed.body;

  if (typeof body.query !== 'string') {
    return res.status(400).json(clientError('Query is required'));
  }

  const query = body.query.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) {
    return res.status(400).json(clientError('Query is required'));
  }
  if (query.length < MIN_QUERY_LENGTH) {
    return res
      .status(400)
      .json(clientError(`Query is too short. Use at least ${MIN_QUERY_LENGTH} characters.`));
  }

  const env = process.env;
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  try {
    let results = null;
    let anyProviderAttempted = false;

    // 1. Try Tavily
    if (env.TAVILY_API_KEY && Date.now() < deadline) {
      anyProviderAttempted = true;
      results = await searchTavily(query, env.TAVILY_API_KEY, remainingTimeout(deadline));
    }

    // 2. Try Serper if Tavily yielded nothing (evaluates empty array correctly)
    if ((!results || results.length === 0) && env.SERPER_API_KEY && Date.now() < deadline) {
      anyProviderAttempted = true;
      results = await searchSerper(query, env.SERPER_API_KEY, remainingTimeout(deadline));
    }

    // 3. Fallback to DuckDuckGo scrape
    if ((!results || results.length === 0) && Date.now() < deadline) {
      anyProviderAttempted = true;
      const ddg = await searchDuckDuckGo(query, remainingTimeout(deadline));
      // Prefer empty array from a successful scrape over null failure when prior
      // providers already returned empty (still a successful "no hits" path).
      if (ddg !== null) {
        results = ddg;
      } else if (results === null) {
        results = null;
      }
    }

    if (results === null) {
      // All providers failed or budget exhausted with no successful response.
      console.error(
        'Search execution failure: no provider returned results',
        { anyProviderAttempted, budgetLeftMs: deadline - Date.now() },
      );
      return res.status(502).json(clientError('Search queries failed'));
    }

    return res.status(200).json({ results: normalizeResults(results) });
  } catch (err) {
    console.error('Search execution failure:', err?.message || err);
    return res.status(502).json(clientError('Search queries failed'));
  }
}
