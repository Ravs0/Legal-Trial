// Vercel Node.js 18+ serverless function — Voice Integration (Sarvam AI)
// Hardened: structured errors, graceful missing-key degradation, safer audio handling.
import {
  allowRequest,
  applyCors,
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  enforceBodyLimit,
  fetchWithTimeout,
  sanitizeProviderSnippet,
  validText,
} from './_lib/security.js';
import { queryJev } from './_lib/jev/client.js';

const MAX_TTS_CHARS = 6_000;
/** Raw base64 character budget (~6 MB decoded). */
const MAX_AUDIO_BASE64_CHARS = 8 * 1024 * 1024;
/** STT payloads are large (base64 audio); allow up to ~10 MiB request bodies. */
const MAX_VOICE_BODY_BYTES = 10 * 1024 * 1024;
/** Reject empty / click-noise clips that would only waste quota. */
const MIN_AUDIO_BYTES = 256;
const UPSTREAM_TIMEOUT_MS = DEFAULT_UPSTREAM_TIMEOUT_MS;

const SUPPORTED_LANGUAGES = new Set([
  'hi-IN', 'en-IN', 'ta-IN', 'te-IN', 'bn-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'pa-IN',
]);

/** Client-friendly aliases → Sarvam codes. */
const LANGUAGE_ALIASES = {
  'en-US': 'en-IN',
  'en-GB': 'en-IN',
  en: 'en-IN',
  hi: 'hi-IN',
};

const MIME_TO_EXT = {
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
};

function jsonError(res, status, code, error, extra = {}) {
  return res.status(status).json({ status: 'error', code, error, ...extra });
}

function normalizeLanguage(language) {
  if (!language || typeof language !== 'string') return null;
  const trimmed = language.trim();
  if (SUPPORTED_LANGUAGES.has(trimmed)) return trimmed;
  const alias = LANGUAGE_ALIASES[trimmed] || LANGUAGE_ALIASES[trimmed.toLowerCase()];
  if (alias && SUPPORTED_LANGUAGES.has(alias)) return alias;
  return null;
}

function normalizeMimeType(raw) {
  if (!raw || typeof raw !== 'string') return 'audio/webm';
  // Strip codecs params: "audio/webm;codecs=opus" → "audio/webm"
  const base = raw.split(';')[0].trim().toLowerCase();
  if (MIME_TO_EXT[base]) return base;
  if (base.startsWith('audio/')) return base;
  return 'audio/webm';
}

function extensionForMime(mime) {
  return MIME_TO_EXT[mime] || 'webm';
}

function isLikelyBase64(value) {
  if (typeof value !== 'string' || !value.length) return false;
  // Allow standard and URL-safe base64; ignore whitespace.
  const compact = value.replace(/\s+/g, '');
  if (compact.length < 8) return false;
  return /^[A-Za-z0-9+/_-]+={0,2}$/.test(compact);
}

