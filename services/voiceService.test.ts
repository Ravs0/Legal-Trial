import assert from 'node:assert/strict';
import {
  VoiceError,
  blobToBase64,
  humanizeVoiceError,
  invalidateVoiceCapabilityCache,
  isMicSupported,
  isTTSAvailable,
  pickVoice,
  preferredRecordingMimeType,
  probeVoiceAvailability,
  speakWithBestEffort,
  stripMarkdown,
  synthesizeSpeech,
  transcribeAudio,
} from './voiceService';

// ─── DOM shims (Node has no speech / mic APIs) ───────────────────────────────

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const originalFetch = globalThis.fetch;
let fetchImpl: FetchImpl | null = null;
const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

function installFetch() {
  fetchCalls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
    fetchCalls.push({ url, init });
    if (!fetchImpl) throw new Error('fetchImpl not set');
    return fetchImpl(url, init);
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
  fetchImpl = null;
  fetchCalls.length = 0;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Minimal FileReader that returns a data-URL for Blob contents. */
class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: ((ev: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;
  onabort: ((ev: ProgressEvent<FileReader>) => void) | null = null;

  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      const b64 = Buffer.from(binary, 'binary').toString('base64');
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
      this.onloadend?.(null as unknown as ProgressEvent<FileReader>);
    }).catch(() => {
      this.onerror?.(null as unknown as ProgressEvent<FileReader>);
    });
  }
}

(globalThis as any).FileReader = MockFileReader;

function makeAudioBlob(size = 512, type = 'audio/webm'): Blob {
  return new Blob([new Uint8Array(size).fill(1)], { type });
}

