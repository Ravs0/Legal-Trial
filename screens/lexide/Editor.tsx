import React, { useMemo, useRef, useState } from 'react';
import type { LexIDESection, LexIDEFootnote } from '../../types';

export type EditorSaveState = 'idle' | 'dirty' | 'saving' | 'saved';

interface EditorProps {
  section: LexIDESection;
  onUpdate: (content: string) => void;
  onAddFootnote: (cursorPos: number) => void;
  onResearchSelection: (text: string) => void;
  footnotes: LexIDEFootnote[];
  /** Optional autosave indicator from parent localStorage debounce. */
  saveState?: EditorSaveState;
  saveLabel?: string;
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

export const Editor: React.FC<EditorProps> = ({
  section,
  onUpdate,
  onAddFootnote,
  onResearchSelection,
  footnotes,
  saveState = 'idle',
  saveLabel,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showFootnoteList, setShowFootnoteList] = useState(false);
  const [selectionHint, setSelectionHint] = useState<string | null>(null);
  const sectionFootnotes = footnotes.filter((f) => f.sectionId === section.id);
  const isEmpty = !section.content.trim();
  const words = useMemo(() => wordCount(section.content), [section.content]);
  const chars = section.content.length;

  const handleSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    const selected = el.value.substring(el.selectionStart, el.selectionEnd).trim();
    if (!selected) {
      setSelectionHint('Select text in the draft, then press Research.');
      window.setTimeout(() => setSelectionHint(null), 2200);
      return;
    }
    onResearchSelection(selected);
    setSelectionHint('Sent selection to research panel.');
    window.setTimeout(() => setSelectionHint(null), 2200);
  };

  const saveStatusText =
    saveLabel ||
    (saveState === 'saving'
      ? 'Saving…'
      : saveState === 'dirty'
        ? 'Unsaved'
        : saveState === 'saved'
          ? 'Saved'
          : 'Local draft');

