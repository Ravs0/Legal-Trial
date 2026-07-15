// Vercel Node.js 18+ serverless function — Case-law search proxy
import { allowRequest, applyCors } from './security.js';

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

function cleanText(value) {
    return decodeHtmlEntities((value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function sanitizeExternalUrl(rawUrl) {
    let url = (rawUrl || '').trim();
    if (!url) return null;
    if (url.startsWith('//')) url = `https:${url}`;
    if (!SAFE_URL_SCHEMES.test(url)) return null;
    try { return new URL(url).toString(); } catch { return null; }
}

function normalizeDate(value) {
    if (typeof value !== 'string' || !value) return '';
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

// ─── Authenticated Indian Kanoon API ───────────────────────────────────────
async function searchIndianKanoonApi(query, apiKey, pageNum, limit) {
    const url = `https://api.indiankanoon.org/search/?formInput=${encodeURIComponent(query)}&pagenum=${pageNum}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Token ${apiKey}`,
                Accept: 'application/json',
                'User-Agent': 'LexForgeBot/1.0 (+legal-sim citation lookup)',
            },
        });
        if (!response.ok) return null;
        const data = await response.json();
        const docs = Array.isArray(data.docs) ? data.docs : [];
        return docs.slice(0, limit).map((doc) => {
            const docid = doc.docid || '';
            return {
                title: cleanText(doc.docTitle || doc.title || 'Untitled'),
                citation: cleanText(doc.citation || ''),
                court: cleanText(doc.court || ''),
                date: cleanText(doc.judgement_date || doc.date || ''),
                docid: String(docid),
                url: docid ? `https://indiankanoon.org/doc/${docid}/` : '',
                snippet: cleanText(doc.headnote || doc.content || '').slice(0, 400),
                source: 'Indian Kanoon API',
                verification: 'provider_metadata',
            };
        });
    } catch {
        return null;
    }
}

// ─── Public-web discovery fallback ─────────────────────────────────────────
// These are pointers to investigate. We exclude Indian Kanoon URLs so the
// fallback does not recreate unauthenticated use of that provider.
async function searchPublicWeb(query, limit) {
    try {
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });
        if (!response.ok) return null;

        const html = await response.text();
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
            const hostname = new URL(url).hostname.toLowerCase();
            if (hostname.includes('duckduckgo.com') || hostname.endsWith('indiankanoon.org')) continue;

            const title = cleanText(titleMatch[1]);
            if (!title) continue;
            const snippet = snippetMatch ? cleanText(snippetMatch[1]).slice(0, 400) : '';
            results.push({
                title,
                citation: '',
                court: inferCourt(`${title} ${snippet}`, url),
                date: '',
                docid: '',
                url,
                snippet,
                source: hostname,
                verification: 'public_web_discovery',
            });
        }
        return results;
    } catch {
        return null;
    }
}

// ─── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin is not allowed.' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!allowRequest(req, { limit: 20, windowMs: 60_000 })) return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    }
    if (!body || typeof body.query !== 'string' || !body.query.trim()) {
        return res.status(400).json({ error: "'query' is required" });
    }

    const query = body.query.trim().slice(0, 500);
    const jurisdiction = body.jurisdiction === 'common' ? 'common' : 'indian';
    const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 12);
    const pageNum = Math.min(Math.max(Number(body.pagenum) || 0, 0), 5);
    const court = typeof body.court === 'string' ? body.court : 'all';
    const fromDate = normalizeDate(body.fromDate);
    const toDate = normalizeDate(body.toDate);

    if (!(court in COURT_FILTERS)) return res.status(400).json({ error: 'Unsupported court filter.' });
    if (fromDate === null || toDate === null) return res.status(400).json({ error: 'Dates must use YYYY-MM-DD.' });
    if (fromDate && toDate && new Date(body.fromDate) > new Date(body.toDate)) {
        return res.status(400).json({ error: 'Start date must be before end date.' });
    }
    if (jurisdiction === 'common') {
        return res.status(200).json({
            results: [], jurisdiction: 'common', provider: null, available: false,
            message: 'International case-law lookup not yet implemented.',
        });
    }

    try {
        if (process.env.INDIANKANOON_API_KEY) {
            const providerResults = await searchIndianKanoonApi(
                buildFilteredQuery(query, court, fromDate, toDate),
                process.env.INDIANKANOON_API_KEY,
                pageNum,
                limit,
            );
            if (providerResults) {
                return res.status(200).json({
                    results: providerResults, jurisdiction: 'indian', provider: 'indiankanoon-api', available: true,
                });
            }
        }

        const results = await searchPublicWeb(buildPublicWebQuery(query, court, fromDate, toDate), limit);
        const providerFailed = Boolean(process.env.INDIANKANOON_API_KEY);
        const hasResults = Array.isArray(results) && results.length > 0;
        return res.status(200).json({
            results: results || [],
            jurisdiction: 'indian',
            provider: results ? 'public-web-discovery' : null,
            available: Boolean(results),
            message: hasResults
                ? `${providerFailed ? 'The configured provider was unavailable; ' : ''}Public-web discovery only: verify the linked primary judgment, court, date, citation, and current status. Date filters are approximate without a case-law database.`
                : results
                    ? 'No public-web judgment leads matched those terms. Try a narrower issue, another court, or the official court-source links below.'
                    : 'Public-web case discovery is temporarily unavailable. Use the official court-source links below to continue research.',
        });
    } catch (error) {
        console.error('Caselaw search failure:', error);
        return res.status(200).json({
            results: [], jurisdiction: 'indian', provider: null, available: false,
            message: 'Case-law lookup failed. Use the official court-source links below to continue research.',
        });
    }
}