function resetVoiceEnv() {
  invalidateVoiceCapabilityCache();
  delete (globalThis as any).window;
  delete (globalThis as any).navigator;
  delete (globalThis as any).MediaRecorder;
  delete (globalThis as any).Audio;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

function testStripMarkdown() {
  assert.equal(stripMarkdown('**bold** and *italic*'), 'bold and italic');
  assert.equal(stripMarkdown('__u__ _em_ `code`'), 'u em code');
  assert.equal(stripMarkdown('## Heading\n\nNext para'), 'Heading. Next para');
  assert.equal(stripMarkdown('[link](https://x.test) text'), 'link text');
  assert.equal(stripMarkdown('  spaced   words  '), 'spaced words');
}

function testVoiceErrorAndHumanize() {
  const err = new VoiceError('Mic blocked', 'MIC_DENIED', 403, false);
  assert.equal(err.name, 'VoiceError');
  assert.equal(err.code, 'MIC_DENIED');
  assert.equal(err.status, 403);
  assert.equal(err.available, false);
  assert.equal(humanizeVoiceError(err), 'Mic blocked');
  assert.equal(humanizeVoiceError(new Error('plain')), 'plain');
  assert.equal(humanizeVoiceError('x'), 'Voice request failed.');
  assert.equal(humanizeVoiceError(null), 'Voice request failed.');
}

function testCapabilityGuardsWithoutBrowserApis() {
  resetVoiceEnv();
  assert.equal(isTTSAvailable(), false);
  assert.equal(isMicSupported(), false);
  assert.equal(preferredRecordingMimeType(), '');
  assert.equal(pickVoice('any'), null);
}

function testPreferredMimeAndMicSupport() {
  resetVoiceEnv();
  (globalThis as any).MediaRecorder = {
    isTypeSupported: (type: string) => type === 'audio/webm',
  };
  assert.equal(preferredRecordingMimeType(), 'audio/webm');

  (globalThis as any).window = {};
  (globalThis as any).navigator = {
    mediaDevices: { getUserMedia: async () => ({}) },
  };
  assert.equal(isMicSupported(), true);

  (globalThis as any).MediaRecorder = {
    isTypeSupported: () => false,
  };
  assert.equal(preferredRecordingMimeType(), '');
}

function testPickVoicePreferenceOrder() {
  resetVoiceEnv();
  const voices = [
    { name: 'Alex', voiceURI: 'alex-uri', lang: 'en-US' },
    { name: 'Priya', voiceURI: 'priya-uri', lang: 'en-IN' },
    { name: 'Hiro', voiceURI: 'hiro-uri', lang: 'ja-JP' },
  ];
  (globalThis as any).window = {
    speechSynthesis: {
      getVoices: () => voices,
      speaking: false,
      cancel: () => {},
      speak: () => {},
    },
  };

  assert.equal(isTTSAvailable(), true);
  assert.equal(pickVoice('priya-uri')?.name, 'Priya');
  assert.equal(pickVoice('Alex')?.name, 'Alex');
  // No preference → en-IN first.
  assert.equal(pickVoice(null)?.name, 'Priya');
  assert.equal(pickVoice('missing')?.name, 'Priya');
}

// ─── blob / STT / TTS network paths ──────────────────────────────────────────

async function testBlobToBase64Guards() {
  await assert.rejects(
    () => blobToBase64(null as unknown as Blob),
    (err: unknown) => err instanceof VoiceError && err.code === 'INVALID_AUDIO',
  );

  await assert.rejects(
    () => blobToBase64(makeAudioBlob(100)),
    (err: unknown) => err instanceof VoiceError && err.code === 'AUDIO_TOO_SHORT',
  );

  await assert.rejects(
    () => blobToBase64(makeAudioBlob(6 * 1024 * 1024 + 1)),
    (err: unknown) => err instanceof VoiceError && err.code === 'INVALID_AUDIO' && /too large/.test(err.message),
  );

  const b64 = await blobToBase64(makeAudioBlob(300, 'audio/webm'));
  assert.ok(typeof b64 === 'string' && b64.length >= 8);
  assert.ok(!b64.startsWith('data:'), 'payload must be raw base64 without data: prefix');
}

async function testProbeVoiceAvailabilityPaths() {
  resetVoiceEnv();
  installFetch();
  invalidateVoiceCapabilityCache();

  // Configured success
  fetchImpl = async () =>
    jsonResponse({
      configured: true,
      available: true,
      features: { stt: true, tts: true, browserTtsFallback: true },
      message: 'ok',
    });
  const ok = await probeVoiceAvailability(true);
  assert.equal(ok.configured, true);
  assert.equal(ok.available, true);
  assert.equal(ok.features.stt, true);
  assert.equal(fetchCalls[0].url, '/api/voice');
  assert.equal(JSON.parse(String(fetchCalls[0].init?.body)).action, 'status');

  // Cache hit (no second fetch)
  const callCount = fetchCalls.length;
  const cached = await probeVoiceAvailability(false);
  assert.equal(cached.available, true);
  assert.equal(fetchCalls.length, callCount, 'TTL cache should skip network');

  // Missing key
  invalidateVoiceCapabilityCache();
  fetchImpl = async () =>
    jsonResponse({ code: 'MISSING_API_KEY', error: 'no key', available: false }, 503);
  const missing = await probeVoiceAvailability(true);
  assert.equal(missing.configured, false);
  assert.equal(missing.available, false);
  assert.equal(missing.features.browserTtsFallback, true);
  assert.match(String(missing.message), /no key|SARVAM|not configured/i);

  // Older server UNKNOWN_ACTION → optimistic
  invalidateVoiceCapabilityCache();
  fetchImpl = async () => jsonResponse({ code: 'UNKNOWN_ACTION', error: 'bad action' }, 400);
  const optimistic = await probeVoiceAvailability(true);
  assert.equal(optimistic.available, true);
  assert.equal(optimistic.probeFailed, true);

  // Network failure → probeFailed unknown
  invalidateVoiceCapabilityCache();
  fetchImpl = async () => {
    throw new TypeError('offline');
  };
  const failed = await probeVoiceAvailability(true);
  assert.equal(failed.probeFailed, true);
  assert.equal(failed.available, false);
  assert.equal(failed.features.browserTtsFallback, isTTSAvailable());

  restoreFetch();
}

async function testTranscribeAudioSuccessAndErrors() {
  resetVoiceEnv();
  installFetch();
  invalidateVoiceCapabilityCache();

  await assert.rejects(
    () => transcribeAudio(makeAudioBlob(10)),
    (err: unknown) => err instanceof VoiceError && err.code === 'AUDIO_TOO_SHORT',
  );

  fetchImpl = async () => jsonResponse({ text: '  Your Honour, I object.  ' });
  const text = await transcribeAudio(makeAudioBlob(400, 'audio/webm;codecs=opus'), { language: 'en-IN' });
  assert.equal(text, 'Your Honour, I object.');
  const body = JSON.parse(String(fetchCalls.at(-1)?.init?.body));
  assert.equal(body.action, 'stt');
  assert.equal(body.mimeType, 'audio/webm');
  assert.equal(body.language, 'en-IN');
  assert.ok(typeof body.audio === 'string' && body.audio.length > 0);

  // Empty transcript
  fetchImpl = async () => jsonResponse({ text: '   ', message: 'silence' });
  await assert.rejects(
    () => transcribeAudio(makeAudioBlob(400)),
    (err: unknown) => err instanceof VoiceError && err.code === 'EMPTY_TRANSCRIPT',
  );

  // Missing API key
  fetchImpl = async () =>
    jsonResponse({ code: 'MISSING_API_KEY', error: 'SARVAM missing', available: false }, 503);
  await assert.rejects(
    () => transcribeAudio(makeAudioBlob(400)),
    (err: unknown) =>
      err instanceof VoiceError
      && err.code === 'MISSING_API_KEY'
      && err.status === 503,
  );

  // Network
  fetchImpl = async () => {
    throw new TypeError('net down');
  };
  await assert.rejects(
    () => transcribeAudio(makeAudioBlob(400)),
    (err: unknown) => err instanceof VoiceError && err.code === 'NETWORK',
  );

  restoreFetch();
}

async function testSynthesizeSpeechSuccessAndErrors() {
  resetVoiceEnv();
  installFetch();
  invalidateVoiceCapabilityCache();

  await assert.rejects(
    () => synthesizeSpeech('   '),
    (err: unknown) => err instanceof VoiceError && err.code === 'INVALID_TEXT',
  );

  // Markdown stripped before send
  fetchImpl = async () => jsonResponse({ audio: 'AAAA', format: 'wav' });
  const out = await synthesizeSpeech('**Hello** court', { gender: 'male', language: 'en-IN' });
  assert.equal(out.audio, 'AAAA');
  assert.equal(out.format, 'wav');
  const body = JSON.parse(String(fetchCalls.at(-1)?.init?.body));
  assert.equal(body.action, 'tts');
  assert.equal(body.text, 'Hello court');
  assert.equal(body.gender, 'male');

  fetchImpl = async () => jsonResponse({ audio: '' });
  await assert.rejects(
    () => synthesizeSpeech('speak please'),
    (err: unknown) => err instanceof VoiceError && err.code === 'TTS_EMPTY',
  );

  fetchImpl = async () => jsonResponse({ code: 'RATE_LIMITED', error: 'slow down' }, 429);
  await assert.rejects(
    () => synthesizeSpeech('speak please'),
    (err: unknown) => err instanceof VoiceError && err.code === 'RATE_LIMITED' && err.status === 429,
  );

  fetchImpl = async () => {
    throw new TypeError('net');
  };
  await assert.rejects(
    () => synthesizeSpeech('speak please'),
    (err: unknown) => err instanceof VoiceError && err.code === 'NETWORK',
  );

  restoreFetch();
}

async function testSpeakWithBestEffortFallback() {
  resetVoiceEnv();
  installFetch();
  invalidateVoiceCapabilityCache();

  assert.equal(await speakWithBestEffort('   '), 'none');

  // Sarvam fails with missing key; no browser TTS → none
  fetchImpl = async () =>
    jsonResponse({ code: 'MISSING_API_KEY', error: 'no key', available: false }, 503);
  assert.equal(await speakWithBestEffort('Hello'), 'none');

  // Browser TTS available → browser path
  const spoken: string[] = [];
  (globalThis as any).window = {
    speechSynthesis: {
      getVoices: () => [{ name: 'Test', voiceURI: 't', lang: 'en-IN' }],
      speaking: false,
      cancel: () => {},
      speak: (utter: { text: string }) => {
        spoken.push(utter.text);
      },
    },
  };
  // SpeechSynthesisUtterance is used by speak()
  (globalThis as any).SpeechSynthesisUtterance = class {
    text: string;
    voice: unknown = null;
    rate = 1;
    pitch = 1;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  };

  fetchImpl = async () =>
    jsonResponse({ code: 'MISSING_API_KEY', error: 'no key', available: false }, 503);
  const mode = await speakWithBestEffort('**Open** court');
  assert.equal(mode, 'browser');
  assert.equal(spoken[0], 'Open court');

  // Sarvam success path via playBase64Audio
  const wavBase64 = Buffer.alloc(64, 1).toString('base64');
  fetchImpl = async () => jsonResponse({ audio: wavBase64, format: 'wav' });
  let played = false;
  (globalThis as any).Audio = class {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play() {
      played = true;
      queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    }
  };
  (globalThis as any).URL = {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {},
  };

  const sarvamMode = await speakWithBestEffort('From the server');
  assert.equal(sarvamMode, 'sarvam');
  assert.equal(played, true);

  restoreFetch();
  resetVoiceEnv();
}

// ─── Run ─────────────────────────────────────────────────────────────────────

testStripMarkdown();
testVoiceErrorAndHumanize();
testCapabilityGuardsWithoutBrowserApis();
testPreferredMimeAndMicSupport();
testPickVoicePreferenceOrder();
await testBlobToBase64Guards();
await testProbeVoiceAvailabilityPaths();
await testTranscribeAudioSuccessAndErrors();
await testSynthesizeSpeechSuccessAndErrors();
await testSpeakWithBestEffortFallback();

console.log('voiceService tests passed');
