import { useMemo, useState } from "react";
import { tag } from "../api/_lib/ner";

export type CiteStatus = "VERIFIED" | "UNVERIFIED-LEAD";
export interface CiteVerdict { status: CiteStatus; quote?: string; url?: string; scores?: Record<string, number>; }
export interface CitationPopoverProps { text: string; verdicts: Record<string, CiteVerdict>; }

type Seg = { body: string; cite?: string; id: number };

const BASE = "cursor-pointer rounded-sm border-b px-0.5 font-serif focus-ring";
const OK = "border-brand-accent bg-brand-accent-muted text-brand-text-primary";
const LEAD = "border-brand-amber bg-brand-bg-tertiary text-brand-text-primary";

function lookup(verdicts: Record<string, CiteVerdict>, cite: string, id: number): CiteVerdict | null {
  return verdicts[cite] ?? verdicts[String(id)] ?? null;
}

export function CitationPopover({ text, verdicts }: CitationPopoverProps) {
  const [active, setActive] = useState<number | null>(null);
  const segs = useMemo<Seg[]>(() => {
    const cites = tag(text).citations;
    const out: Seg[] = [];
    let cur = 0;
    cites.forEach((s, i) => {
      if (s.start < cur) return;
      if (s.start > cur) out.push({ body: text.slice(cur, s.start), id: -out.length - 1 });
      out.push({ body: s.text, cite: s.text, id: i });
      cur = s.end;
    });
    if (cur < text.length) out.push({ body: text.slice(cur), id: -999 });
    return out;
  }, [text]);
  const close = () => setActive(null);
  return (
    <p className="font-serif text-sm leading-relaxed text-brand-text-primary">
      {segs.map((s) => {
        if (!s.cite) return <span key={s.id}>{s.body}</span>;
        const v = lookup(verdicts, s.cite, s.id);
        const verified = v?.status === "VERIFIED";
        const open = active === s.id;
        return (
          <span key={s.id} className="relative inline-block"
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) close(); }}
            onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
            <button type="button" aria-expanded={open} aria-label={`Citation ${s.cite}, ${v?.status ?? "pending check"}`}
              className={`${BASE} ${verified ? OK : LEAD}`}
              onMouseEnter={() => setActive(s.id)} onMouseLeave={close}
              onFocus={() => setActive(s.id)} onClick={() => setActive(open ? null : s.id)}>
              {s.body}
            </button>
            {open && (
              <span role="dialog" aria-label={verified ? "Verified citation" : "Unverified lead"}
                className="absolute left-0 top-full z-10 mt-1 w-64 rounded border border-brand-border bg-brand-bg-secondary p-3 text-left shadow-glow-accent">
                <span className={`font-mono text-[11px] tracking-wide ${verified ? "text-brand-success" : "text-brand-amber"}`}>
                  {verified ? "VERIFIED" : "UNVERIFIED-LEAD"}
                </span>
                {!verified && (
                  <span className="mt-1 block text-xs text-brand-text-secondary">Lead only. Check source before use. No export.</span>
                )}
                {v?.quote && <span className="mt-2 block text-xs italic leading-relaxed text-brand-text-primary">{v.quote}</span>}
                {verified && v?.url && (
                  <a href={v.url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-sans text-xs text-brand-accent underline">Source</a>
                )}
                {v?.scores && (
                  <span className="mt-2 block font-mono text-[11px] tabular-nums text-brand-text-secondary">
                    {Object.entries(v.scores).map(([k, n]) => `${k} ${Number(n).toFixed(2)}`).join("  ")}
                  </span>
                )}
              </span>
            )}
          </span>
        );
      })}
    </p>
  );
}

export default CitationPopover;
