// LexForge voice utilities — browser TTS (no key) + Sarvam STT/TTS proxy (/api/voice).
// Designed for graceful degradation when SARVAM_API_KEY is missing.

export interface SpeakOptions {
  /** Preferred voice name/URI; falls back to en-IN, then any English, then default. */
  preferredVoice?: string | null;
  rate?: number;
  pitch?: number;
  /** When true, enqueue after any currently speaking utterance instead of replacing it. */
  queue?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

export type VoiceErrorCode =
  | 'MISSING_API_KEY'
  | 'INVALID_AUDIO'
  | 'AUDIO_TOO_SHORT'
  | 'UNSUPPORTED_LANGUAGE'
  | 'UNSUPPORTED_OPTION'
  | 'INVALID_TEXT'
  | 'RATE_LIMITED'
  | 'STT_UPSTREAM'
  | 'TTS_UPSTREAM'
  | 'TTS_EMPTY'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_NETWORK'
  | 'NETWORK'
  | 'EMPTY_TRANSCRIPT'
  | 'MIC_DENIED'
  | 'MIC_UNSUPPORTED'
  | 'BROWSER_TTS_UNAVAILABLE'
  | 'UNKNOWN';

export class VoiceError extends Error {
  code: VoiceErrorCode;
  status?: number;
  available?: boolean;

  constructor(message: string, code: VoiceErrorCode = 'UNKNOWN', status?: number, available?: boolean) {
    super(message);
    this.name = 'VoiceError';
    this.code = code;
    this.status = status;
    this.available = available;
  }
}

export interface VoiceCapability {
  configured: boolean;
  available: boolean;
  features: {
    stt: boolean;
    tts: boolean;
    browserTtsFallback: boolean;
  };
  message?: string;
  /** True when the probe could not reach the server (assume unknown / optimistically allow UI). */
  probeFailed?: boolean;
}

export interface TranscribeOptions {
  language?: string;
  signal?: AbortSignal;
}

export interface SynthesizeOptions {
  language?: string;
  gender?: 'female' | 'male';
  signal?: AbortSignal;
}

const MIN_BLOB_BYTES = 256;
const PROBE_TTL_MS = 60_000;

let capabilityCache: { at: number; value: VoiceCapability } | null = null;

export function isTTSAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isMicSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function'
    && typeof MediaRecorder !== 'undefined';
}

/** Pick a MediaRecorder mimeType the browser actually supports. */
export function preferredRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

// Strip the markdown the AI uses so the bench doesn't read asterisks aloud.
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s*>\s*/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

let voicesCache: SpeechSynthesisVoice[] = [];

function loadVoices(): SpeechSynthesisVoice[] {
  if (!isTTSAvailable()) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) voicesCache = voices;
  return voicesCache;
}

// Prefer English (India), then any English, then the first available voice.
export function pickVoice(preference?: string | null): SpeechSynthesisVoice | null {
  const voices = loadVoices();
  if (!voices.length) return null;
  if (preference) {
    const exact = voices.find(v => v.voiceURI === preference || v.name === preference);
    if (exact) return exact;
  }
  const enIn = voices.find(v => /en[-_]IN/i.test(v.lang));
  if (enIn) return enIn;
  const en = voices.find(v => v.lang.toLowerCase().startsWith('en'));
  if (en) return en;
  return voices[0];
}

// Speak text aloud. By default cancels any in-progress utterance to avoid overlap.
export function speak(text: string, options: SpeakOptions = {}): void {
  if (!isTTSAvailable() || !text.trim()) return;
  const synth = window.speechSynthesis;

  if (!options.queue && synth.speaking) {
    synth.cancel();
  }

  const plain = stripMarkdown(text);
  if (!plain) return;

  const utter = new SpeechSynthesisUtterance(plain);
  const voice = pickVoice(options.preferredVoice);
  if (voice) utter.voice = voice;
  utter.rate = options.rate ?? 1;
  utter.pitch = options.pitch ?? 1;
  if (options.onStart) utter.onstart = options.onStart;
  if (options.onEnd) utter.onend = options.onEnd;
  if (options.onError) utter.onerror = options.onError;

  try {
    synth.speak(utter);
  } catch (err) {
    options.onError?.(err);
  }
}

