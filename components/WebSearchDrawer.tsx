import React, { useState, useContext, useEffect, useRef } from 'react';
import { TrialSimContext } from '../App';
import { searchWeb, SearchResult } from '../services/searchService';
import { summarizeSearchResults } from '../services/aiService';
import { LoadingSpinner } from './LoadingSpinner';

interface WebSearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Visual Viewport Hook ───────────────────────────────────────────────
// When keyboard opens on mobile, visualViewport.height shrinks.
// We pin the drawer height to that value so it compresses naturally
// and the search input stays visible — no content hidden behind keyboard.
function useVisualViewport() {
  const [vpHeight, setVpHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight
  );
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setVpHeight(vv.height);
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return vpHeight;
}

// ─── Focus Trap Hook ─────────────────────────────────────────────────────────
function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active || !ref.current) return;

    const el = ref.current;
    const getFocusable = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(e => !(e as any).disabled && e.offsetParent !== null);

    let focusable = getFocusable();
    const first = focusable[0];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      focusable = getFocusable();
      const currentFirst = focusable[0];
      const currentLast = focusable[focusable.length - 1];
      
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      
      if (e.shiftKey && document.activeElement === currentFirst) {
        e.preventDefault();
        currentLast?.focus();
      } else if (!e.shiftKey && document.activeElement === currentLast) {
        e.preventDefault();
        currentFirst?.focus();
      }
    };

    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [active]);

  return ref;
}

// Helper to sanitize links from stored XSS vectors
const isSafeUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

