// YAML stub: voicePrivacy: { stt: local-whisper|sarvam|local, tts: cloned|stock, consent_required: true }
// routes: local_only||confidential_moot -> local-whisper; else pref.stt (default local); no-consent -> stock
export type SttChoice = "local-whisper" | "local" | "sarvam";
export type VoiceMsg = { confidential_moot?: boolean; text?: string };
export type VoicePref = { stt?: "local" | "sarvam" };
export type ConsentEntry = {
  user: string;
  voice_id: string;
  scope: string;
  granted: boolean;
  revoked: boolean;
};
export const STOCK_VOICE = "stock";
export function routeStt(
  msg: VoiceMsg,
  opts: { local_only?: boolean; pref?: VoicePref } = {},
): SttChoice {
  if (opts.local_only || msg.confidential_moot) return "local-whisper";
  return opts.pref?.stt ?? "local";
}
export function requireConsent(
  ledger: ConsentEntry[],
  user: string,
  voice_id: string,
  scope: string,
): boolean {
  const e = ledger.find(
    (c) => c.user === user && c.voice_id === voice_id && c.scope === scope,
  );
  return !!e && e.granted && !e.revoked;
}
export function grantConsent(
  ledger: ConsentEntry[],
  entry: Omit<ConsentEntry, "granted" | "revoked">,
): ConsentEntry[] {
  return [...ledger.filter((c) => !(c.user === entry.user && c.voice_id === entry.voice_id && c.scope === entry.scope)), { ...entry, granted: true, revoked: false }];
}
export function resolveVoice(
  ledger: ConsentEntry[],
  user: string,
  voice_id: string,
  scope: string,
): string {
  return requireConsent(ledger, user, voice_id, scope) ? voice_id : STOCK_VOICE;
}