  return (
    <div className="flex flex-col h-full bg-brand-bg-primary relative group">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 bg-brand-bg-secondary border-b border-brand-border sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md bg-white/[0.04] flex items-center justify-center border border-brand-border shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-text-secondary" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
            </svg>
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-brand-text-primary tracking-wide leading-none block truncate">
              {section.title}
            </span>
            <span className="text-[10px] text-brand-text-secondary/70 font-mono mt-1 block uppercase tracking-wider">
              Section pane
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            role="status"
            className={`hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider tabular-nums px-2 py-1 rounded-md border ${
              saveState === 'dirty'
                ? 'border-white/25 text-brand-text-primary bg-white/[0.04]'
                : saveState === 'saving'
                  ? 'border-brand-border text-brand-text-secondary bg-brand-bg-primary'
                  : 'border-brand-border text-brand-text-secondary/80 bg-brand-bg-primary'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                saveState === 'dirty'
                  ? 'bg-white'
                  : saveState === 'saving'
                    ? 'bg-white/50 animate-pulse'
                    : 'bg-white/30'
              }`}
              aria-hidden
            />
            {saveStatusText}
          </span>

          <div className="flex items-center gap-0.5 bg-brand-bg-primary p-0.5 rounded-md border border-brand-border">
            <button
              type="button"
              onClick={handleSelection}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-brand-text-secondary hover:text-brand-text-primary hover:bg-white/[0.04] rounded transition-colors uppercase tracking-wide"
              title="Send selected text to research"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              Research
            </button>
            <div className="w-px h-3 bg-brand-border mx-0.5" aria-hidden />
            <button
              type="button"
              onClick={() => setShowFootnoteList(!showFootnoteList)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] rounded transition-colors uppercase tracking-wide ${
                showFootnoteList
                  ? 'bg-white text-black'
                  : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-white/[0.04]'
              }`}
              aria-expanded={showFootnoteList}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8.5L2 8.5V20a2 2 0 0 0 2 2z" />
                <path d="M14 2v6h6" />
              </svg>
              Citations ({sectionFootnotes.length})
            </button>
            <div className="w-px h-3 bg-brand-border mx-0.5" aria-hidden />
            <button
              type="button"
              onClick={() => onAddFootnote(textareaRef.current?.selectionStart || 0)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-brand-text-primary hover:bg-white/[0.06] rounded transition-colors font-medium uppercase tracking-wide"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              Footnote
            </button>
          </div>
        </div>
      </div>

      {selectionHint && (
        <div
          role="status"
          className="px-4 sm:px-5 py-1.5 border-b border-brand-border bg-white/[0.03] text-[10px] text-brand-text-secondary tracking-wide"
        >
          {selectionHint}
        </div>
      )}

      <div className="relative flex-1 flex flex-col overflow-hidden bg-brand-bg-primary">
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-20 sm:pt-24 px-8">
            <div className="max-w-md w-full rounded-lg border border-brand-border bg-brand-bg-secondary/90 p-5 text-center">
              <p className="text-[11px] uppercase tracking-[0.18em] text-brand-text-secondary mb-2">Empty section</p>
              <p className="text-[13px] text-brand-text-secondary/90 leading-relaxed">
                Draft this section here. Select a phrase and use Research to pull sources, or add a footnote at the cursor.
              </p>
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={section.content}
          onChange={(e) => onUpdate(e.target.value)}
          placeholder={`Begin drafting ${section.title.toLowerCase()}…`}
          aria-label={`Editor for ${section.title}`}
          className="relative z-0 flex-1 w-full bg-transparent p-8 sm:p-12 text-brand-text-primary leading-[1.85] focus:outline-none resize-none text-[15px] custom-scrollbar overflow-y-auto pb-28 selection:bg-white/20"
        />

        {showFootnoteList && (
          <div className="absolute bottom-0 left-0 right-0 bg-brand-bg-secondary border-t border-brand-border p-5 sm:p-6 max-h-[42%] overflow-y-auto z-40 custom-scrollbar">
            <div className="flex items-center justify-between mb-4 border-b border-brand-border pb-3">
              <div className="flex items-center gap-2.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-text-secondary" aria-hidden>
                  <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8.5L2 8.5V20a2 2 0 0 0 2 2z" />
                </svg>
                <h4 className="text-[11px] font-medium text-brand-text-primary uppercase tracking-[0.16em]">
                  Footnote inspector
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowFootnoteList(false)}
                aria-label="Close footnote inspector"
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/[0.06] transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-text-secondary" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {sectionFootnotes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-brand-border px-4 py-8 text-center">
                <p className="text-[11px] uppercase tracking-wider text-brand-text-secondary mb-1">No citations yet</p>
                <p className="text-[12px] text-brand-text-secondary/70 leading-relaxed max-w-sm mx-auto">
                  Place the cursor, press Footnote, or cite a source from the research panel.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sectionFootnotes.map((f) => (
                  <div
                    key={f.id}
                    className="text-[12px] text-brand-text-secondary p-3 bg-brand-bg-primary border border-brand-border rounded-lg flex gap-4 leading-relaxed hover:border-white/20 transition-colors"
                  >
                    <span className="text-brand-text-primary font-mono font-medium shrink-0">[{f.index}]</span>
                    <span className="text-brand-text-secondary/90">{f.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-brand-border/80 bg-brand-bg-secondary/95 backdrop-blur-sm px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-wider text-brand-text-secondary">
          <div className="flex items-center gap-4 tabular-nums">
            <span>{words} words</span>
            <span className="text-brand-text-secondary/50">{chars} chars</span>
            <span className="sm:hidden">{saveStatusText}</span>
          </div>
          <span className="truncate max-w-[40%] text-right text-brand-text-secondary/60 normal-case tracking-normal">
            {isEmpty ? 'Start typing to draft' : 'Autosaves to this browser'}
          </span>
        </div>
      </div>
    </div>
  );
};
