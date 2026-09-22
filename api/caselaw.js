// Vercel Node.js 18+ serverless function — Case-law search proxy
// Hardened: origin allow-list, route-scoped rate limit, client-safe errors only.
import {
  allowRequest,
  applyCors,
  clampNumber,
  clientError,
  enforceBodyLimit,
  fetchWithTimeout,
  sanitizeProviderSnippet,
} from './_lib/security.js';

const UPSTREAM_TIMEOUT_MS = 20_000;
/** Caselaw hits paid/fragile upstreams — tighter than generic search. */
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;
const MAX_QUERY_LEN = 500;
const MIN_QUERY_LEN = 2;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_TITLE = 400;
const MAX_SNIPPET = 400;
const MAX_CITATION = 200;
const MAX_COURT = 200;
const MAX_DATE = 64;
const MAX_DOCID = 120;

// Indian jurisdiction has two explicit paths:
//   1. Indian Kanoon's authenticated JSON API, when configured. It returns
//      structured metadata and supports provider-side court/date filters.
//   2. Public-web discovery, when no API key is available or the provider is
//      unavailable. It returns links to investigate, never verified authority.
//
// We deliberately do not scrape Indian Kanoon's public search pages. That is
// not a substitute for its authenticated API and would make source provenance
// ambiguous. International/common-law lookup remains explicitly unavailable.

const COURT_FILTERS = {
    all: '',
    supreme_court: 'supremecourt',
    high_courts: 'highcourts',
    delhi_high_court: 'delhi',
    bombay_high_court: 'bombay',
    karnataka_high_court: 'karnataka',
    allahabad_high_court: 'allahabad',
    madras_high_court: 'chennai',
};

const WEB_COURT_TERMS = {
    all: 'Indian court judgment',
    supreme_court: 'Supreme Court of India judgment site:sci.gov.in',
    high_courts: 'India High Court judgment',
    delhi_high_court: 'Delhi High Court judgment',
    bombay_high_court: 'Bombay High Court judgment',
    karnataka_high_court: 'Karnataka High Court judgment',
    allahabad_high_court: 'Allahabad High Court judgment',
    madras_high_court: 'Madras High Court judgment',
};

const SAFE_URL_SCHEMES = /^(https?:\/\/)/i;

function setSafetyHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
}

function denyOrigin(res) {
    // Never reflect a disallowed Origin (no ACAO). Vary still helps caches.
    res.setHeader('Vary', 'Origin');
    setSafetyHeaders(res);
    return res.status(403).json(clientError('Origin is not allowed.'));
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    const entities = {
        '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
        '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
    };
    return str
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&[a-z]+;|&#\d+;/gi, (match) => entities[match] || match);
}

