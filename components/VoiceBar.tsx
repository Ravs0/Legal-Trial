import { useEffect, useState } from "react";
import { grantConsent, requireConsent, resolveVoice, routeStt, STOCK_VOICE, type ConsentEntry } from "../services/voicePrivacy";
import { isMicSupported, probeVoiceAvailability, type VoiceCapability } from "../services/voiceService";

interface VoiceBarProps {
  confidential?: boolean;
}

export function VoiceBar({ confidential = false }: VoiceBarProps) {
  const [localOnly, setLocalOnly] = useState(confidential);
  const [ledger, setLedger] = useState<ConsentEntry[]>([]);
  const [cap, setCap] = useState<VoiceCapability | null>(null);
  const micSupported = isMicSupported();

  useEffect(() => {
    if (!micSupported) return;
    let live = true;
    probeVoiceAvailability().then((c) => { if (live) setCap(c); }).catch(() => {});
    return () => { live = false; };
  }, [micSupported]);

  useEffect(() => {
    if (confidential) setLocalOnly(true);
  }, [confidential]);

  const stt = routeStt({ confidential_moot: confidential }, { local_only: localOnly });
  const isLocal = stt !== "sarvam";
  const granted = requireConsent(ledger, "user", "mic-voice", "stt");
  const voice = resolveVoice(ledger, "user", "mic-voice", "stt");
  const probedDown = !!cap && !cap.available && !cap.probeFailed;
  const unavailable = !micSupported || probedDown;
  const blockMsg = !micSupported
    ? "Mic unavailable in this browser. Please type instead."
    : probedDown
      ? cap?.message || "Cloud voice is unavailable. Local path or typing still works."
      : "";
  const grant = () => setLedger((p) => grantConsent(p, { user: "user", voice_id: "mic-voice", scope: "stt" }));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-brand-border bg-brand-bg-secondary px-3 py-2">
      <span
        title={isLocal ? "Speech stays on this device" : "Audio may leave this device"}
        className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${isLocal ? "border-brand-border bg-brand-bg-tertiary text-brand-text-primary" : "border-brand-amber/40 bg-brand-bg-tertiary text-brand-amber"}`}
      >
        {isLocal ? "Local Whisper" : "Cloud STT"}
      </span>
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-brand-text-secondary">
        <input type="checkbox" checked={localOnly} onChange={(e) => setLocalOnly(e.target.checked)} className="h-3.5 w-3.5 accent-[#1c1914]" />
        Local only
      </label>
      <span className="text-[12px] text-brand-text-secondary">
        {granted ? `Consent granted (${voice})` : `Consent needed, using ${STOCK_VOICE}`}
      </span>
      {!granted && (
        <button type="button" onClick={grant} className="rounded-sm border border-brand-border px-2 py-1 text-[12px] text-brand-text-primary hover:bg-brand-text-primary/[0.05]">
          Allow voice
        </button>
      )}
      <button
        type="button"
        disabled={unavailable}
        aria-disabled={unavailable}
        title={unavailable ? blockMsg : "Start voice input"}
        className="rounded-sm border border-brand-text-primary bg-brand-text-primary px-3 py-1 text-[12px] font-medium text-brand-bg-primary disabled:cursor-not-allowed disabled:opacity-45"
      >
        Mic
      </button>
      {unavailable && (
        <p role="status" className="w-full text-[12px] text-brand-error">{blockMsg}</p>
      )}
    </div>
  );
}