export function cancelSpeech(): void {
  if (!isTTSAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/** Safely convert a Blob/File to raw base64 (no data: prefix). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!blob || typeof blob.size !== 'number') {
      reject(new VoiceError('No audio recording to process.', 'INVALID_AUDIO'));
      return;
    }
    if (blob.size < MIN_BLOB_BYTES) {
      reject(new VoiceError(
        'Recording is empty or too short. Hold the mic a moment longer and speak clearly.',
        'AUDIO_TOO_SHORT',
      ));
      return;
    }
    if (blob.size > 6 * 1024 * 1024) {
      reject(new VoiceError('Recording is too large (max ~6 MB). Try a shorter clip.', 'INVALID_AUDIO'));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const result = reader.result;
        if (typeof result !== 'string' || !result) {
          reject(new VoiceError('Could not read audio data.', 'INVALID_AUDIO'));
          return;
        }
        const comma = result.indexOf(',');
        const payload = comma >= 0 ? result.slice(comma + 1) : result;
        if (!payload || payload.length < 8) {
          reject(new VoiceError('Could not read audio data.', 'INVALID_AUDIO'));
          return;
        }
        resolve(payload);
      } catch (e) {
        reject(e instanceof VoiceError ? e : new VoiceError('Could not read audio data.', 'INVALID_AUDIO'));
      }
    };
    reader.onerror = () => reject(new VoiceError('Failed to read audio recording.', 'INVALID_AUDIO'));
    reader.onabort = () => reject(new VoiceError('Audio read was cancelled.', 'INVALID_AUDIO'));
    try {
      reader.readAsDataURL(blob);
    } catch {
      reject(new VoiceError('Failed to read audio recording.', 'INVALID_AUDIO'));
    }
  });
}

function mapHttpError(status: number, data: { code?: string; error?: string; available?: boolean }): VoiceError {
  const code = (data.code as VoiceErrorCode) || (
    status === 503 ? 'MISSING_API_KEY'
      : status === 429 ? 'RATE_LIMITED'
        : status === 504 ? 'UPSTREAM_TIMEOUT'
          : 'UNKNOWN'
  );
  const message = data.error
    || (status === 503
      ? 'Voice transcription is unavailable (server voice key not configured). You can still type.'
      : `Voice request failed (${status}).`);
  return new VoiceError(message, code, status, data.available);
}

async function parseVoiceResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text.slice(0, 200) };
  }
}

/**
 * Probe whether Sarvam-backed STT/TTS is configured.
 * Cached briefly so mic UI can disable gracefully without hammering the API.
 */
export async function probeVoiceAvailability(force = false): Promise<VoiceCapability> {
  if (!force && capabilityCache && Date.now() - capabilityCache.at < PROBE_TTL_MS) {
    return capabilityCache.value;
  }

  const fallbackUnknown: VoiceCapability = {
    configured: false,
    available: false,
    features: { stt: false, tts: false, browserTtsFallback: isTTSAvailable() },
    message: 'Could not reach the voice service. Typing still works; browser TTS may still work.',
    probeFailed: true,
  };

  try {
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    });
    const data = await parseVoiceResponse(res) as {
      configured?: boolean;
      available?: boolean;
      features?: VoiceCapability['features'];
      message?: string;
      code?: string;
      error?: string;
    };

    // Older servers without `status` return 400 UNKNOWN_ACTION — treat as unknown, don't hard-disable.
    if (!res.ok && data.code === 'UNKNOWN_ACTION') {
      const optimistic: VoiceCapability = {
        configured: true,
        available: true,
        features: { stt: true, tts: true, browserTtsFallback: isTTSAvailable() },
        message: 'Voice status probe not supported by server; assuming available.',
        probeFailed: true,
      };
      capabilityCache = { at: Date.now(), value: optimistic };
      return optimistic;
    }

    if (res.status === 503 || data.code === 'MISSING_API_KEY') {
      const value: VoiceCapability = {
        configured: false,
        available: false,
        features: {
          stt: false,
          tts: false,
          browserTtsFallback: true,
        },
        message: data.error || data.message || 'SARVAM_API_KEY is not configured. Mic transcription is disabled; browser TTS still works.',
      };
      capabilityCache = { at: Date.now(), value };
      return value;
    }

    const value: VoiceCapability = {
      configured: Boolean(data.configured ?? data.available),
      available: Boolean(data.available ?? data.configured),
      features: data.features || {
        stt: Boolean(data.available ?? data.configured),
        tts: Boolean(data.available ?? data.configured),
        browserTtsFallback: true,
      },
      message: data.message,
    };
    capabilityCache = { at: Date.now(), value };
    return value;
  } catch {
    return fallbackUnknown;
  }
}

/** Clear cached capability (e.g. after a 503 from STT). */
export function invalidateVoiceCapabilityCache(): void {
  capabilityCache = null;
}

/**
 * Transcribe a recorded Blob via /api/voice (Sarvam STT).
 * Throws VoiceError with a clear code/message for UI surfaces.
 */
