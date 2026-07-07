import React, { useRef, useState } from 'react';
import type { LexIDESection, LexIDEFootnote } from '../../types';

interface EditorProps {
  section: LexIDESection;
  onUpdate: (content: string) => void;
  onAddFootnote: (cursorPos: number) => void;
  onResearchSelection: (text: string) => void;
  footnotes: LexIDEFootnote[];
}

export const Editor: React.FC<EditorProps> = ({
  section, onUpdate, onAddFootnote, onResearchSelection, footnotes,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showFootnoteList, setShowFootnoteList] = useState(false);
  const sectionFootnotes = footnotes.filter(f => f.sectionId === section.id);

  const handleSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    const selected = el.value.substring(el.selectionStart, el.selectionEnd);
    if (selected.trim().length > 0) onResearchSelection(selected);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0e] relative group">
      <div className="flex items-center justify-between px-6 py-3 bg-brand-bg-dark-secondary border-b border-brand-border/50 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-accent/10 flex items-center justify-center border border-brand-accent/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-accent"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
          </div>
          <div>
            <span className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-widest leading-none block">{section.title}</span>
            <span className="text-[8px] text-brand-text-secondary/40 font-mono mt-1 block uppercase">Active Pane</span>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-brand-bg-dark p-1 rounded-lg border border-brand-border">
          <button onClick={handleSelection} className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-text-primary/10 rounded transition-all uppercase font-bold tracking-tighter">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            SEARCH
          </button>
          <div className="w-px h-3 bg-brand-border mx-1" />
          <button onClick={() => setShowFootnoteList(!showFootnoteList)} className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] rounded transition-all uppercase font-bold tracking-tighter ${showFootnoteList ? 'text-brand-accent bg-brand-accent/10' : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-text-primary/10'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8.5L2 8.5V20a2 2 0 0 0 2 2z"/><path d="M14 2v6h6"/></svg>
            CITATIONS ({sectionFootnotes.length})
          </button>
          <div className="w-px h-3 bg-brand-border mx-1" />
          <button onClick={() => onAddFootnote(textareaRef.current?.selectionStart || 0)} className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] text-brand-accent hover:text-brand-accent/80 hover:bg-brand-accent/5 rounded transition-all font-bold uppercase tracking-tighter">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            FOOTNOTE
          </button>
        </div>
      </div>

      <div className="relative flex-1 flex flex-col overflow-hidden bg-brand-bg-dark/20">
        <textarea
          ref={textareaRef}
          value={section.content}
          onChange={(e) => onUpdate(e.target.value)}
          placeholder={`Begin drafting ${section.title.toLowerCase()}...`}
          aria-label={`Editor for ${section.title}`}
          className="flex-1 w-full bg-transparent p-12 text-brand-text-primary leading-[2] focus:outline-none resize-none text-base custom-scrollbar overflow-y-auto pb-48 selection:bg-brand-accent/30"
        />

        {section.content.length > 500 && (
          <div className="absolute top-16 right-12 flex items-center gap-2 text-[8px] font-bold text-brand-text-secondary/40 uppercase tracking-widest bg-brand-bg-dark/50 px-3 py-1.5 rounded-full border border-brand-border opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-accent"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            Neural Scan Ready
          </div>
        )}

        {showFootnoteList && sectionFootnotes.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-brand-bg-dark border-t-2 border-brand-accent/30 p-8 max-h-[40%] overflow-y-auto z-40 shadow-2xl custom-scrollbar">
            <div className="flex items-center justify-between mb-6 border-b border-brand-border pb-4">
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-accent"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8.5L2 8.5V20a2 2 0 0 0 2 2z"/></svg>
                <h4 className="text-xs font-bold text-brand-text-primary uppercase tracking-[0.2em]">Footnote Inspector</h4>
              </div>
              <button onClick={() => setShowFootnoteList(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-brand-text-primary/10 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-text-secondary"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="space-y-3">
              {sectionFootnotes.map((f) => (
                <div key={f.id} className="text-xs text-brand-text-secondary/80 p-4 bg-brand-bg-dark-secondary border border-brand-border rounded-xl flex gap-6 leading-relaxed group hover:border-brand-accent/30 transition-all">
                  <span className="text-brand-accent font-mono font-bold shrink-0">[{f.index}]</span>
                  <span className="group-hover:text-brand-text-primary transition-colors">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showFootnoteList && sectionFootnotes.length === 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-brand-bg-dark border-t-2 border-brand-accent/30 p-8 z-40 shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-border pb-4 mb-4">
              <h4 className="text-xs font-bold text-brand-text-primary uppercase tracking-[0.2em]">Footnote Inspector</h4>
              <button onClick={() => setShowFootnoteList(false)}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-text-secondary"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
            <p className="text-center text-brand-text-secondary/40 text-[10px] uppercase font-bold py-8">No citations indexed for this section</p>
          </div>
        )}
      </div>
    </div>
  );
};
