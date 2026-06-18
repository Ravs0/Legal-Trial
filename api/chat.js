// Vercel Node.js 18+ serverless function — AI chat proxy

function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function getModelConfig(modelName) {
    const e = process.env;

    // 1. Zenmux configuration (preferred)
    const zenmuxKey = e.ZENMUX_API_KEY;
    if (zenmuxKey) {
        const baseUrl = (e.ZENMUX_BASE_URL || "https://zenmux.ai/api/v1").replace(/\/$/, "");
        return {
            url: `${baseUrl}/chat/completions`,
            key: zenmuxKey,
            model: "z-ai/glm-5.2-free",
        };
    }

    // 2. DeepSeek configuration (fallback)
    const dsNative = e.DEEPSEEK_API_KEY || e.DEEPSEEK_CHAT_API_KEY || e.DEEPSEEK_REASONER_API_KEY;
    if (dsNative) {
        const isReasoner = modelName === "deepseek-reasoner" || modelName === "reasoner" || modelName === "deepseek-v4-pro" || modelName === "v4-pro" || modelName === "deepseek-reasoner-native";
        return {
            url: "https://api.deepseek.com/v1/chat/completions",
            key: dsNative,
            model: isReasoner ? "deepseek-reasoner" : "deepseek-chat",
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

    const { messages, system, model } = body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: "'messages' array required" });

    const config = getModelConfig(model);
    if (!config) {
        return res.status(503).json({
            error: "No AI API key configured. Add ZENMUX_API_KEY or DEEPSEEK_API_KEY in env vars.",
        });
    }

    const allMessages = system
        ? [{ role: "system", content: system }, ...messages]
        : messages;

    const streamRequested = !!body.stream;

    let upstream;
    try {
        const isReasoner = config.model.includes("reasoner");
        upstream = await fetch(config.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.key}`,
            },
            body: JSON.stringify({
                model: config.model,
                messages: allMessages,
                temperature: isReasoner ? undefined : 0.6,
                max_tokens: isReasoner ? undefined : 1000,
                stream: streamRequested,
            }),
        });
    } catch (err) {
        return res.status(502).json({ error: `Network error: ${err.message}` });
    }

    if (!upstream.ok) {
        let upstreamData = {};
        try { upstreamData = await upstream.json(); } catch {}
        return res.status(502).json({
            error: `${config.model} returned ${upstream.status}`,
            detail: upstreamData,
        });
    }

    if (streamRequested) {
        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Transfer-Encoding": "chunked",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        });

        const reader = upstream.body;
        let buffer = "";
        const decoder = new TextDecoder();
        for await (const chunk of reader) {
            buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop(); // keep last partial line in buffer

            for (const line of lines) {
                const cleaned = line.trim();
                if (!cleaned) continue;
                if (cleaned === "data: [DONE]") continue;
                if (cleaned.startsWith("data: ")) {
                    try {
                        const json = JSON.parse(cleaned.slice(6));
                        const content = json.choices?.[0]?.delta?.content || "";
                        if (content) {
                            res.write(content);
                        }
                    } catch (e) {
                        // ignore malformed lines
                    }
                }
            }
        }
        res.end();
        return;
    }

    let upstreamData;
    try {
        upstreamData = await upstream.json();
    } catch {
        const rawText = await upstream.text().catch(() => "");
        return res.status(502).json({ error: `Bad response from ${config.model} (${upstream.status}): ${rawText.slice(0, 200)}` });
    }

    const text = upstreamData?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ text });
}