function decodeBase64Audio(audio) {
  const compact = String(audio).replace(/\s+/g, '');
  // Buffer tolerates both standard and base64url in modern Node; normalize url-safe.
  const normalized = compact.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

function sanitizeUpstreamError(errText, fallback) {
  // Prefer generic client messages; log the redacted snippet server-side.
  if (!errText || typeof errText !== 'string') return fallback;
  const clipped = sanitizeProviderSnippet(errText, 160);
  if (!clipped || clipped === '[redacted provider message]') {
    return 'Voice provider rejected the request. Check server configuration.';
  }
  // Still avoid leaking free-form provider text to clients.
  return fallback;
}

// ---- B12: Needle+JEV pre-grade helpers (async-safe; never on the stt/tts audio path) ----
const VOICE_GRADE_EXCERPT_CHARS = 4000;
// Noul gates are yes/no probabilities (0..1, NO confidence field): 0.5 is the
// decision boundary. Distinct from chain.js JEV_CONF_THRESHOLD (0.6), which
// gates Score-type confidence — not applicable here.

export default async function handler(req, res) {
  if (!applyCors(req, res)) return jsonError(res, 403, 'ORIGIN_FORBIDDEN', 'Origin is not allowed.');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  if (!allowRequest(req, { limit: 20, windowMs: 60_000 })) {
    return jsonError(res, 429, 'RATE_LIMITED', 'Too many voice requests. Please wait a minute and try again.');
  }
  if (!enforceBodyLimit(req, res, MAX_VOICE_BODY_BYTES)) return;

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return jsonError(res, 400, 'INVALID_JSON', 'Invalid JSON');
    }
  }
  if (!body || typeof body !== 'object') return jsonError(res, 400, 'EMPTY_BODY', 'Empty body');

  const { action } = body;
  const apiKey = (process.env.SARVAM_API_KEY || '').trim();
  const configured = Boolean(apiKey);

  // Lightweight capability probe — safe without key; does not call Sarvam.
  if (action === 'status') {
    return res.status(200).json({
      status: 'success',
      configured,
      available: configured,
      features: {
        stt: configured,
        tts: configured,
        browserTtsFallback: true,
      },
      message: configured
        ? 'Sarvam voice is configured.'
        : 'SARVAM_API_KEY is not configured. Browser TTS still works; mic transcription is disabled.',
    });
  }

  // B12: grade never touches Sarvam (transcript in, voters out), so it must
  // not require SARVAM_API_KEY. Only stt/tts need the provider key.
  if (!configured && (action === 'stt' || action === 'tts')) {
    return jsonError(
      res,
      503,
      'MISSING_API_KEY',
      'Voice transcription/synthesis is unavailable: SARVAM_API_KEY is not configured on the server.',
      {
        available: false,
        features: { stt: false, tts: false, browserTtsFallback: true },
        hint: 'Add SARVAM_API_KEY in your environment variables (Vercel project settings or .env). Courtroom browser TTS does not require this key.',
      },
    );
  }

  try {
    if (action === 'tts') {
      const { text, language = 'hi-IN', gender = 'female' } = body;
      if (!validText(text, MAX_TTS_CHARS) || !String(text || '').trim()) {
        return jsonError(res, 400, 'INVALID_TEXT', `TTS text must be 1–${MAX_TTS_CHARS} characters.`);
      }
      const lang = normalizeLanguage(language);
      if (!lang || !['female', 'male'].includes(gender)) {
        return jsonError(res, 400, 'UNSUPPORTED_OPTION', 'Unsupported voice option.');
      }

      let response;
      try {
        response = await fetchWithTimeout('https://api.sarvam.ai/text-to-speech', {
          method: 'POST',
          headers: {
            'api-subscription-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: [String(text).trim()],
            target_language_code: lang,
            speaker_gender: gender,
            speech_sample_rate: 16000,
            enable_preprocessing: true,
            model: 'bulbul:v1',
          }),
        });
      } catch (err) {
        const aborted = err?.name === 'AbortError';
        return jsonError(
          res,
          504,
          aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK',
          aborted ? 'Voice synthesis timed out. Try a shorter passage.' : 'Could not reach the voice provider.',
        );
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error('[voice/tts] Sarvam error', response.status, sanitizeProviderSnippet(errText, 500));
        return jsonError(
          res,
          response.status >= 400 && response.status < 600 ? response.status : 502,
          'TTS_UPSTREAM',
          sanitizeUpstreamError(errText, 'Text-to-speech failed.'),
        );
      }

      const data = await response.json().catch(() => null);
      if (data?.audios?.length > 0 && typeof data.audios[0] === 'string') {
        return res.status(200).json({
          status: 'success',
          audio: data.audios[0],
          format: 'wav',
        });
      }
      return jsonError(res, 502, 'TTS_EMPTY', 'No audio returned from voice provider.');

    } else if (action === 'stt') {
      const { audio, language = 'hi-IN', mimeType } = body;
      if (!validText(audio, MAX_AUDIO_BASE64_CHARS) || !audio) {
        return jsonError(res, 400, 'INVALID_AUDIO', 'Audio is missing or exceeds the size limit (~6 MB).');
      }
      if (!isLikelyBase64(audio)) {
        return jsonError(res, 400, 'INVALID_AUDIO', 'Audio payload is not valid base64.');
      }

      const lang = normalizeLanguage(language);
      if (!lang) {
        return jsonError(res, 400, 'UNSUPPORTED_LANGUAGE', 'Unsupported language for speech-to-text.');
      }

      let audioBuffer;
      try {
        audioBuffer = decodeBase64Audio(audio);
      } catch {
        return jsonError(res, 400, 'INVALID_AUDIO', 'Could not decode audio data.');
      }

      if (!audioBuffer || audioBuffer.length < MIN_AUDIO_BYTES) {
        return jsonError(
          res,
          400,
          'AUDIO_TOO_SHORT',
          'Recording is empty or too short. Hold the mic a moment longer and speak clearly.',
        );
      }

      const mime = normalizeMimeType(mimeType);
      const ext = extensionForMime(mime);
      const audioBlob = new Blob([audioBuffer], { type: mime });

      const formData = new FormData();
      formData.append('file', audioBlob, `audio.${ext}`);
      formData.append('language_code', lang);
      formData.append('model', 'saarika:v1');
      formData.append('with_diarization', 'false');

      let response;
      try {
        response = await fetchWithTimeout('https://api.sarvam.ai/speech-to-text', {
          method: 'POST',
          headers: {
            'api-subscription-key': apiKey,
          },
          body: formData,
        });
      } catch (err) {
        const aborted = err?.name === 'AbortError';
        return jsonError(
          res,
          504,
          aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK',
          aborted ? 'Transcription timed out. Try a shorter clip.' : 'Could not reach the voice provider.',
        );
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error('[voice/stt] Sarvam error', response.status, sanitizeProviderSnippet(errText, 500));
        return jsonError(
          res,
          response.status >= 400 && response.status < 600 ? response.status : 502,
          'STT_UPSTREAM',
          sanitizeUpstreamError(errText, 'Speech-to-text failed.'),
        );
      }

      const data = await response.json().catch(() => null);
      const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
      if (!transcript) {
        return res.status(200).json({
          status: 'success',
          text: '',
          empty: true,
          message: 'No speech detected. Try again closer to the microphone.',
        });
      }
      return res.status(200).json({
        status: 'success',
        text: transcript,
      });

    } else if (action === 'grade') {
      // B12: async-safe Needle+JEV pre-grade. Called by the client AFTER stt
      // returns — never on the realtime audio path, so transcription latency
      // is untouched. Never throws: every voter degrades independently.
      const { text, needle } = body;
      if (!validText(text, MAX_TTS_CHARS) || !String(text || '').trim()) {
        return jsonError(res, 400, 'INVALID_TEXT', `Grade text must be 1–${MAX_TTS_CHARS} characters.`);
      }
      const excerpt = String(text).trim().slice(0, VOICE_GRADE_EXCERPT_CHARS);

      // Voter 1 — Needle sidecar JSON (offline extract.py output, shipped by
      // the client). Absent/unparseable -> honest degraded voter, gates go on.
      let needleVoter;
      let needleFields = {};
      try {
        if (needle === undefined || needle === null || needle === '') {
          needleVoter = { source: 'needle', ok: false, code: 'NO_SIDECAR', escalate: null };
        } else {
          const { fromSidecar } = await import('./_lib/needle/schemas.js');
          const side = fromSidecar(needle);
          needleVoter = {
            source: 'needle',
            ok: side.ok === true,
            code: side.ok ? 'OK' : (side.code || (side.codes && side.codes[0]) || 'SIDECAR_FAILED'),
            escalate: side.escalate === true,
          };
          if (side.authority) needleFields.authority = side.authority;
          if (side.turnFacts) needleFields.turnFacts = side.turnFacts;
        }
      } catch {
        needleVoter = { source: 'needle', ok: false, code: 'NEEDLE_PARSE_ERROR', escalate: true };
      }

      // Voter 2 — heuristic (chain.js parity, inline fallback if import fails).
      let heuristicVoter;
      try {
        const { heuristic } = await import('./_lib/lexforge/chain.js');
        const h = heuristic(excerpt);
        heuristicVoter = { source: 'heuristic', score: h.score };
      } catch {
        const n = excerpt.split(/\s+/).filter(Boolean).length;
        const score = Math.max(0, Math.min(1, 0.3 + n / 600));
        heuristicVoter = { source: 'heuristic', score: +score.toFixed(3) };
      }

      // Voter 3 — ONE batched JEV call, 3 Noul gates (prob 0..1, no confidence).
      let jevVoter;
      let thinAnswer = null;
      let hedged = null;
      let needsEscalation = null;
      let jevTokens = 0;
      try {
        const state = `Transcript excerpt:\n${excerpt}${Object.keys(needleFields).length ? `\n\nNeedle-extracted fields:\n${Object.entries(needleFields).map(([k, v]) => `${k}: ${JSON.stringify(v)?.slice(0, 300)}`).join('\n')}` : ''}`;
        const jevRes = await queryJev({
          state,
          questions: {
            thin_answer: { type: 'noul', instructions: 'Is this drill answer thin or lacking substance?', criteria: { true: 'The answer is thin or lacks substance.', false: 'The answer contains substantive content.' } },
            hedged: { type: 'noul', instructions: 'Is this answer heavily hedged?', criteria: { true: 'The answer is heavily hedged.', false: 'The answer commits to a position.' } },
            needs_escalation: { type: 'noul', instructions: 'Does this turn need human escalation?', criteria: { true: 'A human reviewer must see this turn.', false: 'This turn is safe for automated grading.' } },
          },
        });
        if (!jevRes.ok) {
          jevVoter = { source: 'jev', ok: false, code: jevRes.code || 'chain-degraded' };
        } else {
          const pick = (a) => Number.isFinite(Number(a?.probability)) ? Math.max(0, Math.min(1, Number(a.probability))) : null;
          const t = pick(jevRes.answers?.thin_answer);
          const hd = pick(jevRes.answers?.hedged);
          const ne = pick(jevRes.answers?.needs_escalation);
          if (t === null || hd === null || ne === null) {
            jevVoter = { source: 'jev', ok: false, code: 'chain-degraded' };
          } else {
            thinAnswer = t;
            hedged = hd;
            needsEscalation = ne;
            jevTokens = Number.isFinite(Number(jevRes.usage?.input_tokens)) ? Number(jevRes.usage.input_tokens) : Math.ceil(state.length / 4);
            jevVoter = { source: 'jev', ok: true };
          }
        }
      } catch {
        jevVoter = { source: 'jev', ok: false, code: 'chain-degraded' };
      }

      const degraded = jevVoter.ok === false;
      const decision = (
        (typeof needsEscalation === 'number' && needsEscalation >= 0.5) ||
        (typeof thinAnswer === 'number' && thinAnswer >= 0.5) ||
        needleVoter.escalate === true ||
        degraded
      ) ? 'human_review' : 'auto';

      return res.status(200).json({
        status: 'success',
        decision,
        // Top-level degrade mirroring the chain contract: JEV absent/bad
        // shape never blocks grading, but callers see it without digging
        // into voters[2].
        ...(degraded ? { code: 'chain-degraded' } : {}),
        text: excerpt,
        gates: { thin_answer: thinAnswer, hedged, needs_escalation: needsEscalation },
        needle: { ok: needleVoter.ok, code: needleVoter.code, escalate: needleVoter.escalate },
        voters: [needleVoter, heuristicVoter, jevVoter],
        // NOTE: hedged + heuristic are telemetry here (they do not move the
        // gate): hedged is advisory per spec; there is no ABSTAIN_GAP-style
        // heuristic-vs-Noul gap because Noul gates are probabilities, not
        // scores on the same 0..1 scale as the heuristic. Full numeric
        // agreement (heuristic vs JEV Score vs LLM) lives in runChain —
        // pregrade.needleFields/transcript feed it directly.
        pregrade: { transcript: excerpt, needleFields, threshold: 0.5 },
        usage: { jevTokens, llmSkipped: 'deferred', gradedAsync: true },
      });

    } else {
      return jsonError(res, 400, 'UNKNOWN_ACTION', `Unknown action: ${action || '(missing)'}. Use stt, tts, status, or grade.`);
    }
  } catch (err) {
    console.error('[voice] unhandled', err?.message || err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error while processing voice request.');
  }
}
