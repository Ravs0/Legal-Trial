// Vercel Node.js 18+ serverless function — AI chat proxy
import { allowRequest, applyCors, clampNumber, validText } from './security.js';

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 12_000;
const MAX_TOTAL_CHARS = 60_000;
const TRAINING_GUARDRAIL = `

This is a simulated legal-skills exercise. Do not claim to be a real judge, lawyer, public figure, court, or source of legal authority. Treat all personas as fictional training profiles and any examples or authorities as material to verify against primary sources. Do not provide legal advice or invent citations.`;

function getModelConfig(modelName) {
    const e = process.env;

    // Strict DeepSeek-only configuration
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
    if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin is not allowed.' });

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!allowRequest(req, { limit: 30, windowMs: 60_000 })) {
        return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
    }

    let body = req.body;
    if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }
    if (!body) return res.status(400).json({ error: "Empty body" });

    const { messages, system, model, temperature, max_tokens } = body;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
        return res.status(400).json({ error: `'messages' must contain 1–${MAX_MESSAGES} messages.` });
    }
    if (!messages.every((message) => (
        message && ['user', 'assistant'].includes(message.role) && validText(message.content, MAX_MESSAGE_CHARS)
    ))) {
        return res.status(400).json({ error: 'Messages must be user or assistant text within the size limit.' });
    }
    if (messages.reduce((total, message) => total + message.content.length, 0) > MAX_TOTAL_CHARS ||
        (system !== undefined && !validText(system, MAX_MESSAGE_CHARS))) {
        return res.status(400).json({ error: 'The conversation is too large.' });
    }

    const config = getModelConfig(model);
    if (!config) {
        return res.status(503).json({
            error: "No AI API key configured. Add DEEPSEEK_API_KEY or DEEPSEEK_CHAT_API_KEY in Vercel env vars.",
        });
    }

    const allMessages = [{ role: "system", content: `${system || 'Provide a careful, educational training response.'}${TRAINING_GUARDRAIL}` }, ...messages];

    const streamRequested = !!body.stream;

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
                // Reasoner ignores sampling params upstream. For chat we honour
                // client overrides, falling back to the original 0.6 / 1000
                // defaults so existing callers behave unchanged.
                temperature: config.model === "deepseek-reasoner"
                    ? undefined
                    : clampNumber(temperature, 0.6, 0, 1),
                max_tokens: config.model === "deepseek-reasoner"
                    ? undefined
                    : clampNumber(max_tokens, 1000, 1, 2000),
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
