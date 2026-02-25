// Vercel Node.js 18+ serverless function — AI chat proxy

function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function getModelConfig() {
    const e = process.env;

    // 1) Native DeepSeek (cheap, fast, reliable)
    const dsNative = e.DEEPSEEK_API_KEY || e.DEEPSEEK_CHAT_API_KEY || e.DEEPSEEK_REASONER_API_KEY;
    if (dsNative) {
        return {
            url: "https://api.deepseek.com/v1/chat/completions",
            key: dsNative,
            model: "deepseek-chat",
        };
    }

    // 2) Groq (fast inference)
    if (e.GROQ_API_KEY) {
        return {
            url: "https://api.groq.com/openai/v1/chat/completions",
            key: e.GROQ_API_KEY,
            model: "llama-3.3-70b-versatile",
        };
    }

    // 3) Kimi via NVIDIA
    if (e.KIMI_API_KEY) {
        return {
            url: "https://integrate.api.nvidia.com/v1/chat/completions",
            key: e.KIMI_API_KEY,
            model: "moonshotai/kimi-k2.5",
        };
    }

    // 4) Minimax via NVIDIA
    if (e.MINIMAX_API_KEY) {
        return {
            url: "https://integrate.api.nvidia.com/v1/chat/completions",
            key: e.MINIMAX_API_KEY,
            model: "minimaxai/minimax-m2.1",
        };
    }

    return null;
}

export default async function handler(req, res) {
    const origin = req.headers["origin"] || "*";
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    let body = req.body;
    if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }
    if (!body) return res.status(400).json({ error: "Empty body" });

    const { messages, system } = body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: "'messages' array required" });

    const config = getModelConfig();
    if (!config) {
        return res.status(503).json({
            error: "No AI API key configured. Add DEEPSEEK_API_KEY or DEEPSEEK_CHAT_API_KEY in Vercel env vars.",
        });
    }

    const allMessages = system
        ? [{ role: "system", content: system }, ...messages]
        : messages;

    let upstream;
    try {
        upstream = await fetch(config.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.key}`,
            },
            body: JSON.stringify({
                model: config.model,
                messages: allMessages,
                temperature: 0.6,
                max_tokens: 1000,
            }),
        });
    } catch (err) {
        return res.status(502).json({ error: `Network error: ${err.message}` });
    }

    let upstreamData;
    try {
        upstreamData = await upstream.json();
    } catch {
        const rawText = await upstream.text().catch(() => "");
        return res.status(502).json({ error: `Bad response from ${config.model} (${upstream.status}): ${rawText.slice(0, 200)}` });
    }

    if (!upstream.ok) {
        return res.status(502).json({
            error: `${config.model} returned ${upstream.status}`,
            detail: upstreamData,
        });
    }

    const text = upstreamData?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ text });
}
