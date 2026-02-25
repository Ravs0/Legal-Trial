// Vercel Node.js 18+ serverless function
// Uses native fetch (no extra deps needed)

function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function getModelConfig() {
    const { DEEPSEEK_NVIDIA_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY, KIMI_API_KEY } = process.env;
    if (DEEPSEEK_NVIDIA_API_KEY) return { url: "https://integrate.api.nvidia.com/v1/chat/completions", key: DEEPSEEK_NVIDIA_API_KEY, model: "nvidia/deepseek-r1" };
    if (DEEPSEEK_API_KEY) return { url: "https://api.deepseek.com/v1/chat/completions", key: DEEPSEEK_API_KEY, model: "deepseek-chat" };
    if (GROQ_API_KEY) return { url: "https://api.groq.com/openai/v1/chat/completions", key: GROQ_API_KEY, model: "llama-3.3-70b-versatile" };
    if (KIMI_API_KEY) return { url: "https://integrate.api.nvidia.com/v1/chat/completions", key: KIMI_API_KEY, model: "moonshotai/kimi-k2.5" };
    return null;
}

export default async function handler(req, res) {
    const origin = req.headers["origin"] || "*";

    // Set CORS on every response
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // ── Parse body ──────────────────────────────────────────────────────────
    let body = req.body;
    if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }
    if (!body) return res.status(400).json({ error: "Empty body" });

    const { messages, system } = body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: "'messages' array required" });

    // ── Pick model ───────────────────────────────────────────────────────────
    const config = getModelConfig();
    if (!config) {
        return res.status(503).json({
            error: "No AI API key configured. Add DEEPSEEK_API_KEY, GROQ_API_KEY or KIMI_API_KEY in Vercel env vars."
        });
    }

    const allMessages = system
        ? [{ role: "system", content: system }, ...messages]
        : messages;

    // ── Call upstream ────────────────────────────────────────────────────────
    let upstream;
    try {
        upstream = await fetch(config.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.key}`,
            },
            body: JSON.stringify({
                model: config.model,
                messages: allMessages,
                temperature: 0.6,
                max_tokens: 1000,
            }),
        });
    } catch (err) {
        return res.status(502).json({ error: `Network error calling upstream: ${err.message}` });
    }

    let upstreamData;
    try {
        upstreamData = await upstream.json();
    } catch {
        return res.status(502).json({ error: `Bad JSON from upstream (status ${upstream.status})` });
    }

    if (!upstream.ok) {
        return res.status(502).json({ error: `Upstream ${upstream.status}`, detail: upstreamData });
    }

    const text = upstreamData?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ text });
}