export async function transcribeAudio(blob: Blob, options: TranscribeOptions = {}): Promise<string> {
  if (!blob || blob.size < MIN_BLOB_BYTES) {
    throw new VoiceError(
      'Recording is empty or too short. Hold the mic a moment longer and speak clearly.',
      'AUDIO_TOO_SHORT',
    );
  }

  const base64Audio = await blobToBase64(blob);
  const mimeType = (blob.type || preferredRecordingMimeType() || 'audio/webm').split(';')[0] || 'audio/webm';

  let res: Response;
  try {
    res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'stt',
        audio: base64Audio,
        mimeType,
        language: options.language || 'en-IN',
      }),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new VoiceError('Network error while contacting the voice service.', 'NETWORK');
  }

  const data = await parseVoiceResponse(res) as {
    status?: string;
    text?: string;
    empty?: boolean;
    message?: string;
    error?: string;
    code?: string;
    available?: boolean;
  };

  if (!res.ok) {
    if (res.status === 503 || data.code === 'MISSING_API_KEY') {
      invalidateVoiceCapabilityCache();
      capabilityCache = {
        at: Date.now(),
        value: {
          configured: false,
          available: false,
          features: { stt: false, tts: false, browserTtsFallback: isTTSAvailable() },
          message: data.error,
        },
      };
    }
    throw mapHttpError(res.status, data);
  }

  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) {
    throw new VoiceError(
      data.message || 'No speech detected. Try again closer to the microphone.',
      'EMPTY_TRANSCRIPT',
    );
  }
  return text;
}

/**
 * Request Sarvam TTS audio (base64). Prefer browser `speak()` when possible —
 * this is for screens that want higher-quality server audio.
 */
export async function synthesizeSpeech(text: string, options: SynthesizeOptions = {}): Promise<{ audio: string; format: string }> {
  const plain = stripMarkdown(text);
  if (!plain) {
    throw new VoiceError('Nothing to speak.', 'INVALID_TEXT');
  }

  let res: Response;
  try {
    res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'tts',
        text: plain.slice(0, 6000),
        language: options.language || 'en-IN',
        gender: options.gender || 'female',
      }),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new VoiceError('Network error while contacting the voice service.', 'NETWORK');
  }

  const data = await parseVoiceResponse(res) as {
    status?: string;
    audio?: string;
    format?: string;
    error?: string;
    code?: string;
    available?: boolean;
  };

  if (!res.ok) {
    if (res.status === 503 || data.code === 'MISSING_API_KEY') {
      invalidateVoiceCapabilityCache();
    }
    throw mapHttpError(res.status, data);
  }

  if (typeof data.audio !== 'string' || !data.audio) {
    throw new VoiceError('No audio returned from voice provider.', 'TTS_EMPTY');
  }

  return { audio: data.audio, format: data.format || 'wav' };
}

/** Decode base64 audio and play it; revokes the object URL when finished. */
export async function playBase64Audio(base64: string, format = 'wav'): Promise<void> {
  if (!base64 || typeof base64 !== 'string') {
    throw new VoiceError('No audio to play.', 'TTS_EMPTY');
  }

  let bytes: Uint8Array;
  try {
    const binary = atob(base64.replace(/\s+/g, ''));
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    throw new VoiceError('Could not decode audio response.', 'INVALID_AUDIO');
  }

  if (bytes.length < 32) {
    throw new VoiceError('Audio response was empty.', 'TTS_EMPTY');
  }

  const mime = format === 'mp3' || format === 'mpeg' ? 'audio/mpeg' : 'audio/wav';
  // Copy into a fresh ArrayBuffer — avoids SharedArrayBuffer / SAB-backed views
  // that some browsers reject in BlobPart, and satisfies strict BufferSource typing.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: mime });
  const url = URL.createObjectURL(blob);

  try {
    const audio = new Audio(url);
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
      };
      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new VoiceError('Browser could not play the audio.', 'TTS_EMPTY'));
      };
      void audio.play().catch((err) => {
        cleanup();
        reject(err instanceof Error ? err : new VoiceError('Playback failed.', 'TTS_EMPTY'));
      });
    });
  } finally {
    // Delay revoke slightly so late-buffering engines finish; still deterministic.
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }
}

/**
 * Prefer Sarvam TTS when configured; fall back to browser speechSynthesis.
 * Never throws for missing key — degrades silently to browser TTS.
 */
export async function speakWithBestEffort(text: string, options: SpeakOptions & SynthesizeOptions = {}): Promise<'sarvam' | 'browser' | 'none'> {
  const plain = stripMarkdown(text);
  if (!plain) return 'none';

  try {
    const { audio, format } = await synthesizeSpeech(plain, options);
    await playBase64Audio(audio, format);
    return 'sarvam';
  } catch (err) {
    if (err instanceof VoiceError && (err.code === 'MISSING_API_KEY' || err.status === 503)) {
      // Expected degradation path.
    } else {
      console.warn('[voice] Sarvam TTS failed, falling back to browser:', err);
    }
  }

  if (isTTSAvailable()) {
    speak(plain, options);
    return 'browser';
  }
  return 'none';
}

export function humanizeVoiceError(err: unknown): string {
  if (err instanceof VoiceError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Voice request failed.';
}

// Prime the voice list; some browsers populate it asynchronously.
if (isTTSAvailable()) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