function cleanText(value, maxLen = MAX_SNIPPET) {
    return decodeHtmlEntities((value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
        .slice(0, maxLen);
}

function sanitizeExternalUrl(rawUrl) {
    let url = (rawUrl || '').trim();
    if (!url) return null;
    if (url.startsWith('//')) url = `https:${url}`;
    if (!SAFE_URL_SCHEMES.test(url)) return null;
    try {
        const parsed = new URL(url);
        // Block credentials-in-URL and non-http(s) after parse (defense in depth).
        if (parsed.username || parsed.password) return null;
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

function normalizeDate(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
    return `${Number(match[3])}-${Number(match[2])}-${match[1]}`;
}

function buildFilteredQuery(query, court, fromDate, toDate) {
    const filters = [];
    if (COURT_FILTERS[court]) filters.push(`doctypes:${COURT_FILTERS[court]}`);
    if (fromDate) filters.push(`fromdate:${fromDate}`);
    if (toDate) filters.push(`todate:${toDate}`);
    return [query, ...filters].filter(Boolean).join(' ');
}

function buildPublicWebQuery(query, court, fromDate, toDate) {
    const years = [...new Set([fromDate, toDate]
        .filter(Boolean)
        .map((date) => String(date).slice(0, 4)))];
    return [query, WEB_COURT_TERMS[court] || WEB_COURT_TERMS.all, ...years]
        .filter(Boolean)
        .join(' ');
}

function inferCourt(text, url) {
    const haystack = `${text} ${url}`.toLowerCase();
    if (haystack.includes('sci.gov.in') || haystack.includes('supreme court of india')) return 'Supreme Court of India';
    const courts = [
        ['delhi high court', 'Delhi High Court'],
        ['bombay high court', 'Bombay High Court'],
        ['karnataka high court', 'Karnataka High Court'],
        ['allahabad high court', 'Allahabad High Court'],
        ['madras high court', 'Madras High Court'],
        ['high court', 'High Court (verify jurisdiction)'],
    ];
    const match = courts.find(([needle]) => haystack.includes(needle));
    return match ? match[1] : '';
}

function mapProviderDoc(doc) {
    const docid = cleanText(String(doc?.docid || ''), MAX_DOCID);
    return {
        title: cleanText(doc?.docTitle || doc?.title || 'Untitled', MAX_TITLE),
        citation: cleanText(doc?.citation || '', MAX_CITATION),
        court: cleanText(doc?.court || '', MAX_COURT),
        date: cleanText(doc?.judgement_date || doc?.date || '', MAX_DATE),
        docid,
        // Only emit a known-shape public doc URL; never echo raw provider URLs.
        url: docid && /^\d+$/.test(docid) ? `https://indiankanoon.org/doc/${docid}/` : '',
        snippet: cleanText(doc?.headnote || doc?.content || '', MAX_SNIPPET),
        source: 'Indian Kanoon API',
        verification: 'provider_metadata',
    };
}

// ─── Authenticated Indian Kanoon API ───────────────────────────────────────
async function searchIndianKanoonApi(query, apiKey, pageNum, limit) {
    const url = `https://api.indiankanoon.org/search/?formInput=${encodeURIComponent(query)}&pagenum=${pageNum}`;
    try {
        const response = await fetchWithTimeout(url, {
            method: 'GET',
            headers: {
                Authorization: `Token ${apiKey}`,
                Accept: 'application/json',
                'User-Agent': 'LexForgeBot/1.0 (+legal-sim citation lookup)',
            },
        }, UPSTREAM_TIMEOUT_MS);
        if (!response.ok) {
            // Status only — never log provider body (may include account hints).
            console.error('[caselaw] indiankanoon status', response.status);
            return null;
        }
        let data;
        try {
            data = await response.json();
        } catch {
            console.error('[caselaw] indiankanoon invalid JSON');
            return null;
        }
        const docs = Array.isArray(data?.docs) ? data.docs : [];
        return docs.slice(0, limit).map(mapProviderDoc);
    } catch (err) {
        const aborted = err?.name === 'AbortError';
        console.error(
            '[caselaw] indiankanoon network',
            aborted ? 'timeout' : sanitizeProviderSnippet(String(err?.message || err)),
        );
        return null;
    }
}

// ─── Public-web discovery fallback ─────────────────────────────────────────
// These are pointers to investigate. We exclude Indian Kanoon URLs so the
// fallback does not recreate unauthenticated use of that provider.
async function searchPublicWeb(query, limit) {
    try {
        const response = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        }, UPSTREAM_TIMEOUT_MS);
        if (!response.ok) {
            console.error('[caselaw] public-web status', response.status);
            return null;
        }

        // Cap HTML size before regex work (memory / CPU DoS guard).
        const html = (await response.text()).slice(0, MAX_HTML_BYTES);
        const results = [];
        const blocks = html.split('<div class="result ');
        for (let index = 1; index < blocks.length && results.length < limit; index += 1) {
            const block = blocks[index];
            const urlMatch = block.match(/class="result__a" href="([^"]+)"/) || block.match(/href="([^"]*uddg=[^"]*)"/);
            const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
            const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span|div)>/);
            if (!urlMatch || !titleMatch) continue;

            let rawUrl = decodeHtmlEntities(urlMatch[1]);
            if (rawUrl.includes('uddg=')) {
                try { rawUrl = decodeURIComponent(rawUrl.split('uddg=')[1].split('&')[0]); } catch { continue; }
            }
            const url = sanitizeExternalUrl(rawUrl);
            if (!url) continue;
            let hostname = '';
            try {
                hostname = new URL(url).hostname.toLowerCase();
            } catch {
                continue;
            }
            if (hostname.includes('duckduckgo.com') || hostname.endsWith('indiankanoon.org')) continue;

            const title = cleanText(titleMatch[1], MAX_TITLE);
            if (!title) continue;
            const snippet = snippetMatch ? cleanText(snippetMatch[1], MAX_SNIPPET) : '';
            results.push({
                title,
                citation: '',
                court: inferCourt(`${title} ${snippet}`, url),
                date: '',
                docid: '',
                url,
                snippet,
                source: hostname.slice(0, 120),
                verification: 'public_web_discovery',
            });
        }
        return results;
    } catch (err) {
        const aborted = err?.name === 'AbortError';
        console.error(
            '[caselaw] public-web network',
            aborted ? 'timeout' : sanitizeProviderSnippet(String(err?.message || err)),
        );
        return null;
    }
}

