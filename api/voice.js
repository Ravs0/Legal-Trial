// Vercel Node.js 18+ serverless function — Voice Integration (Sarvam AI)
import { allowRequest, applyCors, validText } from './security.js';

const MAX_TTS_CHARS = 6_000;
const MAX_AUDIO_BASE64_CHARS = 8 * 1024 * 1024;
const SUPPORTED_LANGUAGES = new Set(['hi-IN', 'en-IN', 'ta-IN', 'te-IN', 'bn-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'pa-IN']);

export default async function handler(req, res) {
    if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin is not allowed.' });

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!allowRequest(req, { limit: 20, windowMs: 60_000 })) {
        return res.status(429).json({ error: 'Too many voice requests. Please wait a minute and try again.' });
    }

    let body = req.body;
    if (typeof body === "string") {
        try {
            body = JSON.parse(body);
        } catch {
            return res.status(400).json({ error: "Invalid JSON" });
        }
    }
    if (!body) return res.status(400).json({ error: "Empty body" });

    const { action } = body;
    const apiKey = process.env.SARVAM_API_KEY;

    if (!apiKey) {
        return res.status(503).json({
            error: "Sarvam API key is not configured. Add SARVAM_API_KEY in your environment variables.",
        });
    }

    try {
        if (action === "tts") {
            const { text, language = "hi-IN", gender = "female" } = body;
            if (!validText(text, MAX_TTS_CHARS) || !text.trim()) return res.status(400).json({ error: `TTS text must be 1–${MAX_TTS_CHARS} characters.` });
            if (!SUPPORTED_LANGUAGES.has(language) || !['female', 'male'].includes(gender)) return res.status(400).json({ error: 'Unsupported voice option.' });

            const response = await fetch("https://api.sarvam.ai/text-to-speech", {
                method: "POST",
                headers: {
                    "api-subscription-key": apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    inputs: [text],
                    target_language_code: language,
                    speaker_gender: gender,
                    speech_sample_rate: 16000,
                    enable_preprocessing: true,
                    model: "bulbul:v1",
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(response.status).json({ error: `Sarvam TTS API failed: ${errText}` });
            }

            const data = await response.json();
            if (data.audios && data.audios.length > 0) {
                return res.status(200).json({
                    status: "success",
                    audio: data.audios[0],
                    format: "wav",
                });
            } else {
                return res.status(502).json({ error: "No audio returned from Sarvam API" });
            }

        } else if (action === "stt") {
            const { audio, language = "hi-IN" } = body;
            if (!validText(audio, MAX_AUDIO_BASE64_CHARS) || !audio) return res.status(400).json({ error: 'Audio is missing or exceeds the 6 MB limit.' });
            if (!SUPPORTED_LANGUAGES.has(language)) return res.status(400).json({ error: 'Unsupported language.' });

            // Decode base64 audio to Buffer
            const audioBuffer = Buffer.from(audio, "base64");
            
            // Create Blob for file upload
            const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });
            
            // Construct multipart form data
            const formData = new FormData();
            formData.append("file", audioBlob, "audio.wav");
            formData.append("language_code", language);
            formData.append("model", "saarika:v1");
            formData.append("with_diarization", "false");

            const response = await fetch("https://api.sarvam.ai/speech-to-text", {
                method: "POST",
                headers: {
                    "api-subscription-key": apiKey,
                },
                body: formData,
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(response.status).json({ error: `Sarvam STT API failed: ${errText}` });
            }

            const data = await response.json();
            return res.status(200).json({
                status: "success",
                text: data.transcript || "",
            });

        } else {
            return res.status(400).json({ error: `Unknown action: ${action}` });
        }
    } catch (err) {
        return res.status(500).json({ error: `Internal Server Error: ${err.message}` });
    }
}
