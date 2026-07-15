import React, { useRef } from 'react';
import { FileText, Upload, Loader2 } from 'lucide-react';
import { RoomBanner } from '../../components/RoomChrome';
import { PatternPanel, SurfacePattern } from '../../components/SurfacePattern';
import libraryBooks from '../../assets/library_books.jpg';

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
}

export const MasterManuscript: React.FC<MasterManuscriptProps> = ({
  fullContent, setFullContent, sections, onDeleteSection,
  onSmartSplit, isProcessing, selectionRange, textareaRef,
  onSelectionChange, onCreateSection, hasAiConsent, setHasAiConsent,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      };
      reader.readAsText(file);
    } else if (docExts.includes(ext || '')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const clean = text.replace(/\0/g, '').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
        setFullContent(clean || '[Could not extract text from ' + file.name + '. Try pasting the content manually.]');
      };
      reader.readAsBinaryString(file);
    } else {
      setFullContent('[Unsupported file format: .' + ext + '. Please paste the content manually.]');
    }
  };

  return (
    <div className="relative z-10 flex-1 min-h-0 flex flex-col min-w-0 bg-brand-bg-primary overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-brand-border flex-shrink-0 space-y-3">
        <RoomBanner
          image={libraryBooks}
          dense
          eyebrow="Research · LexIDE"
          title="Master manuscript"
          subtitle="Paste or upload a paper, split into sections, then open the workspace."
          trailing={
            <span className="text-[11px] text-white/55 tabular-nums border border-white/15 rounded-md px-2 py-1">
              {sections.length} sections
            </span>
          }
        />
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-[11px] leading-relaxed text-brand-text-secondary">
          Do not paste or upload confidential, privileged, or client-identifying material. Files stay in this browser until you run an AI feature; AI features send the selected content to the configured service.
        </div>
        <label className="flex items-start gap-2.5 text-[11px] leading-relaxed text-brand-text-secondary">
          <input type="checkbox" checked={hasAiConsent} onChange={(event) => setHasAiConsent(event.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-accent" />
          <span>I confirm this material is appropriate to process with the configured AI service.</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf,.docx,.csv,.json"
            onChange={handleFileUpload}
            className="hidden"
            aria-label="Upload legal document"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!hasAiConsent}
            className="min-h-10 px-3 py-2 bg-brand-bg-secondary hover:bg-white/[0.04] text-brand-text-primary text-[12px] rounded-lg border border-brand-border transition-colors disabled:cursor-not-allowed disabled:opacity-40 flex items-center gap-2"
          >
            <Upload size={14} /> Upload
          </button>
          <button
            onClick={onSmartSplit}
            disabled={isProcessing || !fullContent.trim() || !hasAiConsent}
            className="min-h-10 px-3 py-2 bg-white text-black text-[12px] font-medium rounded-lg disabled:opacity-40 flex items-center gap-2"
          >
            {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Smart split
          </button>
          {selectionRange && selectionRange.end > selectionRange.start && (
            <button
              onClick={onCreateSection}
              className="px-3 py-2 border border-brand-border text-[12px] text-brand-text-primary rounded-lg hover:bg-white/[0.04]"
            >
              Create section from selection
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 relative">
          <SurfacePattern variant="lines" className="opacity-40" />
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
            className="relative z-10 flex-1 w-full resize-none bg-transparent p-4 sm:p-6 text-[13px] sm:text-[14px] leading-relaxed text-brand-text-primary placeholder:text-brand-text-secondary/40 focus:outline-none custom-scrollbar font-mono"
          />
        </div>

        <aside className="hidden md:flex w-64 border-l border-brand-border flex-col bg-brand-bg-secondary">
          <div className="p-3 border-b border-brand-border">
            <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary">Sections</p>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {sections.length === 0 ? (
              <PatternPanel pattern="dots" className="p-4 m-1">
                <p className="text-[12px] text-brand-text-secondary leading-relaxed">
                  No sections yet. Use Smart split or select text and create a section.
                </p>
              </PatternPanel>
            ) : (
              sections.map((s) => (
                <div
                  key={s.id}
                  className="group flex items-start justify-between gap-2 p-2.5 rounded-lg border border-brand-border bg-brand-bg-primary hover:border-white/20"
                >
                  <span className="text-[12px] text-brand-text-primary leading-snug line-clamp-2">{s.title}</span>
                  <button
                    type="button"
                    onClick={() => onDeleteSection(s.id)}
                    className="text-[11px] text-brand-text-secondary opacity-0 group-hover:opacity-100 hover:text-brand-text-primary flex-shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
