// utils/citeHighlight.tsx — renderer sketch: highlights tag() spans inside a passage.
// Sketch: styling via Tailwind (swap CLS as needed); point the import at the spaCy
// client later — the segment-splitting logic below stays the same.
import { useMemo } from "react";
import { tag, type Span } from "../api/_lib/ner";

const CLS: Record<string, string> = { citations: "bg-amber-200", statutes: "bg-sky-200", courts: "bg-violet-200", judges: "bg-emerald-200" };
type Seg = { text: string; cat?: string; key: number };

export function CiteHighlight({ text }: { text: string }) {
  const segs = useMemo<Seg[]>(() => {
    const t = tag(text);
    const all = (Object.keys(t) as (keyof typeof t)[]).flatMap((cat) => t[cat].map((s: Span) => ({ ...s, cat })));
    all.sort((a, b) => a.start - b.start || b.end - a.end);
    const out: Seg[] = [];
    let cur = 0;
    for (const s of all) {
      if (s.start < cur) continue; // overlapped by an earlier span
      if (s.start > cur) out.push({ text: text.slice(cur, s.start), key: out.length });
      out.push({ text: s.text, cat: s.cat, key: out.length });
      cur = s.end;
    }
    if (cur < text.length) out.push({ text: text.slice(cur), key: out.length });
    return out;
  }, [text]);
  return (<p>{segs.map((s) => (s.cat ? <mark key={s.key} className={CLS[s.cat]} title={s.cat}>{s.text}</mark> : <span key={s.key}>{s.text}</span>))}</p>);
}
