// Vercel Node.js 18+ serverless function — Case-law search proxy
//
// One source for now: IndianKanoon (https://indiankanoon.org) for the INDIAN
// jurisdiction. The INTERNATIONAL / common-law jurisdiction is deferred — the
// handler returns { available: false, results: [] } there so the UI can mark
// citations UNVERIFIED rather than hallucinate them.
//
// Two backends for INDIAN:
//   1. Authenticated JSON API at https://api.indiankanoon.org (preferred) —
//      needs INDIANKANOON_API_KEY. Returns structured docs.
//   2. Public HTML scrape at https://indiankanoon.org/search — no key
//      required. Best-effort regex extraction; gracefully returns [] on
//      structural change. The client keeps working without an API key.

const ALLOWED_ORIGINS = new Set([
    "https://trialsim.vercel.app",
    "https://trialsim.app",
    "http://localhost:5173",
    "http://localhost:3000"
]);

const SAFE_URL_SCHEMES = /^(https?:\/\/)/i;

function getCorsHeaders(origin) {
    const isAllowed = origin && ALLOWED_ORIGINS.has(origin);
    const headerOrigin = isAllowed ? origin : "https://trialsim.app";
    return {
        "Access-Control-Allow-Origin": headerOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin"
    };
}

function decodeHtmlEntities(str) {
    if (!str) return "";
    const entities = {
        "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
        "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
    };
    return str
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&[a-z]+;|&#\d+;/gi, (m) => entities[m] || m);
}

function sanitizeUrl(rawUrl) {
    let url = (rawUrl || "").trim();
    if (!url) return null;
    if (url.startsWith("/")) url = "https://indiankanoon.org" + url; // relative doc links
    if (url.startsWith("//")) url = "https:" + url;
    if (!SAFE_URL_SCHEMES.test(url)) return null;
    try { return new URL(url).toString(); } catch { return null; }
}

function cleanText(s) {
    return decodeHtmlEntities((s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

// ─── Authenticated JSON API ───────────────────────────────────────────────
async function searchIndianKanoonApi(query, apiKey, pageNum, limit) {
    const url = `https://api.indiankanoon.org/search/?formInput=${encodeURIComponent(query)}&pagenum=${pageNum}`;
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Token ${apiKey}`,
                "Accept": "application/json",
                "User-Agent": "LexForgeBot/1.0 (+legal-sim citation lookup)"
            }
        });
        if (!response.ok) return null;
        const data = await response.json();
        const docs = Array.isArray(data.docs) ? data.docs : [];
        const results = docs.slice(0, limit).map(d => {
            const docid = d.docid || "";
            return {
                title: cleanText(d.docTitle || d.title || "Untitled"),
                citation: cleanText(d.citation || ""),
                court: cleanText(d.court || ""),
                date: cleanText(d.judgement_date || d.date || ""),
                docid: String(docid),
                url: docid ? `https://indiankanoon.org/doc/${docid}/` : "",
                snippet: cleanText(d.headnote || d.content || "").slice(0, 400)
            };
        });
        return results;
    } catch {
        return null;
    }
}