function softUnavailable(message) {
    return {
        results: [],
        jurisdiction: 'indian',
        provider: null,
        available: false,
        message,
        meta: buildAuthorityMeta([], 'none'),
    };
}

// ─── Chain authorities (B14 — additive-only) ────────────────────────────────
// Attaches Needle Authority[] extraction to every caselaw response as `meta`.
// Deterministic mapping only (title→case_name, citation→citation,
// snippet→proposition): explicit fields, never judgment (judgment = JEV).
// Surfaces verification state, never overrides it. Respects the flagLead
// 422 rule (guardrails.js, untouched): an unverified lead can never produce
// an assertable citation — `asserted` is always false here; assertion happens
// downstream only after verification.

function leadState(body) {
    const lead = body?.lead;
    if (!lead || typeof lead !== 'object') return 'none';
    return lead.verified === true ? 'verified' : lead.verified === false ? 'unverified' : 'none';
}

// Mirror of guardrails flagLead (same code string), without touching that file.
function isUnverifiedAssertion(body) {
    const lead = body?.lead;
    return Boolean(
        lead && typeof lead === 'object' && lead.verified === false
        && (body.assertCitation || body.citations),
    );
}

function buildAuthorityMeta(results, lead) {
    const list = Array.isArray(results) ? results : [];
    const authorities = list.map((r) => {
        const verification = typeof r?.verification === 'string' && r.verification
            ? r.verification
            : 'unverified';
        return {
            case_name: String(r?.title || ''),
            citation: String(r?.citation || ''),
            proposition: String(r?.snippet || '').slice(0, 280),
            verification,
            // Only provider-backed metadata is assertable, and never for an
            // unverified lead (flagLead 422 rule surfaced, not overridden).
            assertable: verification === 'provider_metadata' && lead !== 'unverified',
        };
    });
    const kinds = new Set(authorities.map((a) => a.verification));
    const verification = authorities.length === 0
        ? 'none'
        : kinds.size === 1 ? [...kinds][0] : 'mixed';
    const meta = {
        authorities,
        verification,
        lead,
        asserted: false,
    };
    if (authorities.length === 0) {
        meta.note = 'No authorities extracted: verify via official court sources.';
    } else if (!authorities.some((a) => a.assertable)) {
        meta.note = 'Unverified leads: verify the linked primary judgment, court, date, citation, and current status before citing.';
    }
    return meta;
}

// Optional sidecar seam: offline `extract.py` stdout JSON shipped in
// `body.needle`, validated fail-open via _lib/needle/schemas.js (lazy import
// so a missing module can never crash this endpoint). Surfaced, never trusted
// for assertion: `meta.sidecar = {ok, authority|null, escalate}`.
async function surfaceSidecar(needle) {
    if (needle == null || typeof needle !== 'object') return null;
    try {
        const mod = await import('./_lib/needle/schemas.js');
        if (typeof mod.fromSidecar !== 'function') return null;
        const out = mod.fromSidecar(needle);
        return {
            ok: Boolean(out?.ok),
            authority: out?.authority ?? null,
            escalate: out?.escalate !== false,
        };
    } catch {
        return null;
    }
}