export const WebSearchDrawer: React.FC<WebSearchDrawerProps> = ({ isOpen, onClose }) => {
  const context = useContext(TrialSimContext);
  const practiceMode = context?.practiceMode || 'common';
  const vpHeight = useVisualViewport();

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // AI Summarization states
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // ─── Focus Trap Hook ───
  const drawerRef = useFocusTrap<HTMLDivElement>(isOpen);

  // ─── Scroll Containment Effect ───
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // ─── Escape Close Key Listener ───
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setResults([]);
    setSummary(null);
    setSummarizeError(null);

    try {
      const searchData = await searchWeb(query);
      setResults(searchData);
      if (searchData.length === 0) {
        setSearchError('No search results found. Try a different query.');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Web search failed. Check network.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSummarize = async () => {
    if (results.length === 0) return;

    setIsSummarizing(true);
    setSummarizeError(null);
    setSummary(null);

    try {
      const summaryText = await summarizeSearchResults(query, results, practiceMode);
      setSummary(summaryText);
    } catch (err) {
      setSummarizeError(err instanceof Error ? err.message : 'Failed to generate AI synthesis.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCopyLink = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Fallback copy execution for non-secure contexts
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      } catch {
        setSearchError('Copying link failed.');
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const handleCopySummary = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // Fallback copy execution for non-secure contexts
      const textarea = document.createElement('textarea');
      textarea.value = summary;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopiedSummary(true);
        setTimeout(() => setCopiedSummary(false), 2000);
      } catch {
        setSummarizeError('Copying summary failed.');
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  // Quick suggestions based on practice mode
  const suggestions = practiceMode === 'indian' 
    ? ['Section 302 IPC punishment', 'Admissibility of electronic records Section 65B', 'Landmark Supreme Court guidelines on bail']
    : ['Strict liability autonomous vehicles', 'Doctrine of legitimate expectation common law', 'Hearsay exception guidelines'];

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex justify-end overflow-hidden"
      style={{ height: `${vpHeight}px` }}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* Drawer Body */}
      <div 
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Legal Web Research"
        className="relative w-full max-w-lg md:max-w-xl bg-brand-bg-dark border-l border-white/8 h-full flex flex-col shadow-2xl z-10 animate-slideInFromRight"
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-brand-bg-dark">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-brand-accent">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
            </svg>
            <h2 className="text-[15px] font-serif font-semibold text-white/90">Legal Web Research</h2>
          </div>
          <button 
            type="button"
            onClick={onClose}
            aria-label="Close research drawer"
            className="p-1 text-white/40 hover:text-white/80 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Input Area */}
        <div className="p-6 border-b border-white/8 bg-brand-bg-dark flex-shrink-0">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-grow">
              <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cases, statutes, compliance rules..."
                aria-label="Search query"
                className="w-full pl-9 pr-4 py-2 text-sm bg-brand-bg-dark-secondary border border-white/8 text-white/90 focus:border-brand-accent focus:outline-none transition-colors rounded-xl placeholder-white/40"
              />
              <span className="absolute left-3 top-2.5 text-white/30">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </span>
            </div>
            <button 
              type="submit"
              disabled={isSearching}
              className="px-4 py-2 text-sm bg-brand-accent/20 border border-brand-accent text-brand-accent hover:bg-brand-accent/30 transition-colors font-medium rounded-xl disabled:opacity-50"
            >
              {isSearching ? 'Search...' : 'Search'}
            </button>
          </form>

          {/* Quick suggestions */}
          {results.length === 0 && !isSearching && (
            <div className="mt-4">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-2">Suggestions</span>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => { setQuery(s); }}
                    className="text-xs px-2.5 py-1 bg-white/5 border border-white/8 text-white/60 hover:text-white/95 hover:bg-white/10 hover:border-white/15 transition-all text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results / Summary Container */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar bg-brand-bg-primary/50">
          
          {isSearching && (
            <div className="flex flex-col items-center justify-center py-20">
              <LoadingSpinner text="Searching web resources..." spinnerColor="text-brand-accent" textColor="text-white/40" />
            </div>
          )}

          {searchError && (
            <div className="p-4 bg-brand-error/10 border border-brand-error/30 text-brand-error text-sm">
              {searchError}
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/8 pb-2">
                <span className="text-[11px] font-mono text-white/40 uppercase tracking-wider">Search Results ({results.length})</span>
                
                {/* AI Summarizer Trigger */}
                <button
                  type="button"
                  onClick={handleSummarize}
                  disabled={isSummarizing}
                  className="flex items-center gap-1.5 px-3 py-1 bg-brand-accent/10 border border-brand-accent/35 text-brand-accent text-[11px] font-medium tracking-wide uppercase hover:bg-brand-accent/20 transition-all disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-3.5 w-3.5 animate-pulse">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3 15l5.096-.813L9 9l.813 5.187L15 15l-5.187.813z" />
                  </svg>
                  {isSummarizing ? 'Synthesizing...' : 'AI Synthesis'}
                </button>
              </div>

              {/* AI Summary Panel */}
              {isSummarizing && (
                <div className="p-4 bg-brand-bg-dark border border-brand-accent/20 space-y-3">
                  <div className="flex items-center gap-2 text-brand-accent text-xs font-mono uppercase">
                    <LoadingSpinner size="sm" spinnerColor="text-brand-accent" />
                    <span>Synthesizing Legal Analysis...</span>
                  </div>
                </div>
              )}

              {summarizeError && (
                <div className="p-4 bg-brand-error/10 border border-brand-error/30 text-brand-error text-sm">
                  {summarizeError}
                </div>
              )}

              {summary && (
                <div className="p-4 bg-brand-accent/5 border border-brand-accent/20 animate-fadeIn space-y-3">
                  <div className="flex items-center justify-between border-b border-brand-accent/15 pb-2">
                    <span className="text-[10px] font-mono text-brand-accent uppercase tracking-wider font-semibold">AI Case Synthesis</span>
                    <button
                      type="button"
                      onClick={handleCopySummary}
                      className="text-[10px] flex items-center gap-1 text-white/50 hover:text-white/85 transition-colors font-mono"
                    >
                      {copiedSummary ? 'Copied!' : 'Copy Summary'}
                    </button>
                  </div>
                  <div className="text-[12px] text-white/80 leading-relaxed font-sans space-y-2 whitespace-pre-wrap">
                    {summary}
                  </div>
                </div>
              )}

              {/* Results List */}
              <div className="space-y-4">
                {results.map((r, i) => {
                  const safeUrl = isSafeUrl(r.url) ? r.url : '#';
                  return (
                    <div key={i} className="p-4 bg-brand-bg-dark border border-white/5 hover:border-white/12 hover:bg-white/5 transition-colors flex flex-col gap-2 relative group">
                      <div className="flex justify-between items-start gap-4">
                        <a 
                          href={safeUrl} 
                          target="_blank" 
                          rel="noopener noreferrer nofollow"
                          onClick={(e) => {
                            if (!isSafeUrl(r.url)) {
                              e.preventDefault();
                              setSearchError(`Blocked unsafe URL scheme: ${r.url.slice(0, 50)}`);
                            }
                          }}
                          className="text-brand-accent hover:underline text-sm font-serif font-medium leading-snug pr-8"
                        >
                          {r.title}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(r.url, i)}
                          aria-label="Copy Source URL"
                          className="absolute right-3 top-3 text-white/35 hover:text-white/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {copiedIndex === i ? (
                            <span className="text-[10px] font-mono text-green-400">Copied</span>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <span className="text-[10px] text-white/30 truncate select-all">{r.url}</span>
                      <p className="text-[11px] text-white/60 leading-relaxed font-sans">{r.snippet}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {results.length === 0 && !isSearching && !searchError && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-12 w-12 text-white/15 mb-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
              </svg>
              <h3 className="text-sm font-medium text-white/70">No queries run yet</h3>
              <p className="text-xs text-white/40 mt-1 max-w-xs">Use the search bar above to look up case files, precedents, and legislative changes during your trial preparation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
