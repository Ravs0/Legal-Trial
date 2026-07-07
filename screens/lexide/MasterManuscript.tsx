import React, { useRef } from 'react';
import { FileText, Upload, Loader2 } from 'lucide-react';

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
}

export const MasterManuscript: React.FC<MasterManuscriptProps> = ({
  fullContent, setFullContent, sections, onDeleteSection,
  onSmartSplit, isProcessing, selectionRange, textareaRef,
  onSelectionChange, onCreateSection,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset so same file can be uploaded again
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
      // For PDF/DOCX: read as text with basic extraction
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        // Strip null bytes and try to extract printable text
        const clean = text.replace(/\0/g, '').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
        setFullContent(clean || '[Could not extract text from ' + file.name + '. Try pasting the content manually.]');
      };
      reader.readAsBinaryString(file);
    } else {
      setFullContent('[Unsupported file format: .' + ext + '. Please paste the content manually.]');
    }
  };
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0e]">
      <header className="h-16 border-b border-brand-border flex items-center justify-between px-10">
        <div className="flex items-center gap-4">
          <FileText size={20} className="text-brand-accent" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-brand-text-secondary">Master Manuscript</h2>
          <div className="h-4 w-px bg-brand-border mx-2" />
          <span className="text-[10px] text-brand-text-secondary/60 font-bold uppercase tracking-widest">
            <span className="text-green-500/50">●</span> Auto-saved
          </span>
        </div>
        <div className="flex items-center gap-3">
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
            className="px-4 py-2 bg-brand-bg-secondary hover:bg-brand-text-primary/10 text-brand-text-primary text-xs font-bold rounded-xl border border-brand-border transition-all flex items-center gap-2"
          >
            <Upload size={14} /> UPLOAD
          </button>
          <button
            onClick={onSmartSplit}
            disabled={isProcessing || !fullContent.trim()}
            className="px-6 py-2 bg-brand-accent hover:opacity-90 text-brand-bg-dark text-xs font-bold rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isProcessing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            )}
            AI SMART SPLIT
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-12 custom-scrollbar relative">
        <div className="max-w-4xl mx-auto h-full flex flex-col">
          <div className="flex-1 bg-brand-bg-dark-secondary rounded-2xl border border-brand-border/50 p-10 shadow-2xl relative">
            <textarea
              ref={textareaRef}
              value={fullContent}
              onSelect={() => {
                const el = textareaRef.current;
                if (!el) return;
                const { selectionStart, selectionEnd } = el;
                if (selectionStart !== selectionEnd) onSelectionChange({ start: selectionStart, end: selectionEnd });
                else onSelectionChange(null);
              }}
              onChange={(e) => setFullContent(e.target.value)}
              placeholder="PASTE YOUR LEGAL DOCUMENT HERE..."
              className="w-full h-full bg-transparent text-brand-text-primary leading-relaxed text-lg focus:outline-none resize-none"
            />
            {selectionRange && (
              <button onClick={onCreateSection} className="absolute top-6 right-6 bg-brand-accent text-brand-bg-dark px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-2xl hover:opacity-90 transition-opacity">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
                CREATE SECTION
              </button>
            )}
          </div>
        </div>
      </main>
      <footer className="h-10 bg-brand-bg-dark-secondary border-t border-brand-border flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-8 text-[9px] text-brand-text-secondary uppercase font-bold tracking-[0.2em]">
          <div className="flex items-center gap-2 text-brand-text-secondary/60">{sections.length} PARTS</div>
          <div className="flex items-center gap-2 text-brand-text-secondary/60">
            {fullContent.split(/\s+/).filter(x => x.length > 0).length} WORDS
          </div>
          <div className="text-brand-accent/60 font-mono">STATUS::STABLE</div>
        </div>
        <div className="flex gap-2">
          {sections.map((sec, i) => (
            <div key={sec.id} className="group flex items-center gap-2 px-3 py-1 bg-brand-bg-dark border border-brand-border rounded-lg">
              <span className="text-[9px] text-brand-text-secondary/60 font-mono">{String(i+1).padStart(2, '0')}</span>
              <span className="text-[10px] text-brand-text-primary/80 truncate max-w-[80px]">{sec.title}</span>
              <button onClick={() => onDeleteSection(sec.id)} className="text-brand-text-secondary/30 hover:text-brand-error transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
};