// ─── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    // Origin first: rejected origins never get ACAO reflected.
    if (!applyCors(req, res)) return denyOrigin(res);
    setSafetyHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json(clientError('Method not allowed'));

    // Route-scoped bucket so chat/search traffic does not exhaust caselaw quota.
    if (!allowRequest(req, { limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS, keyPrefix: 'caselaw:' })) {
        res.setHeader('Retry-After', String(Math.ceil(RATE_WINDOW_MS / 1000)));
        return res.status(429).json(clientError('Too many requests. Please wait a minute and try again.'));
    }
    if (!enforceBodyLimit(req, res)) return;

    let body = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch {
            return res.status(400).json(clientError('Invalid JSON'));
        }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json(clientError('Request body must be a JSON object.'));
    }
    if (typeof body.query !== 'string' || !body.query.trim()) {
        return res.status(400).json(clientError("'query' is required"));
    }

    const query = body.query.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LEN);
    if (query.length < MIN_QUERY_LEN) {
        return res.status(400).json(clientError('Query is too short.'));
    }

    // Only accept the known jurisdiction wire values; everything else → indian.
    const jurisdiction = body.jurisdiction === 'common' ? 'common' : 'indian';
    const limit = clampNumber(Number(body.limit), 8, 1, 12);
    const pageNum = clampNumber(Number(body.pagenum), 0, 0, 5);
    const court = typeof body.court === 'string' ? body.court : 'all';
    const fromDate = normalizeDate(body.fromDate);
    const toDate = normalizeDate(body.toDate);

    if (!(court in COURT_FILTERS)) return res.status(400).json(clientError('Unsupported court filter.'));
    if (fromDate === null || toDate === null) return res.status(400).json(clientError('Dates must use YYYY-MM-DD.'));
    // normalizeDate rewrites to D-M-YYYY for the provider; compare validated ISO inputs.
    if (fromDate && toDate && String(body.fromDate) > String(body.toDate)) {
        return res.status(400).json(clientError('Start date must be before end date.'));
    }
    if (jurisdiction === 'common') {
        return res.status(200).json({
            results: [],
            jurisdiction: 'common',
            provider: null,
            available: false,
            message: 'International case-law lookup not yet implemented.',
            meta: buildAuthorityMeta([], leadState(body)),
        });
    }

    // flagLead mirror (guardrails.js untouched): an unverified lead can never
    // assert a citation. Surface the 422, never override it.
    if (isUnverifiedAssertion(body)) {
        return res.status(422).json(clientError('unverified_lead_cannot_assert_citation'));
    }
    const metaLead = leadState(body);
    const sidecar = await surfaceSidecar(body.needle);
    const withMeta = (payload) => {
        const meta = buildAuthorityMeta(payload.results, metaLead);
        if (sidecar) meta.sidecar = sidecar;
        return { ...payload, meta };
    };

    // Never expose whether INDIANKANOON_API_KEY is set to the client.
    const apiKey = process.env.INDIANKANOON_API_KEY;
    const hasApiKey = typeof apiKey === 'string' && apiKey.trim().length > 0;

    try {
        if (hasApiKey) {
            const providerResults = await searchIndianKanoonApi(
                buildFilteredQuery(query, court, fromDate, toDate),
                apiKey.trim(),
                pageNum,
                limit,
            );
            if (providerResults) {
                return res.status(200).json(withMeta({
                    results: providerResults,
                    jurisdiction: 'indian',
                    provider: 'indiankanoon-api',
                    available: true,
                }));
            }
        }

        const results = await searchPublicWeb(buildPublicWebQuery(query, court, fromDate, toDate), limit);
        const hasResults = Array.isArray(results) && results.length > 0;
        // Soft 200 keeps client contract (available + message); no stack / provider bodies.
        return res.status(200).json(withMeta({
            results: results || [],
            jurisdiction: 'indian',
            provider: results ? 'public-web-discovery' : null,
            available: Boolean(results),
            message: hasResults
                ? 'Public-web discovery only: verify the linked primary judgment, court, date, citation, and current status. Date filters are approximate without a case-law database.'
                : results
                    ? 'No public-web judgment leads matched those terms. Try a narrower issue, another court, or the official court-source links below.'
                    : 'Public-web case discovery is temporarily unavailable. Use the official court-source links below to continue research.',
        }));
    } catch (error) {
        // Client-safe soft failure — log name only, never stack or raw provider text.
        console.error(
            '[caselaw] search failure',
            error?.name || 'Error',
            sanitizeProviderSnippet(String(error?.message || '')),
        );
        return res.status(200).json(softUnavailable(
            'Case-law lookup failed. Use the official court-source links below to continue research.',
        ));
    }
}
