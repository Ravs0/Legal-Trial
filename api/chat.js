const https = require("https");
const http = require("http");

function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin",
    };
}

function getModelConfig() {
    const ds_nvidia = process.env.DEEPSEEK_NVIDIA_API_KEY;
    if (ds_nvidia) {
        return {
            url: "https://integrate.api.nvidia.com/v1/chat/completions",
            key: ds_nvidia,
            model: "nvidia/deepseek-r1",
        };
    }
    const ds = process.env.DEEPSEEK_API_KEY;
    if (ds) {
        return {
            url: "https://api.deepseek.com/v1/chat/completions",
            key: ds,
            model: "deepseek-chat",
        };
    }
    const groq = process.env.GROQ_API_KEY;
    if (groq) {
        return {
            url: "https://api.groq.com/openai/v1/chat/completions",
            key: groq,
            model: "llama-3.3-70b-versatile",
        };
    }
    const kimi = process.env.KIMI_API_KEY;
    if (kimi) {
        return {
            url: "https://integrate.api.nvidia.com/v1/chat/completions",
            key: kimi,
            model: "moonshotai/kimi-k2.5",
        };
    }
    return null;
}

function fetchJson(urlStr, opts, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const lib = url.protocol === "https:" ? https : http;
        const req = lib.request(
            {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: opts.method || "POST",
                headers: opts.headers,
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch {
                        resolve({ status: res.statusCode, body: data });
                    }
                });
            }
        );
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
}

module.exports = async function handler(req, res) {
    const origin = req.headers["origin"] || "*";
    const headers = corsHeaders(origin);

    if (req.method === "OPTIONS") {
        Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(200).end();
    }

    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader("Content-Type", "application/json");

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const config = getModelConfig();
    if (!config) {
        return res.status(503).json({
            error:
                "No AI API key configured. Add DEEPSEEK_API_KEY, GROQ_API_KEY, or KIMI_API_KEY in Vercel environment variables.",
        });
    }

    let body;
    try {
        if (typeof req.body === "object") {
            body = req.body;
        } else {
            body = JSON.parse(req.body || "{}");
        }
    } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
    }

    const { messages, system, stream } = body;
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages array is required" });
    }

    // Build message list with system prepended
    const allMessages = system
        ? [{ role: "system", content: system }, ...messages]
        : messages;

    const payload = JSON.stringify({
        model: config.model,
        messages: allMessages,
        temperature: 0.6,
        max_tokens: 1000,
        stream: false, // always non-stream server-side, return full
    });

    try {
        const upstream = await fetchJson(config.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.key}`,
                "Content-Length": Buffer.byteLength(payload),
            },
        }, payload);

        if (upstream.status !== 200) {
            return res.status(502).json({
                error: `Upstream API error ${upstream.status}`,
                detail:
                    typeof upstream.body === "string"
                        ? upstream.body
                        : JSON.stringify(upstream.body),
            });
        }

        const text =
            upstream.body?.choices?.[0]?.message?.content || "";
        return res.status(200).json({ text });
    } catch (err) {
        return res.status(502).json({ error: `Fetch failed: ${err.message}` });
    }
};
