// Vercel Node.js 18+ serverless function — AI chat proxy
// Hardened: body bounds, explicit model allowlist, streaming safety.
import {
  allowRequest,
  applyCors,
  clampNumber,
  clientError,
  enforceBodyLimit,
  fetchWithTimeout,
  sanitizeProviderSnippet,
  validText,
} from './security.js';

const MAX_MESSAGES = 30;
// Single-message cap. Must stay ≤ MAX_TOTAL_CHARS (which binds multi-message
// chats) and comfortably under the 256 KiB body budget and the upstream
// context window (60K chars ≈ 15–20K tokens). Raised from 12K because legal
// document parsing / research summarization legitimately ship larger turns;
// below 12K those features 400'd and silently fell back to local heuristics.
const MAX_MESSAGE_CHARS = 48_000;
const MAX_TOTAL_CHARS = 60_000;
/** Request body budget (~256 KiB) — defense in depth beyond per-field caps. */
const MAX_CHAT_BODY_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 55_000;

/**
 * Client-facing model IDs we accept. Unknown strings are rejected (400) rather
 * than silently remapped, so callers cannot probe or force unintended upstream
 * model names. Omitted / empty model defaults to deepseek-chat.
 */
const ALLOWED_CLIENT_MODELS = new Set([
  'deepseek-chat',
  'chat',
  'deepseek',
  'deepseek-reasoner',
  'reasoner',
  'deepseek-v4-pro',
  'v4-pro',
  'deepseek-reasoner-native',
]);

/** Client IDs that map to the DeepSeek reasoner endpoint. */
const REASONER_CLIENT_MODELS = new Set([
  'deepseek-reasoner',
  'reasoner',
  'deepseek-v4-pro',
  'v4-pro',
  'deepseek-reasoner-native',
]);

/** Cap on a single incomplete SSE line held in the parse buffer. */
const MAX_SSE_LINE_BUFFER = 64 * 1024;
/** Hard cap on characters written to the client during a stream. */
const MAX_STREAM_OUT_CHARS = 200_000;
/** Max length of a single delta content fragment before dropping it. */
const MAX_DELTA_CHUNK_CHARS = 8_000;

const TRAINING_GUARDRAIL = `

This is a simulated legal-skills exercise. Do not claim to be a real judge, lawyer, public figure, court, or source of legal authority. Treat all personas as fictional training profiles and any examples or authorities as material to verify against primary sources. Do not provide legal advice or invent citations.`;

/**
 * Resolve an allow-listed client model name to upstream config.
 * @returns {{ url: string, key: string, model: string } | { error: string, status: number } | null}
 *   null = no API key; { error, status } = invalid model; config object = OK.
 */
function getModelConfig(modelName) {
  // Default when client omits model (aiService, most screens).
  if (modelName === undefined || modelName === null || modelName === '') {
    modelName = 'deepseek-chat';
  }
  if (typeof modelName !== 'string' || !ALLOWED_CLIENT_MODELS.has(modelName)) {
    return {
      error: `Unsupported model. Allowed: ${[...ALLOWED_CLIENT_MODELS].join(', ')}.`,
      status: 400,
    };
  }

  const e = process.env;
  const dsNative = e.DEEPSEEK_API_KEY || e.DEEPSEEK_CHAT_API_KEY || e.DEEPSEEK_REASONER_API_KEY;
  if (!dsNative) return null;

  const isReasoner = REASONER_CLIENT_MODELS.has(modelName);
  return {
    url: 'https://api.deepseek.com/v1/chat/completions',
    key: dsNative,
    model: isReasoner ? 'deepseek-reasoner' : 'deepseek-chat',
  };
}

/** Best-effort cancel of an upstream ReadableStream body. */
async function cancelUpstreamBody(body) {
  if (!body) return;
  try {
    if (typeof body.cancel === 'function') {
      await body.cancel();
      return;
    }
    if (typeof body.destroy === 'function') {
      body.destroy();
    }
  } catch {
    // ignore — stream may already be closed
  }
}

/**
 * Stream upstream SSE (OpenAI-style) to the client as plain text deltas only.
 * Safety: client-close abort, SSE line buffer cap, total output cap, delta size cap.
 */
