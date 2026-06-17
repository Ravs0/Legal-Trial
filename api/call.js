// Vercel Node.js 18+ serverless function — AI call proxy mapping to DeepSeek V3 & Reasoner
// Matches the API structure of the original ai-council orchestration call function.

function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function getModelConfig(modelName) {
    const e = process.env;
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
        try {
            body = JSON.parse(body);
        } catch {
            return res.status(400).json({ error: "Invalid JSON" });
        }
    }
    if (!body) return res.status(400).json({ error: "Empty body" });

    const { prompt, system = "You are a helpful legal assistant.", model = "deepseek-chat", max_tokens } = body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const config = getModelConfig(model);
    if (!config) {
        return res.status(503).json({
            error: "No DeepSeek API key configured. Add DEEPSEEK_API_KEY in your environment variables.",
        });
    }

    const messages = [
        { role: "system", content: system },
        { role: "user", content: prompt }
    ];

    try {
        const upstream = await fetch(config.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.key}`,
            },
            body: JSON.stringify({
                model: config.model,
                messages,
                temperature: config.model === "deepseek-reasoner" ? undefined : 0.6,
                max_tokens: config.model === "deepseek-reasoner" ? undefined : (max_tokens || 1000),
            }),
        });

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

    } catch (err) {
        return res.status(500).json({ error: `Internal Server Error: ${err.message}` });
    }
}