// ─── Public HTML scrape fallback ────────────────────────────────────────────
// Best-effort. Each IndianKanoon search result anchor points to /doc/<id>/?formInput=...
// and is immediately followed by the title text. Subtitle metadata (citation,
// court, judgement date) sits inside sibling <div>s of class "result_citation"
// / "docsource". We try several known selectors and degrade gracefully to [].
async function searchIndianKanoonScrape(query, pageNum, limit) {
    const url = `https://indiankanoon.org/search/?formInput=${encodeURIComponent(query)}&pagenum=${pageNum}`;
    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
        }
    });
    if (!response.ok) throw new Error(`IndianKanoon scrape returned ${response.status}`);

    const html = await response.text();
    const results = [];

    // Result blocks are split by the result anchor. Each opening `<a href="/doc/<id>`
    // marker starts a result; we capture the trailing chunk until the next
    // such anchor or end of results div.
    const anchorRe = /<a[^>]*href="(\/doc\/(\d+)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = anchorRe.exec(html)) !== null && results.length < limit) {
        const href = match[1];
        const docid = match[2];
        const titleHtml = match[3];
        const title = cleanText(titleHtml);
        if (!title || title.length < 3) continue;

        // Look ahead in a small window for citation/court/date metadata.
        const tail = html.slice(anchorRe.lastIndex, anchorRe.lastIndex + 1500);
        const citation = cleanText((tail.match(/Citation:\s*([^<\n]+)/i) || [])[1] || "")
            || cleanText((tail.match(/([A-Z][\w.& ]+?v\.?\s+[A-Z][\w.& ]+,\s*\d{4}\s*\([^)]+\))/) || [])[1] || "");
        const court = cleanText((tail.match(/\b(Supreme Court|High Court of [A-Za-z ]+|Bombay High Court|Delhi High Court|Madras High Court| Karnataka High Court|Kerala High Court|Calcutta High Court|Allahabad High Court|Punjab and Haryana High Court|Gujarat High Court|Tribunal|CAT|NGT|NCLT|DRT)\b/i) || [])[1] || "");
        const date = cleanText((tail.match(/\b(Equity|Appeal|Appellate)?\s*(Judgement|Decision|Order)?\s*(?:Date|Judgementdate|on)\s*[: ]?\s*(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4})/i) || [])[3] || "")
            || cleanText((tail.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i) || [])[1] || "");
        const snippet = cleanText((tail.match(/<div class="result_citation">([\s\S]*?)<\/div>/i) || [])[1] || "")
            || cleanText(tail.slice(0, 240)).slice(0, 240);

        const safeUrl = sanitizeUrl(href);
        if (!safeUrl) continue;

        results.push({
            title,
            citation,
            court,
            date,
            docid: String(docid || ""),
            url: safeUrl,
            snippet
        });
    }

    return results;
}

// ─── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    const origin = req.headers["origin"] || "";
    Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    let body = req.body;
    if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }
    if (!body || typeof body.query !== "string" || !body.query.trim()) {
        return res.status(400).json({ error: "'query' is required" });
    }

    const query = body.query.trim().slice(0, 500);
    const jurisdiction = body.jurisdiction === "common" ? "common" : "indian";
    const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 12);
    const pageNum = Math.min(Math.max(Number(body.pagenum) || 0, 0), 5);
    const env = process.env;

    // International / common-law jurisdiction is deferred (per PR1 scope).
    // Return clearly unavailable so the UI can mark citations UNVERIFIED
    // rather than fabricate a payload.
    if (jurisdiction === "common") {
        return res.status(200).json({
            results: [],
            jurisdiction: "common",
            provider: null,
            available: false,
            message: "International case-law lookup not yet implemented."
        });
    }

    try {
        let results = null;
        let provider = null;

        if (env.INDIANKANOON_API_KEY) {
            results = await searchIndianKanoonApi(query, env.INDIANKANOON_API_KEY, pageNum, limit);
            provider = results ? "indiankanoon-api" : null;
        }

        if ((!results || results.length === 0)) {
            try {
                results = await searchIndianKanoonScrape(query, pageNum, limit);
                provider = results && results.length > 0 ? "indiankanoon-scrape" : null;
            } catch (scrapeErr) {
                console.error("IndianKanoon scrape failed:", scrapeErr.message);
            }
        }

        return res.status(200).json({
            results: results || [],
            jurisdiction: "indian",
            provider,
            available: !!(provider),
            message: provider
                ? undefined
                : "IndianKanoon lookup unavailable — citations may be unverified."
        });
    } catch (err) {
        console.error("Caselaw search failure:", err);
        return res.status(200).json({
            results: [],
            jurisdiction: "indian",
            provider: null,
            available: false,
            message: "Case-law lookup failed. Falling back to unverified citations."
        });
    }
}
