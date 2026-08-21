import React, { useState, useContext, useEffect, useRef, useMemo, useCallback } from 'react';
import { TrialSimContext } from '../App';
import { searchWeb, SearchResult, isSearchAbortError } from '../services/searchService';
import { summarizeSearchResults } from '../services/aiService';
import { LoadingSpinner } from './LoadingSpinner';
import { useVisualViewport } from '../hooks/useVisualViewport';

interface WebSearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Focus Trap Hook ─────────────────────────────────────────────────────────
function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !ref.current) return;

    const el = ref.current;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusable = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(e => e.offsetParent !== null);

    const focusable = getFocusable();
    (focusable[0] ?? el).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const currentFirst = items[0];
      const currentLast = items[items.length - 1];

      if (e.shiftKey && document.activeElement === currentFirst) {
        e.preventDefault();
        currentLast.focus();
      } else if (!e.shiftKey && document.activeElement === currentLast) {
        e.preventDefault();
        currentFirst.focus();
      }
    };

    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
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

const isAbortLike = (err: unknown): boolean => {
  if (isSearchAbortError(err)) return true;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true;
  }
  return err instanceof Error && (err.name === 'AbortError' || /cancelled|canceled|aborted/i.test(err.message));
};

// Clipboard write with a fallback for non-secure contexts. Returns true if the
// copy succeeded by either path.
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

