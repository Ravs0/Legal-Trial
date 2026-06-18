// Vercel Node.js 18+ serverless function — Web Search API proxy

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
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    let url = rawUrl.trim();
    if (url.startsWith("//")) url = "https:" + url;
    if (!SAFE_URL_SCHEMES.test(url)) return null; // blocks javascript:, data:, etc.
    try {
        const parsed = new URL(url);
        return parsed.toString();
    } catch {
        return null;
    }
}

async function searchTavily(query, apiKey) {
    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: apiKey,
                query: query,
                search_depth: "basic",
                max_results: 8
            })
        });
        if (!response.ok) return null;
        const data = await response.json();
        return (data.results || []).map(r => ({
            title: r.title || "Untitled",
            url: r.url || "",
            snippet: r.content || ""
        }));
    } catch {
        return null;
    }
}

async function searchSerper(query, apiKey) {
    try {
        const response = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ q: query, num: 8 })
        });
        if (!response.ok) return null;
        const data = await response.json();
        return (data.organic || []).map(r => ({
            title: r.title || "Untitled",
            url: r.link || "",
            snippet: r.snippet || ""
        }));
    } catch {
        return null;
    }
}

async function searchDuckDuckGo(query) {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        }
    });
    if (!response.ok) {
        throw new Error(`DuckDuckGo scraper returned ${response.status}`);
    }
    const html = await response.text();
    const results = [];
    const blocks = html.split('<div class="result ');
    
    for (let i = 1; i < blocks.length && results.length < 8; i++) {
        const block = blocks[i];
        
        // Extract URL
        const urlMatch = block.match(/class="result__a" href="([^"]+)"/) || block.match(/href="([^"]*uddg=[^"]*)"/);
        // Extract Title
        const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
        // Extract Snippet
        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span|div)>/);
        
        if (urlMatch && titleMatch) {
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
            if (!sanitizedUrl) continue; // Skip dangerous schemes (prevent Stored-XSS)
            
            // Skip internal DuckDuckGo links
            if (sanitizedUrl.includes('duckduckgo.com/') && !sanitizedUrl.includes('uddg=')) {
                continue;
            }
            
            const title = decodeHtmlEntities(titleMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
            const snippet = snippetMatch 
                ? decodeHtmlEntities(snippetMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()) 
                : "";
            
            results.push({ title, url: sanitizedUrl, snippet });
        }
    }
    return results;
}

export default async function handler(req, res) {
    const origin = req.headers["origin"] || "";
    Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    let body = req.body;
    if (typeof body === "string") {
        try {
            body = JSON.parse(body);
        } catch {
            return res.status(400).json({ error: "Invalid JSON" });
        }
    }
    if (!body || !body.query) return res.status(400).json({ error: "Query is required" });

    const query = body.query.trim().slice(0, 500); // 500-char query limit
    const env = process.env;

    try {
        let results = null;

        // 1. Try Tavily
        if (env.TAVILY_API_KEY) {
            results = await searchTavily(query, env.TAVILY_API_KEY);
        }
        
        // 2. Try Serper if Tavily yielded nothing (evaluates empty array correctly)
        if ((!results || results.length === 0) && env.SERPER_API_KEY) {
            results = await searchSerper(query, env.SERPER_API_KEY);
        }

        // 3. Fallback to DuckDuckGo Scraper
        if (!results || results.length === 0) {
            results = await searchDuckDuckGo(query);
        }

        return res.status(200).json({ results: results || [] });
    } catch (err) {
        console.error("Search execution failure:", err);
        return res.status(502).json({ error: "Search queries failed" });
    }
}
