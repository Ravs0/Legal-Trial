// Browser-native Text-to-Speech for the LexForge courtroom.
// Uses the Web Speech API (window.speechSynthesis) — no API key required.
// Indian-law friendly: prefers an en-IN voice when the browser provides one.

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

export function isTTSAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
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

  synth.speak(utter);
}

export function cancelSpeech(): void {
  if (!isTTSAvailable()) return;
  window.speechSynthesis.cancel();
}

// Prime the voice list; some browsers populate it asynchronously.
if (isTTSAvailable()) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
