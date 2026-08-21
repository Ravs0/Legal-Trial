import React, { useEffect, useState } from 'react';
import { Search, Loader2, ChevronDown, ChevronRight, ChevronUp, Globe, Sparkles, Archive, Link2 } from 'lucide-react';
import type { LexIDEResearchResult, LexIDESection } from '../../types';
import { performLegalResearch, summarizeSource } from '../../services/lexideService';
import { trackResearchSearch } from '../../services/analyticsService';

interface ResearchSidebarProps {
  initialQuery: string;
  onCite: (result: LexIDEResearchResult) => void;
  activeSectionId: string;
  savedReferences: Record<string, LexIDEResearchResult[]>;
  sections: LexIDESection[];
}

export const ResearchSidebar: React.FC<ResearchSidebarProps> = ({
  initialQuery,
  onCite,
  activeSectionId,
  savedReferences,
  sections,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<LexIDEResearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [isSavedExpanded, setIsSavedExpanded] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(true);
  const [lastCitedId, setLastCitedId] = useState<string | null>(null);

  // Keep local query in sync when editor "Research" pushes a selection.
  useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery);
      setIsSearchExpanded(true);
    }
    // Only react to external pushes, not local typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const handleSearch = async (e?: React.FormEvent | string) => {
    if (e && typeof e !== 'string') e.preventDefault();
    const searchQuery = typeof e === 'string' ? e : query;
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchMessage('Enter a research query.');
      setResults([]);
      setHasSearched(true);
      // Privacy-safe: length only — never the query text.
      trackResearchSearch({
        queryLength: 0,
        resultCount: 0,
        available: false,
        outcome: 'invalid',
        source: 'research_sidebar',
      });
      return;
    }
    setLoading(true);
    setIsSearchExpanded(true);
    setSearchMessage(null);
    setHasSearched(true);
    try {
      const outcome = await performLegalResearch(searchQuery);
      setResults(outcome.results);
      setSearchMessage(outcome.message || null);
      const resultCount = Array.isArray(outcome.results) ? outcome.results.length : 0;
      trackResearchSearch({
        queryLength: trimmedQuery.length,
        resultCount,
        available: outcome.available,
        outcome: !outcome.available ? 'error' : resultCount === 0 ? 'empty' : 'success',
        source: 'research_sidebar',
        provider: 'web',
      });
    } catch (err) {
      setResults([]);
      setSearchMessage(err instanceof Error ? err.message : 'Research search failed.');
      trackResearchSearch({
        queryLength: trimmedQuery.length,
        resultCount: 0,
        available: false,
        outcome: 'error',
        source: 'research_sidebar',
        provider: 'web',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async (resultId: string) => {
    const result = results.find((r) => r.id === resultId);
    if (!result) return;
    setResults((prev) => prev.map((r) => (r.id === resultId ? { ...r, isSummarizing: true } : r)));
    const summary = await summarizeSource(result.title, result.snippet, result.url);
    setResults((prev) => prev.map((r) => (r.id === resultId ? { ...r, summary, isSummarizing: false } : r)));
  };

  const handleCite = (result: LexIDEResearchResult) => {
    onCite(result);
    setLastCitedId(result.id);
    window.setTimeout(() => setLastCitedId((id) => (id === result.id ? null : id)), 1800);
  };

  const hasSavedReferences = Object.values(savedReferences).some((refs) => refs.length > 0);
  const activeSectionTitle =
    sections.find((s) => s.id === activeSectionId)?.title || 'Active section';
  const activeArchiveCount = savedReferences[activeSectionId]?.length || 0;

  return (
    <div
      className="flex flex-col h-full bg-brand-bg-secondary w-80 shrink-0 border-l border-brand-border"
      role="complementary"
      aria-label="Research panel"
    >
      <div className="p-4 border-b border-brand-border flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-brand-text-secondary flex items-center gap-2">
          <Globe size={14} className="text-brand-text-secondary" aria-hidden />
          Research
        </h3>
        <span className="text-[10px] text-brand-text-secondary/70 truncate max-w-[9rem]" title={activeSectionTitle}>
          {activeSectionTitle}
        </span>
      </div>

      <div className="p-3 border-b border-brand-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSearch(query);
          }}
          className="relative"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search statutes, case law…"
            aria-label="Research search"
            className="w-full bg-brand-bg-primary border border-brand-border rounded-lg py-2.5 pl-3 pr-11 text-[12px] focus:ring-1 focus:ring-[#1c1914]/20 text-brand-text-primary placeholder:text-brand-text-secondary/40 outline-none transition-colors"
          />
          <button
            type="submit"
            aria-label="Run research search"
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-brand-text-primary text-brand-bg-primary hover:bg-white/90 rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
          </button>
        </form>
        <p className="mt-2 text-[10px] text-brand-text-secondary/60 leading-relaxed">
          Cite attaches to the left pane section. Summaries are from snippets, not full opinions.
        </p>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <button
          type="button"
          onClick={() => setIsSearchExpanded(!isSearchExpanded)}
          className="flex items-center justify-between px-4 py-2.5 bg-brand-bg-primary/40 hover:bg-[#1c1914]/[0.04] border-b border-brand-border transition-colors"
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-brand-text-secondary">
            Search results{hasSearched && !loading ? ` · ${results.length}` : ''}
          </span>
          {isSearchExpanded ? (
            <ChevronDown size={14} className="text-brand-text-secondary/50" aria-hidden />
          ) : (
            <ChevronRight size={14} className="text-brand-text-secondary/50" aria-hidden />
          )}
        </button>

        {isSearchExpanded && (
          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={22} className="animate-spin text-brand-text-secondary" />
                <span className="text-[10px] font-medium text-brand-text-secondary/70 uppercase tracking-wider">
                  Searching…
                </span>
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-3">
                {searchMessage && (
                  <p className="text-[11px] text-brand-text-secondary/80 px-1 leading-relaxed" role="status">
                    {searchMessage}
                  </p>
                )}
                {results.map((res) => (
                  <article
                    key={res.id}
                    className="bg-brand-bg-primary border border-brand-border rounded-lg p-3.5 hover:border-brand-border transition-colors"
                  >
                    <h4 className="text-[12px] font-medium text-brand-text-primary leading-snug mb-2">{res.title}</h4>
                    <p className="text-[11px] text-brand-text-secondary/75 line-clamp-3 mb-3 leading-relaxed">
                      &ldquo;{res.snippet}&rdquo;
                    </p>

                    {res.summary && (
                      <div className="mb-3 p-3 bg-[#1c1914]/[0.04] border border-brand-border rounded-md text-[11px] text-brand-text-secondary/90">
                        <div className="flex items-center gap-1.5 mb-1.5 font-medium text-brand-text-secondary uppercase text-[9px] tracking-wider">
                          <Sparkles size={10} aria-hidden /> Snippet summary
                        </div>
                        <p className="leading-relaxed">{res.summary}</p>
                        <p className="mt-2 text-[9px] text-brand-text-secondary/50 leading-relaxed">
                          Generated from title and snippet only. Verify before relying on it.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSummarize(res.id)}
                        disabled={res.isSummarizing}
                        className="flex-1 py-2 text-[10px] bg-[#1c1914]/[0.05] hover:bg-white/[0.07] text-brand-text-secondary rounded-md transition-colors font-medium uppercase tracking-wide border border-brand-border disabled:opacity-50"
                      >
                        {res.isSummarizing ? 'Summarizing…' : 'Summarize'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCite(res)}
                        className="flex-1 py-2 text-[10px] bg-brand-text-primary hover:bg-[#3a352c] text-brand-bg-primary rounded-md transition-colors font-medium uppercase tracking-wide"
                      >
                        {lastCitedId === res.id ? 'Cited' : 'Cite'}
                      </button>
                    </div>
                    {res.url ? (
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 block text-[10px] text-brand-text-secondary/50 hover:text-brand-text-primary flex items-center justify-center gap-1.5 border-t border-brand-border pt-2.5 transition-colors"
                      >
                        <Link2 size={12} aria-hidden /> Open source
                      </a>
                    ) : (
                      <p className="mt-3 text-[10px] text-brand-text-secondary/40 text-center border-t border-brand-border pt-2.5">
                        No verifiable URL for this hit
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-brand-border px-4 py-12 text-center flex flex-col items-center">
                <Search size={28} className="mb-3 text-brand-text-secondary/25" aria-hidden />
                <p className="text-[11px] uppercase tracking-[0.14em] text-brand-text-secondary">
                  {hasSearched ? 'No sources found' : 'Ready to search'}
                </p>
                <p className="mt-2 text-[12px] text-brand-text-secondary/65 leading-relaxed max-w-[14rem]">
                  {hasSearched
                    ? 'Try a narrower citation, statute short title, or party names.'
                    : 'Select text in the editor and press Research, or type a query above.'}
                </p>
                {searchMessage && (
                  <p
                    className="mt-3 text-[11px] text-brand-text-secondary/80 leading-relaxed max-w-[15rem]"
                    role="status"
                  >
                    {searchMessage}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-brand-border bg-brand-bg-primary/30">
        <button
          type="button"
          onClick={() => setIsSavedExpanded(!isSavedExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1c1914]/[0.04] transition-colors border-b border-brand-border"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Archive
              size={14}
              className={hasSavedReferences ? 'text-brand-text-primary' : 'text-brand-text-secondary/40'}
              aria-hidden
            />
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-brand-text-secondary truncate">
              Archive{activeArchiveCount > 0 ? ` · ${activeArchiveCount} here` : ''}
            </span>
          </div>
          {isSavedExpanded ? (
            <ChevronDown size={14} className="text-brand-text-secondary/50" aria-hidden />
          ) : (
            <ChevronUp size={14} className="text-brand-text-secondary/50" aria-hidden />
          )}
        </button>

        {isSavedExpanded && (
          <div className="bg-brand-bg-secondary max-h-72 overflow-y-auto p-3 custom-scrollbar">
            {!hasSavedReferences ? (
              <div className="rounded-lg border border-dashed border-brand-border px-3 py-8 text-center">
                <p className="text-[11px] uppercase tracking-wider text-brand-text-secondary mb-1">Archive empty</p>
                <p className="text-[11px] text-brand-text-secondary/65 leading-relaxed">
                  Cited sources appear here, grouped by section.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {(Object.entries(savedReferences) as [string, LexIDEResearchResult[]][]).map(
                  ([sid, refs]) =>
                    refs.length > 0 && (
                      <div
                        key={sid}
                        className={`p-2.5 rounded-lg border ${
                          sid === activeSectionId
                            ? 'border-brand-border-light bg-[#1c1914]/[0.05]'
                            : 'border-brand-border bg-brand-bg-primary/50'
                        }`}
                      >
                        <div className="text-[9px] font-medium text-brand-text-secondary/70 uppercase mb-2 border-b border-brand-border pb-1.5 tracking-wider">
                          {sections.find((s) => s.id === sid)?.title || 'Global'}
                          {sid === activeSectionId ? ' · active' : ''}
                        </div>
                        <div className="space-y-1">
                          {refs.map((r, i) => (
                            <div
                              key={`${sid}-${i}-${r.id || r.title}`}
                              className="group flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-[#1c1914]/[0.05] transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <h5 className="text-[11px] text-brand-text-secondary group-hover:text-brand-text-primary truncate transition-colors">
                                  {r.title}
                                </h5>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCite(r)}
                                aria-label={`Cite ${r.title}`}
                                className="p-1.5 bg-[#1c1914]/[0.06] text-brand-text-secondary hover:text-brand-bg-primary hover:bg-[#3a352c] rounded transition-colors"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  aria-hidden
                                >
                                  <path d="M17 10H3" />
                                  <path d="M21 6H3" />
                                  <path d="M21 14H3" />
                                  <path d="M17 18H3" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ),
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