export const WebSearchDrawer: React.FC<WebSearchDrawerProps> = ({ isOpen, onClose }) => {
  const context = useContext(TrialSimContext);
  const practiceMode = context?.practiceMode || 'indian';
  const { vpHeight } = useVisualViewport();

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);

  // AI Summarization states
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const searchAbortRef = useRef<AbortController | null>(null);
  const summarizeAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // ─── Focus Trap Hook ───
  const drawerRef = useFocusTrap<HTMLDivElement>(isOpen);

  const cancelSearch = useCallback(() => {
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
  }, []);

  const cancelSummarize = useCallback(() => {
    if (summarizeAbortRef.current) {
      summarizeAbortRef.current.abort();
      summarizeAbortRef.current = null;
    }
  }, []);

  const cancelAllInFlight = useCallback(() => {
    cancelSearch();
    cancelSummarize();
    setIsSearching(false);
    setIsSummarizing(false);
  }, [cancelSearch, cancelSummarize]);

  // Track mount for race-safe state updates
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelSearch();
      cancelSummarize();
    };
  }, [cancelSearch, cancelSummarize]);

  // Abort in-flight work when drawer closes; keep results for next open
  useEffect(() => {
    if (!isOpen) {
      cancelAllInFlight();
    }
  }, [isOpen, cancelAllInFlight]);

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

  const runSearch = useCallback(async (nextQuery: string) => {
    const trimmed = nextQuery.trim();
    if (!trimmed) return;

    cancelSearch();
    // New search supersedes any in-flight synthesis for prior results
    cancelSummarize();
    setIsSummarizing(false);

    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);
    setEmptyMessage(null);
    setResults([]);
    setSummary(null);
    setSummarizeError(null);

    try {
      const searchData = await searchWeb(trimmed, { signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) return;
      setResults(searchData);
      if (searchData.length === 0) {
        setEmptyMessage('No search results found. Try a different query or narrower terms.');
      }
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted || isAbortLike(err)) return;
      setResults([]);
      setSearchError(err instanceof Error ? err.message : 'Web search failed. Check network.');
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
      }
      if (mountedRef.current && !controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, [cancelSearch, cancelSummarize]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(query);
  };

  const handleSummarize = async () => {
    if (results.length === 0 || isSummarizing) return;

    cancelSummarize();
    const controller = new AbortController();
    summarizeAbortRef.current = controller;

    setIsSummarizing(true);
    setSummarizeError(null);
    setSummary(null);

    try {
      const summaryText = await summarizeSearchResults(query, results, practiceMode, {
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      setSummary(summaryText);
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted || isAbortLike(err)) return;
      setSummarizeError(err instanceof Error ? err.message : 'Failed to generate AI synthesis.');
    } finally {
      if (summarizeAbortRef.current === controller) {
        summarizeAbortRef.current = null;
      }
      if (mountedRef.current && !controller.signal.aborted) {
        setIsSummarizing(false);
      }
    }
  };

  const handleCancelSearch = () => {
    cancelSearch();
    setIsSearching(false);
  };

  const handleCancelSummarize = () => {
    cancelSummarize();
    setIsSummarizing(false);
  };

  const handleCopyLink = async (url: string, index: number) => {
    if (await copyToClipboard(url)) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      setSearchError('Copying link failed.');
    }
  };

  const handleCopySummary = async () => {
    if (!summary) return;
    if (await copyToClipboard(summary)) {
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } else {
      setSummarizeError('Copying summary failed.');
    }
  };

  // Quick suggestions based on practice mode
  const suggestions = useMemo(() => (
    practiceMode === 'indian'
      ? ['Section 302 IPC punishment', 'Admissibility of electronic records Section 65B', 'Landmark Supreme Court guidelines on bail']
      : ['Strict liability autonomous vehicles', 'Doctrine of legitimate expectation common law', 'Hearsay exception guidelines']
  ), [practiceMode]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex justify-end overflow-hidden"
      style={{ height: `${vpHeight}px` }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Body */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Legal Web Research"
        tabIndex={-1}
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-brand-bg-primary md:max-w-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-brand-bg-primary px-6 py-4">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-brand-text-secondary" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
            </svg>
            <h2 className="text-[15px] font-medium text-brand-text-primary">Legal Web Research</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close research drawer"
            className="flex min-h-11 min-w-11 items-center justify-center text-brand-text-secondary transition-colors hover:text-brand-text-primary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Input Area */}
        <div className="flex-shrink-0 border-b border-white/10 bg-brand-bg-primary p-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-grow">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cases, statutes, compliance rules..."
                aria-label="Search query"
                className="w-full rounded-md border border-white/10 bg-brand-bg-secondary py-2 pl-9 pr-4 text-sm text-brand-text-primary placeholder:text-brand-text-secondary/40 transition-colors focus:border-white/30 focus:outline-none"
              />
              <span className="absolute left-3 top-2.5 text-brand-text-secondary/40" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </span>
            </div>
            {isSearching ? (
              <button
                type="button"
                onClick={handleCancelSearch}
                className="rounded-md border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-brand-text-primary transition-colors hover:bg-white/10"
              >
                Cancel
              </button>
            ) : (
              <button
                type="submit"
                disabled={!query.trim()}
                className="rounded-md border border-white/20 bg-white px-4 py-2 text-sm font-medium text-brand-bg-primary transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                Search
              </button>
            )}
          </form>

          {results.length === 0 && !isSearching && (
            <div className="mt-4">
              <span className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-brand-text-secondary/60">
                Suggestions
              </span>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => {
                      setQuery(s);
                      void runSearch(s);
                    }}
                    className="border border-white/10 bg-[#1c1914]/[0.05] px-2.5 py-1 text-left text-xs text-brand-text-secondary transition-all hover:border-white/20 hover:bg-[#1c1914]/[0.08] hover:text-brand-text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results / Summary Container */}
        <div
          className="custom-scrollbar flex-grow space-y-6 overflow-y-auto bg-brand-bg-secondary/40 p-6"
          aria-live="polite"
          aria-busy={isSearching || isSummarizing}
        >
          {isSearching && (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <LoadingSpinner text="Searching web resources..." spinnerColor="text-brand-text-secondary" textColor="text-brand-text-secondary/50" />
              <button
                type="button"
                onClick={handleCancelSearch}
                className="border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-brand-text-secondary transition-colors hover:border-white/30 hover:text-brand-text-primary"
              >
                Cancel search
              </button>
            </div>
          )}

          {searchError && !isSearching && (
            <div
              className="rounded-md border border-white/15 bg-brand-bg-primary p-4 text-center animate-fadeIn"
              role="alert"
            >
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-text-secondary/60">
                Lookup failed
              </p>
              <p className="text-sm text-brand-text-primary">{searchError}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void runSearch(query)}
                  disabled={!query.trim()}
                  className="inline-flex h-9 items-center justify-center border border-white/20 bg-white px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-black transition-colors hover:bg-white/90 disabled:opacity-50"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setSearchError(null)}
                  className="inline-flex h-9 items-center justify-center border border-white/10 px-4 text-[11px] font-semibold text-brand-text-secondary transition-colors hover:border-white/20 hover:text-brand-text-primary"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {emptyMessage && !isSearching && results.length === 0 && !searchError && (
            <div className="rounded-md border border-white/10 bg-brand-bg-primary p-4 text-center" role="status">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-text-secondary/60">
                No matches
              </p>
              <p className="text-sm text-brand-text-secondary">{emptyMessage}</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-brand-text-secondary/60">
                  Search Results ({results.length})
                </span>
                <div className="flex items-center gap-2">
                  {isSummarizing ? (
                    <button
                      type="button"
                      onClick={handleCancelSummarize}
                      className="flex items-center gap-1.5 border border-white/20 bg-transparent px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-wide text-brand-text-primary transition-all hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleSummarize()}
                      disabled={isSearching}
                      className="flex items-center gap-1.5 border border-white/20 bg-[#1c1914]/[0.06] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-wide text-brand-text-primary transition-all hover:bg-white/10 disabled:opacity-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3 15l5.096-.813L9 9l.813 5.187L15 15l-5.187.813z" />
                      </svg>
                      AI Synthesis
                    </button>
                  )}
                </div>
              </div>

              {isSummarizing && (
                <div className="space-y-3 border border-white/10 bg-brand-bg-primary p-4" role="status">
                  <div className="flex items-center gap-2 font-mono text-xs uppercase text-brand-text-secondary">
                    <LoadingSpinner size="sm" spinnerColor="text-brand-text-secondary" />
                    <span>Synthesizing Legal Analysis...</span>
                  </div>
                </div>
              )}

              {summarizeError && !isSummarizing && (
                <div
                  className="rounded-md border border-white/15 bg-brand-bg-primary p-4 animate-fadeIn"
                  role="alert"
                >
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-text-secondary/60">
                    Synthesis failed
                  </p>
                  <p className="text-sm text-brand-text-primary">{summarizeError}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSummarize()}
                      className="inline-flex h-8 items-center border border-white/20 bg-white px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-black transition-colors hover:bg-white/90"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => setSummarizeError(null)}
                      className="inline-flex h-8 items-center border border-white/10 px-3 text-[10px] font-semibold uppercase tracking-wide text-brand-text-secondary transition-colors hover:border-white/20 hover:text-brand-text-primary"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {summary && (
                <div className="animate-fadeIn space-y-3 border border-white/15 bg-[#1c1914]/[0.04] p-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary">
                      AI Case Synthesis
                    </span>
                    <button
                      type="button"
                      onClick={handleCopySummary}
                      className="flex items-center gap-1 font-mono text-[10px] text-brand-text-secondary transition-colors hover:text-brand-text-primary"
                    >
                      {copiedSummary ? 'Copied!' : 'Copy Summary'}
                    </button>
                  </div>
                  <div className="space-y-2 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-brand-text-primary/85">
                    {summary}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {results.map((r, i) => {
                  const safe = isSafeUrl(r.url);
                  return (
                    <div
                      key={r.url || i}
                      className="group relative flex flex-col gap-2 border border-white/10 bg-brand-bg-primary p-4 transition-colors hover:border-white/20 hover:bg-[#1c1914]/[0.04]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        {safe ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="pr-8 text-sm font-medium leading-snug text-brand-text-primary hover:underline"
                          >
                            {r.title}
                          </a>
                        ) : (
                          <span className="pr-8 text-sm font-medium leading-snug text-brand-text-secondary">
                            {r.title}
                            <span className="ml-2 font-mono text-[10px] text-brand-text-secondary/70">unsafe URL blocked</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopyLink(r.url, i)}
                          aria-label="Copy source URL"
                          className="absolute right-3 top-3 p-1 text-brand-text-secondary/50 opacity-0 transition-opacity hover:text-brand-text-primary group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                        >
                          {copiedIndex === i ? (
                            <span className="font-mono text-[10px] text-brand-text-primary">Copied</span>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <span className="truncate font-mono text-[10px] text-brand-text-secondary/50 select-all">{r.url}</span>
                      <p className="font-sans text-[11px] leading-relaxed text-brand-text-secondary">{r.snippet}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {results.length === 0 && !isSearching && !searchError && !emptyMessage && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="mb-4 h-12 w-12 text-brand-text-primary/15" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
              </svg>
              <h3 className="text-sm font-medium text-brand-text-primary/80">No queries run yet</h3>
              <p className="mt-1 max-w-xs text-xs text-brand-text-secondary/60">
                Use the search bar above to look up case files, precedents, and legislative changes during your trial preparation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