async function pipeChatStream(req, res, upstream) {
  // Prefer setHeader over writeHead so CORS headers set by applyCors are preserved
  // and we do not force Transfer-Encoding (platform may manage chunking).
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const reader = upstream.body;
  if (!reader) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(clientError('The AI provider returned an empty stream.')));
    return;
  }

  let buffer = '';
  const decoder = new TextDecoder();
  let clientClosed = false;
  let totalOut = 0;
  let truncated = false;

  const onClose = () => {
    clientClosed = true;
  };
  req.on('close', onClose);
  // Also treat aborted/finished requests as closed when available.
  if (typeof req.on === 'function') {
    req.on('aborted', onClose);
  }

  try {
    for await (const chunk of reader) {
      if (clientClosed) break;

      const piece = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      if (buffer.length + piece.length > MAX_SSE_LINE_BUFFER * 4) {
        // Pathological upstream (no newlines / huge payload) — stop streaming.
        console.error('[chat] stream buffer overflow; aborting stream');
        truncated = true;
        break;
      }
      buffer += piece;

      // Drop excess incomplete trailing data if a single line grows past the cap.
      if (buffer.length > MAX_SSE_LINE_BUFFER && !buffer.includes('\n')) {
        console.error('[chat] SSE line buffer exceeded without newline; aborting stream');
        truncated = true;
        break;
      }

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      if (buffer.length > MAX_SSE_LINE_BUFFER) {
        // Keep only the tail so we do not OOM on a runaway line.
        buffer = buffer.slice(-MAX_SSE_LINE_BUFFER);
      }

      for (const line of lines) {
        if (clientClosed) break;
        const cleaned = line.trim();
        if (!cleaned) continue;
        if (cleaned === 'data: [DONE]') continue;
        if (!cleaned.startsWith('data: ')) continue;

        const payload = cleaned.slice(6);
        // Bound work on a single SSE data payload.
        if (payload.length > MAX_SSE_LINE_BUFFER) continue;

        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          // ignore malformed lines
          continue;
        }

        const content = json?.choices?.[0]?.delta?.content;
        if (typeof content !== 'string' || !content) continue;
        if (content.length > MAX_DELTA_CHUNK_CHARS) continue;

        const remaining = MAX_STREAM_OUT_CHARS - totalOut;
        if (remaining <= 0) {
          truncated = true;
          clientClosed = true; // stop reading further
          break;
        }
        const toWrite = content.length > remaining ? content.slice(0, remaining) : content;
        totalOut += toWrite.length;
        try {
          res.write(toWrite);
        } catch {
          clientClosed = true;
          break;
        }
        if (toWrite.length < content.length) {
          truncated = true;
          clientClosed = true;
          break;
        }
      }
    }
  } catch (err) {
    if (!clientClosed) {
      console.error('[chat] stream read error', err?.message || err);
    }
  } finally {
    req.off?.('close', onClose);
    req.off?.('aborted', onClose);
    // Stop upstream generation when client left or we hit a cap.
    await cancelUpstreamBody(reader);
  }

  if (!res.writableEnded && !res.destroyed) {
    try {
      // Optional soft marker only when we truncated mid-stream and client is still there.
      // Keep it empty so existing clients (plain text accumulators) stay compatible.
      if (truncated && totalOut === 0 && !clientClosed) {
        // Nothing was written and we failed — surface a short note.
        res.write('');
      }
      res.end();
    } catch {
      // ignore double-end / destroyed socket
    }
  }
}

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json(clientError('Origin is not allowed.'));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json(clientError('Method not allowed'));
  if (!allowRequest(req, { limit: 30, windowMs: 60_000 })) {
    return res.status(429).json(clientError('Too many requests. Please wait a minute and try again.'));
  }
  if (!enforceBodyLimit(req, res, MAX_CHAT_BODY_BYTES)) return;

  let body = req.body;
  if (typeof body === 'string') {
    // Secondary guard: reject enormous string bodies even if Content-Length was missing.
    if (Buffer.byteLength(body, 'utf8') > MAX_CHAT_BODY_BYTES) {
      return res.status(413).json(clientError('Request body is too large.'));
    }
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json(clientError('Invalid JSON'));
    }
  }
  // Reject arrays, null, primitives — only plain objects.
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json(clientError('Empty body'));
  }

  const { messages, system, model, temperature, max_tokens, stream } = body;

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return res.status(400).json(clientError(`'messages' must contain 1–${MAX_MESSAGES} messages.`));
  }
  if (!messages.every((message) => (
    message
    && typeof message === 'object'
    && !Array.isArray(message)
    && ['user', 'assistant'].includes(message.role)
    && validText(message.content, MAX_MESSAGE_CHARS)
  ))) {
    return res.status(400).json(clientError('Messages must be user or assistant text within the size limit.'));
  }
  const totalChars = messages.reduce((total, message) => total + message.content.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return res.status(400).json(clientError('The conversation is too large.'));
  }
  if (system !== undefined && system !== null && !validText(system, MAX_MESSAGE_CHARS)) {
    return res.status(400).json(clientError('The conversation is too large.'));
  }
  // stream must be boolean-ish if present; reject non-boolean objects/arrays.
  if (stream !== undefined && stream !== null && typeof stream !== 'boolean') {
    return res.status(400).json(clientError("'stream' must be a boolean."));
  }
  // temperature / max_tokens: only numbers or omitted (clampNumber handles the rest).
  if (temperature !== undefined && temperature !== null && typeof temperature !== 'number') {
    return res.status(400).json(clientError("'temperature' must be a number."));
  }
  if (max_tokens !== undefined && max_tokens !== null && typeof max_tokens !== 'number') {
    return res.status(400).json(clientError("'max_tokens' must be a number."));
  }

  const config = getModelConfig(model);
  if (config && config.error) {
    return res.status(config.status).json(clientError(config.error));
  }
  if (!config) {
    return res.status(503).json(clientError(
      'No AI API key configured. Add DEEPSEEK_API_KEY or DEEPSEEK_CHAT_API_KEY in Vercel env vars.',
    ));
  }

  const allMessages = [
    {
      role: 'system',
      content: `${system || 'Provide a careful, educational training response.'}${TRAINING_GUARDRAIL}`,
    },
    // Only forward role + content (strip any extra client fields).
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const streamRequested = stream === true;

  let upstream;
  try {
    upstream = await fetchWithTimeout(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: allMessages,
        // Reasoner ignores sampling params upstream. For chat we honour
        // client overrides, falling back to the original 0.6 / 1000
        // defaults so existing callers behave unchanged.
        temperature: config.model === 'deepseek-reasoner'
          ? undefined
          : clampNumber(temperature, 0.6, 0, 1),
        max_tokens: config.model === 'deepseek-reasoner'
          ? undefined
          // Cap raised so Strategy Room final drafts / long memos are not truncated at 2k.
          : clampNumber(max_tokens, 1000, 1, 4096),
        stream: streamRequested,
      }),
    }, UPSTREAM_TIMEOUT_MS);
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error('[chat] upstream network', aborted ? 'timeout' : (err?.message || err));
    return res.status(aborted ? 504 : 502).json(clientError(
      aborted ? 'The AI provider timed out. Try a shorter prompt.' : 'Could not reach the AI provider.',
    ));
  }

  if (!upstream.ok) {
    let upstreamData = {};
    try {
      upstreamData = await upstream.json();
    } catch { /* ignore */ }
    console.error(
      '[chat] upstream status',
      config.model,
      upstream.status,
      sanitizeProviderSnippet(JSON.stringify(upstreamData)),
    );
    await cancelUpstreamBody(upstream.body);
    return res.status(502).json(clientError('The AI provider returned an error. Please try again.'));
  }

  if (streamRequested) {
    await pipeChatStream(req, res, upstream);
    return;
  }

  let upstreamData;
  try {
    upstreamData = await upstream.json();
  } catch {
    const rawText = await upstream.text().catch(() => '');
    console.error(
      '[chat] bad JSON from provider',
      config.model,
      upstream.status,
      sanitizeProviderSnippet(rawText),
    );
    return res.status(502).json(clientError('Bad response from the AI provider.'));
  }

  let text = upstreamData?.choices?.[0]?.message?.content || '';
  if (typeof text !== 'string') text = '';
  // Bound non-stream responses the same way as stream output.
  if (text.length > MAX_STREAM_OUT_CHARS) {
    text = text.slice(0, MAX_STREAM_OUT_CHARS);
  }
  return res.status(200).json({ text });
}
