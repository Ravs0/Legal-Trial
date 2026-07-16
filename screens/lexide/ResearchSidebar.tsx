import React, { useState } from 'react';
import { Search, Loader2, ChevronDown, ChevronRight, ChevronUp, Globe, Sparkles, Archive, Link2 } from 'lucide-react';
import type { LexIDEResearchResult, LexIDESection } from '../../types';
import { performLegalResearch, summarizeSource } from '../../services/lexideService';

interface ResearchSidebarProps {
  initialQuery: string;
  onCite: (result: LexIDEResearchResult) => void;
  activeSectionId: string;
  savedReferences: Record<string, LexIDEResearchResult[]>;
  sections: LexIDESection[];
}

export const ResearchSidebar: React.FC<ResearchSidebarProps> = ({
  initialQuery, onCite, savedReferences, sections,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<LexIDEResearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSavedExpanded, setIsSavedExpanded] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(true);

  const handleSearch = async (e?: React.FormEvent | string) => {
    if (e && typeof e !== 'string') e.preventDefault();
    const searchQuery = typeof e === 'string' ? e : query;
    if (!searchQuery.trim()) return;
    setLoading(true);
    setIsSearchExpanded(true);
    const data = await performLegalResearch(searchQuery);
    setResults(data);
    setLoading(false);
  };

  const handleSummarize = async (resultId: string) => {
    const result = results.find(r => r.id === resultId);
    if (!result) return;
    setResults(prev => prev.map(r => r.id === resultId ? { ...r, isSummarizing: true } : r));
    const summary = await summarizeSource(result.title, result.snippet, result.url);
    setResults(prev => prev.map(r => r.id === resultId ? { ...r, summary, isSummarizing: false } : r));
  };

  const hasSavedReferences = Object.values(savedReferences).some(refs => refs.length > 0);

  return (
    <div className="flex flex-col h-full bg-brand-bg-dark w-80 shrink-0 border-l border-brand-border" role="complementary" aria-label="Research panel">
      <div className="p-5 border-b border-brand-border bg-brand-bg-dark-secondary flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-text-secondary flex items-center gap-2">
          <Globe size={14} className="text-brand-accent" /> Research Node
        </h3>
      </div>

      <div className="p-4 border-b border-brand-border bg-brand-bg-dark-secondary">
        <form onSubmit={(e) => { e.preventDefault(); handleSearch(query); }} className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search statutes, case law..."
            aria-label="Research search"
            className="w-full bg-brand-bg-dark border border-brand-border rounded-xl py-3 pl-4 pr-12 text-xs focus:ring-1 focus:ring-brand-accent/50 text-brand-text-primary placeholder:text-brand-text-secondary/40 outline-none transition-all"
          />
          <button type="submit" aria-label="Run research search" className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-brand-accent/10 hover:bg-brand-accent text-brand-text-secondary hover:text-brand-bg-dark rounded-lg transition-all">
            <ChevronRight size={14} />
          </button>
        </form>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <button onClick={() => setIsSearchExpanded(!isSearchExpanded)}
          className="flex items-center justify-between px-6 py-3 bg-brand-bg-dark-secondary/50 hover:bg-brand-text-primary/5 border-b border-brand-border transition-all"
        >
          <span className="text-[9px] font-bold uppercase tracking-widest text-brand-text-secondary/60">Search Results</span>
          {isSearchExpanded ? <ChevronDown size={14} className="text-brand-text-secondary/40"/> : <ChevronRight size={14} className="text-brand-text-secondary/40"/>}
        </button>

        {isSearchExpanded && (
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 size={24} className="animate-spin text-brand-accent" />
                <span className="text-[9px] font-bold text-brand-text-secondary/40 uppercase tracking-widest">Scanning...</span>
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-4">
                {results.map((res) => (
                  <div key={res.id} className="bg-brand-bg-dark-secondary border border-brand-border/80 rounded-2xl p-5 hover:border-brand-accent/30 transition-all group">
                    <h4 className="text-[11px] font-bold text-brand-text-primary leading-snug mb-3 group-hover:text-brand-accent transition-colors">{res.title}</h4>
                    <p className="text-[10px] text-brand-text-secondary/60 line-clamp-3 mb-4 leading-relaxed">&ldquo;{res.snippet}&rdquo;</p>

                    {res.summary && (
                      <div className="mb-4 p-4 bg-brand-accent/5 border border-brand-accent/10 rounded-xl text-[10px] text-brand-text-secondary/80">
                        <div className="flex items-center gap-1.5 mb-2 font-bold text-brand-accent uppercase text-[8px] tracking-widest">
                          <Sparkles size={10} /> Neural Summary
                        </div>
                        <p className="leading-relaxed">{res.summary}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-4">
                      <button
                        onClick={() => handleSummarize(res.id)}
                        disabled={res.isSummarizing}
                        className="flex-1 py-2 text-[9px] bg-brand-text-primary/10 hover:bg-brand-text-primary/15 text-brand-text-secondary rounded-lg transition-all font-bold uppercase tracking-tighter border border-brand-border disabled:opacity-50"
                      >
                        {res.isSummarizing ? 'Analyzing...' : 'SUMMARIZE'}
                      </button>
                      <button
                        onClick={() => onCite(res)}
                        className="flex-1 py-2 text-[9px] bg-brand-accent hover:bg-brand-accent/80 text-brand-bg-dark rounded-lg transition-all font-bold uppercase tracking-tighter"
                      >
                        CITE SOURCE
                      </button>
                    </div>
                    <a href={res.url} target="_blank" rel="noopener noreferrer" className="mt-4 block text-[9px] text-brand-text-secondary/40 hover:text-brand-accent flex items-center justify-center gap-2 border-t border-brand-border/50 pt-3 transition-all">
                      <Link2 size={12} /> VERIFY ORIGINAL SOURCE
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-brand-text-secondary/20 flex flex-col items-center">
                <Search size={40} className="mb-4 opacity-10" />
                <p className="text-[10px] uppercase font-bold tracking-[0.2em] opacity-40">Ready for Search</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-brand-border bg-brand-bg-dark-secondary">
        <button onClick={() => setIsSavedExpanded(!isSavedExpanded)}
          className="w-full flex items-center justify-between px-6 py-4 bg-brand-text-primary/5 hover:bg-brand-text-primary/10 transition-all border-b border-brand-border"
        >
          <div className="flex items-center gap-3">
            <Archive size={14} className={hasSavedReferences ? "text-brand-accent" : "text-brand-text-secondary/30"} />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-text-secondary">Research Archive</span>
          </div>
          {isSavedExpanded ? <ChevronDown size={14} className="text-brand-text-secondary/40" /> : <ChevronUp size={14} className="text-brand-text-secondary/40" />}
        </button>

        {isSavedExpanded && (
          <div className="bg-brand-bg-dark max-h-72 overflow-y-auto p-4 custom-scrollbar">
            {!hasSavedReferences ? (
              <p className="text-[10px] text-brand-text-secondary/30 text-center py-8 font-bold uppercase tracking-widest">Archive Empty</p>
            ) : (
              <div className="space-y-6">
                {(Object.entries(savedReferences) as [string, LexIDEResearchResult[]][]).map(([sid, refs]) => refs.length > 0 && (
                  <div key={sid} className="bg-brand-bg-dark-secondary/50 p-3 rounded-xl border border-brand-border">
                    <div className="text-[8px] font-bold text-brand-text-secondary/40 uppercase mb-3 border-b border-brand-border pb-2 px-1 tracking-tighter">
                      REF :: {sections.find(s => s.id === sid)?.title || 'GLOBAL'}
                    </div>
                    <div className="space-y-2">
                      {refs.map((r, i) => (
                        <div key={i} className="group flex items-center justify-between p-2 rounded-lg hover:bg-brand-text-primary/5 transition-all border border-transparent hover:border-brand-border">
                          <div className="min-w-0 flex-1 pr-3">
                            <h5 className="text-[10px] font-medium text-brand-text-secondary/60 group-hover:text-brand-text-primary/80 truncate transition-colors">{r.title}</h5>
                          </div>
                          <button onClick={() => onCite(r)} aria-label={`Cite ${r.title}`} className="p-1.5 bg-brand-text-primary/10 text-brand-text-secondary/60 hover:text-brand-accent hover:bg-brand-accent/10 rounded transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 10H3"/><path d="M21 6H3"/><path d="M21 14H3"/><path d="M17 18H3"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
