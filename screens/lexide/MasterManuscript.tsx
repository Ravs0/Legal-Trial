import React, { useMemo, useRef, useState } from 'react';
import { FileText, Upload, Loader2, CheckCircle2 } from 'lucide-react';
import { PatternPanel, SurfacePattern } from '../../components/SurfacePattern';

interface MasterManuscriptProps {
  fullContent: string;
  setFullContent: (val: string) => void;
  sections: { id: string; title: string }[];
  onDeleteSection: (id: string) => void;
  onSmartSplit: () => void;
  isProcessing: boolean;
  selectionRange: { start: number; end: number } | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onSelectionChange: (range: { start: number; end: number } | null) => void;
  onCreateSection: () => void;
  hasAiConsent: boolean;
  setHasAiConsent: (value: boolean) => void;
  /** Optional autosave indicator from parent. */
  saveState?: 'idle' | 'dirty' | 'saving' | 'saved';
}

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

export const MasterManuscript: React.FC<MasterManuscriptProps> = ({
  fullContent,
  setFullContent,
  sections,
  onDeleteSection,
  onSmartSplit,
  isProcessing,
  selectionRange,
  textareaRef,
  onSelectionChange,
  onCreateSection,
  hasAiConsent,
  setHasAiConsent,
  saveState = 'idle',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const isEmpty = !fullContent.trim();
  const words = useMemo(() => countWords(fullContent), [fullContent]);
  const chars = fullContent.length;
  const selectionLen =
    selectionRange && selectionRange.end > selectionRange.start
      ? selectionRange.end - selectionRange.start
      : 0;

  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'dirty'
        ? 'Unsaved'
        : saveState === 'saved'
          ? 'Saved locally'
          : 'Local draft';

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';

    const ext = file.name.split('.').pop()?.toLowerCase();
    const textExts = ['txt', 'md', 'csv', 'json', 'xml', 'html'];
    const docExts = ['pdf', 'docx'];

    if (textExts.includes(ext || '')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setFullContent(text);
        setUploadNotice(`Loaded ${file.name} (${countWords(text)} words).`);
        window.setTimeout(() => setUploadNotice(null), 3500);
      };
      reader.onerror = () => {
        setUploadNotice(`Could not read ${file.name}. Paste the text instead.`);
        window.setTimeout(() => setUploadNotice(null), 4000);
      };
      reader.readAsText(file);
    } else if (docExts.includes(ext || '')) {
      // No real PDF/DOCX parser in-browser: refuse to dump binary garbage into the editor.
      setUploadNotice(
        `.${ext} upload is not fully supported yet. Export as .txt/.md or paste the text manually.`,
      );
      window.setTimeout(() => setUploadNotice(null), 5000);
    } else {
      setUploadNotice(`Unsupported format: .${ext || '?'}. Use .txt, .md, or paste.`);
      window.setTimeout(() => setUploadNotice(null), 4000);
    }
  };

  return (
    <div className="relative z-10 flex-1 min-h-0 flex flex-col min-w-0 bg-brand-bg-primary overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-brand-border flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-2xl text-brand-text-primary">Your manuscript</h2>
          <span className="text-xs text-brand-text-secondary" role="status">{saveLabel} · {sections.length} sections</span>
        </div>
        <label className="flex items-start gap-2.5 text-[11px] leading-relaxed text-brand-text-secondary">
          <input
            type="checkbox"
            checked={hasAiConsent}
            onChange={(event) => setHasAiConsent(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-brand-border bg-brand-bg-primary accent-brand-text-primary"
          />
          <span>I confirm this material is appropriate to process with the configured AI service.</span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.csv,.json,.xml,.html,.pdf,.docx"
            onChange={handleFileUpload}
            className="hidden"
            aria-label="Upload legal document"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!hasAiConsent}
            className="min-h-10 px-3 py-2 bg-brand-bg-secondary hover:bg-[#1c1914]/[0.05] text-brand-text-primary text-[12px] rounded-lg border border-brand-border transition-colors disabled:cursor-not-allowed disabled:opacity-40 flex items-center gap-2"
          >
            <Upload size={14} aria-hidden /> Upload
          </button>
          <button
            type="button"
            onClick={onSmartSplit}
            disabled={isProcessing || !fullContent.trim() || !hasAiConsent}
            className="min-h-10 px-3 py-2 bg-brand-text-primary text-brand-bg-primary text-[12px] font-medium rounded-lg disabled:opacity-40 flex items-center gap-2"
          >
            {isProcessing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FileText size={14} aria-hidden />}
            Smart split
          </button>
          {selectionLen > 0 && (
            <button
              type="button"
              onClick={onCreateSection}
              className="min-h-10 px-3 py-2 border border-brand-border text-[12px] text-brand-text-primary rounded-lg hover:bg-[#1c1914]/[0.05] flex items-center gap-2"
            >
              Create section
              <span className="text-[11px] text-brand-text-secondary tabular-nums">
                {selectionLen} chars
              </span>
            </button>
          )}
          <div className="ml-auto hidden sm:flex items-center gap-3 text-[11px] text-brand-text-secondary tabular-nums">
            <span>{words} words</span>
            <span className="text-brand-text-secondary/50">{chars} chars</span>
          </div>
        </div>

        {uploadNotice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-brand-border bg-brand-bg-secondary px-3 py-2 text-[11px] text-brand-text-secondary leading-relaxed"
          >
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-brand-text-primary/70" aria-hidden />
            <span>{uploadNotice}</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 relative">
          <SurfacePattern variant="lines" className="opacity-40" />
          {isEmpty && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
              <PatternPanel pattern="dots" className="max-w-md w-full p-5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-brand-text-secondary mb-2">Empty manuscript</p>
                <p className="text-[13px] text-brand-text-secondary leading-relaxed">
                  Paste a judgment extract or research draft, or upload a .txt / .md file. Then run Smart split or
                  select a passage to create a section.
                </p>
                <ol className="mt-3 space-y-1.5 text-[11px] text-brand-text-secondary/80 list-decimal list-inside">
                  <li>Confirm AI consent if you will use Smart split</li>
                  <li>Paste or upload plain text</li>
                  <li>Open Workspace to edit your sections</li>
                </ol>
              </PatternPanel>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={fullContent}
            onChange={(e) => setFullContent(e.target.value)}
            onSelect={(e) => {
              const t = e.currentTarget;
              if (t.selectionStart !== t.selectionEnd) {
                onSelectionChange({ start: t.selectionStart, end: t.selectionEnd });
              } else {
                onSelectionChange(null);
              }
            }}
            placeholder="Paste your legal paper, judgment extract, or research draft here…"
            aria-label="Master manuscript body"
            className="relative z-10 flex-1 w-full resize-none bg-transparent p-4 sm:p-6 text-[13px] sm:text-[14px] leading-relaxed text-brand-text-primary placeholder:text-brand-text-secondary/40 focus:outline-none custom-scrollbar font-serif"
          />
          <div className="relative z-10 border-t border-brand-border bg-brand-bg-secondary/90 px-4 py-1.5 flex items-center justify-between gap-3 text-[11px] uppercase tracking-wider text-brand-text-secondary sm:hidden">
            <span className="tabular-nums">
              {words} words · {chars} chars
            </span>
            <span>{saveLabel}</span>
          </div>
        </div>

        <aside className="hidden md:flex w-64 border-l border-brand-border flex-col bg-brand-bg-secondary">
          <div className="p-3 border-b border-brand-border flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary">Sections</p>
            <span className="text-[11px] text-brand-text-secondary/60 tabular-nums">{sections.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {sections.length === 0 ? (
              <PatternPanel pattern="dots" className="p-4 m-1">
                <p className="text-[12px] text-brand-text-secondary leading-relaxed">
                  No sections yet. Use Smart split, or select text and create a section.
                </p>
              </PatternPanel>
            ) : (
              sections.map((s, idx) => (
                <div
                  key={s.id}
                  className="group flex items-start justify-between gap-2 p-2.5 rounded-lg border border-brand-border bg-brand-bg-primary hover:border-brand-border"
                >
                  <div className="min-w-0">
                    <span className="text-[11px] text-brand-text-secondary/50 font-mono tabular-nums">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="block text-[12px] text-brand-text-primary leading-snug line-clamp-2 mt-0.5">
                      {s.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteSection(s.id)}
                    className="text-[11px] text-brand-text-secondary opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-brand-text-primary flex-shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
          {sections.length > 0 && (
            <div className="p-3 border-t border-brand-border text-[11px] text-brand-text-secondary/70 leading-relaxed">
              Open the Workspace tab to edit sections side by side.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
