import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Layout as LayoutIcon, Settings, RefreshCw, ChevronLeft, ChevronRight, AlignLeft, Split, Search, Maximize2, CheckCircle2, Sparkles, FileText } from 'lucide-react';
import { ROUTES } from '../constants';
import { trackEvent } from '../services/analyticsService';
import { parseLegalPaper, analyzeLegalConsistency, refineLegalWithIntent } from '../services/lexideService';
import { MasterManuscript } from './lexide/MasterManuscript';
import { Editor } from './lexide/Editor';
import { ResearchSidebar } from './lexide/ResearchSidebar';
import { NeuralSandbox } from './lexide/NeuralSandbox';
import type { LexIDEAppState, LexIDEResearchResult, LexIDESection } from '../types';
import { SurfacePattern } from '../components/SurfacePattern';
import { Modal } from '../components/Modal';
import libraryBooks from '../assets/library_books.jpg';

const STORAGE_KEY = 'lexide_v1_session';

const INITIAL_STATE: LexIDEAppState = {
  viewMode: 'home',
  fullContent: '',
  sections: [],
  footnotes: [],
  citationStyle: 'ILI',
  activeLeftSectionId: '',
  activeRightSectionId: '',
  isSplitView: true,
  savedReferences: {},
  isExplorerVisible: true,
  isResearchVisible: true,
  sandboxSectionId: '',
  sandboxDraft: '',
  sandboxProposed: '',
  sandboxAnalysis: '',
  sandboxMessages: [],
};

const ResearchIDEScreen: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<LexIDEAppState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return INITIAL_STATE;
  });

  const [researchQuery, setResearchQuery] = useState('');
  const [copyStatus, setCopyStatus] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSandboxProcessing, setIsSandboxProcessing] = useState(false);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [userIntent, setUserIntent] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSectionTitleDialog, setShowSectionTitleDialog] = useState(false);
  const [sectionTitleInput, setSectionTitleInput] = useState('');
  const [hasAiConsent, setHasAiConsent] = useState(false);

  const homeTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [state]);

  useEffect(() => {
    trackEvent('research_ide_opened', {});
  }, []);

  const toggleExplorer = () => setState(prev => ({ ...prev, isExplorerVisible: !prev.isExplorerVisible }));
  const toggleResearch = () => setState(prev => ({ ...prev, isResearchVisible: !prev.isResearchVisible }));

  const switchToHome = () => setState(prev => ({ ...prev, viewMode: 'home' }));
  const switchToWorkspace = () => {
    if (state.sections.length === 0) {
      setValidationError("Define at least one section before entering the workspace.");
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    setState(prev => ({
      ...prev,
      viewMode: 'workspace',
      activeLeftSectionId: prev.activeLeftSectionId || prev.sections[0].id,
      activeRightSectionId: prev.activeRightSectionId || prev.sections[1]?.id || prev.sections[0].id,
    }));
  };

  const clearSession = () => {
    setState(INITIAL_STATE);
    localStorage.removeItem(STORAGE_KEY);
  };

  const enterSandbox = async (sectionId: string) => {
    if (!hasAiConsent) {
      setValidationError('Confirm AI-processing consent before using the sandbox.');
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    const section = state.sections.find(s => s.id === sectionId);
    if (!section) return;
    setState(prev => ({
      ...prev,
      viewMode: 'ai-sandbox',
      sandboxSectionId: sectionId,
      sandboxDraft: section.content,
      sandboxProposed: section.content,
      sandboxAnalysis: 'Running consistency check...',
      sandboxMessages: [{ role: 'ai', text: `Neural Sandbox active for "${section.title}". Analyzing against the entire paper context...` }],
    }));
    const analysis = await analyzeLegalConsistency(section, state.sections);
    setState(prev => ({ ...prev, sandboxAnalysis: analysis }));
  };

  const handleSandboxRefine = async () => {
    if (!hasAiConsent) return;
    if (!userIntent.trim() && !state.sandboxDraft) return;
    setIsSandboxProcessing(true);
    const intent = userIntent || "Streamline and ensure document-wide stylistic consistency.";
    setState(prev => ({
      ...prev,
      sandboxMessages: [...prev.sandboxMessages, { role: 'user', text: intent }],
    }));
    const contextSummary = state.sections.map(s => s.title).join(', ');
    const refined = await refineLegalWithIntent(state.sandboxProposed, intent, contextSummary);
    setState(prev => ({
      ...prev,
      sandboxProposed: refined,
      sandboxMessages: [...prev.sandboxMessages, { role: 'ai', text: "Proposed draft refined. Check for repetitions against other sections." }],
    }));
    setUserIntent('');
    setIsSandboxProcessing(false);
  };

  const commitSandbox = (sectionId: string, newContent: string) => {
    setState(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === sectionId ? { ...s, content: newContent } : s),
    }));
  };

  const handleUpdateSection = (id: string, content: string) => {
    setState(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === id ? { ...s, content } : s),
    }));
  };

  const handleAddFootnote = (sectionId: string, _cursorIdx: number, text: string = "New Citation...") => {
    const newFootnote = {
      id: `fn-${Date.now()}`,
      sectionId,
      text,
      index: state.footnotes.length + 1,
    };
    setState(prev => ({ ...prev, footnotes: [...prev.footnotes, newFootnote] }));
  };

  const handleCite = useCallback((result: LexIDEResearchResult) => {
    const targetSectionId = state.activeLeftSectionId;
    if (!targetSectionId) return;
    const year = new Date().getFullYear();
    const citation = state.citationStyle === 'ILI'
      ? `${result.title}, ${result.url} (${year}).`
      : `${result.title} <${result.url}> accessed ${year}.`;
    handleAddFootnote(targetSectionId, 0, citation);
    setState(prev => ({
      ...prev,
      savedReferences: {
        ...prev.savedReferences,
        [targetSectionId]: [...(prev.savedReferences[targetSectionId] || []), result],
      },
    }));
    trackEvent('citation_added', { mode: state.citationStyle, sectionId: targetSectionId });
  }, [state.activeLeftSectionId, state.citationStyle]);

  const handleAutoMap = async () => {
    if (!state.fullContent.trim() || !hasAiConsent) return;
    setIsProcessing(true);
    try {
      const parsed = await parseLegalPaper(state.fullContent);
      const newSections: LexIDESection[] = parsed.sections.map((s: any, idx: number) => ({
        id: `auto-${idx}-${Date.now()}`,
        title: s.title,
        content: s.content,
      }));
      setState(prev => ({ ...prev, sections: [...prev.sections, ...newSections] }));
      trackEvent('ai_smart_split_used', { sectionCount: newSections.length });
    } catch {
      setValidationError("AI Smart Split failed. Check your DeepSeek API key or try again.");
      setTimeout(() => setValidationError(null), 5000);
    } finally {
      setIsProcessing(false);
    }
  };

  const leftSection = state.sections.find(s => s.id === state.activeLeftSectionId) || state.sections[0];
  const rightSection = state.sections.find(s => s.id === state.activeRightSectionId) || state.sections[1] || state.sections[0];

  const handleCreateSection = () => {
    if (selectionRange) {
      setSectionTitleInput('');
      setShowSectionTitleDialog(true);
    }
  };

  const confirmCreateSection = () => {
    if (!sectionTitleInput.trim() || !selectionRange) return;
    const selection = state.fullContent.substring(selectionRange.start, selectionRange.end);
    const newSection: LexIDESection = {
      id: `manual-${Date.now()}`,
      title: sectionTitleInput.trim(),
      content: selection,
    };
    setState(prev => ({ ...prev, sections: [...prev.sections, newSection] }));
    setSelectionRange(null);
    setShowSectionTitleDialog(false);
  };

  const deleteSection = (id: string) => {
    setState(prev => ({
      ...prev,
      sections: prev.sections.filter(s => s.id !== id),
    }));
  };

  return (
    <div className="flex flex-1 min-h-0 h-full w-full bg-brand-bg-primary text-brand-text-primary overflow-hidden relative">
      <SurfacePattern variant="grid" className="opacity-25" />
      {/* Activity Bar */}
      <div className="relative z-20 w-14 bg-brand-bg-secondary border-r border-brand-border flex flex-col items-center py-5 gap-3 shrink-0">
        <div className="w-9 h-9 rounded-lg overflow-hidden border border-brand-border mb-2">
          <img src={libraryBooks} alt="" className="w-full h-full object-cover" />
        </div>
        <button
          onClick={switchToHome}
          className={`p-2.5 rounded-lg transition-colors ${state.viewMode === 'home' ? 'bg-white text-black' : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-white/[0.04]'}`}
          title="Master Manuscript"
        >
          <FileText size={20} />
        </button>
        <button
          onClick={switchToWorkspace}
          className={`p-2.5 rounded-lg transition-colors ${state.viewMode === 'workspace' ? 'bg-white text-black' : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-white/[0.04]'}`}
          title="IDE Workspace"
        >
          <LayoutIcon size={20} />
        </button>
        {state.sandboxSectionId && (
          <button
            onClick={() => setState(prev => ({ ...prev, viewMode: 'ai-sandbox' }))}
            className={`p-2.5 rounded-lg transition-colors ${state.viewMode === 'ai-sandbox' ? 'bg-white text-black' : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-white/[0.04]'}`}
            title="Neural Sandbox"
          >
            <Sparkles size={20} />
          </button>
        )}
        <div className="mt-auto flex flex-col gap-4 pb-3">
          <button onClick={() => navigate(ROUTES.HOME)} className="text-brand-text-secondary/50 hover:text-brand-text-primary transition-colors" title="Back to LexForge">
            <Home size={20} />
          </button>
          <button onClick={clearSession} className="text-brand-text-secondary/50 hover:text-brand-text-primary transition-colors" title="Clear Session">
            <RefreshCw size={20} />
          </button>
          <Settings size={20} className="text-brand-text-secondary/25 cursor-not-allowed" />
        </div>
      </div>

      {state.viewMode === 'home' ? (
        <MasterManuscript
          fullContent={state.fullContent}
          setFullContent={(val) => setState(prev => ({ ...prev, fullContent: val }))}
          sections={state.sections}
          onDeleteSection={deleteSection}
          onSmartSplit={handleAutoMap}
          isProcessing={isProcessing}
          selectionRange={selectionRange}
          textareaRef={homeTextareaRef}
          onSelectionChange={setSelectionRange}
          onCreateSection={handleCreateSection}
          hasAiConsent={hasAiConsent}
          setHasAiConsent={setHasAiConsent}
        />
      ) : state.viewMode === 'ai-sandbox' ? (
        <div className="relative z-10 flex-1 min-w-0 overflow-hidden">
        <NeuralSandbox
          sandboxSectionId={state.sandboxSectionId}
          sandboxDraft={state.sandboxDraft}
          sandboxProposed={state.sandboxProposed}
          sandboxAnalysis={state.sandboxAnalysis}
          sandboxMessages={state.sandboxMessages}
          userIntent={userIntent}
          setUserIntent={setUserIntent}
          isSandboxProcessing={isSandboxProcessing}
          onAnalyze={() => enterSandbox(state.sandboxSectionId)}
          onRefine={handleSandboxRefine}
          onCommit={commitSandbox}
          onDiscard={switchToWorkspace}
        />
        </div>
      ) : (
        /* Workspace: IDE View */
        <div className="relative z-10 flex-1 flex overflow-hidden">
          {/* Collapsible Explorer */}
          <div className={`hidden lg:flex bg-brand-bg-secondary border-r border-brand-border transition-all duration-500 ease-in-out flex-col relative overflow-hidden ${state.isExplorerVisible ? 'w-64' : 'w-0'}`}>
            <div className="p-4 border-b border-brand-border flex items-center justify-between min-w-[256px]">
              <span className="text-[11px] uppercase tracking-wide text-brand-text-secondary flex items-center gap-2">
                <LayoutIcon size={12}/> Explorer
              </span>
              <button onClick={toggleExplorer} className="text-brand-text-secondary/40 hover:text-brand-text-primary transition-all">
                <ChevronLeft size={14}/>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-w-[256px] py-2 custom-scrollbar">
              {state.sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => setState(prev => ({ ...prev, activeLeftSectionId: s.id }))}
                  className={`w-full text-left px-4 py-2.5 text-[12px] flex items-center gap-3 transition-colors ${state.activeLeftSectionId === s.id ? 'bg-white/[0.06] text-brand-text-primary border-r-2 border-white' : 'hover:bg-white/[0.03] text-brand-text-secondary'}`}
                >
                  <FileText size={14} className={state.activeLeftSectionId === s.id ? 'text-white/80' : 'text-brand-text-secondary/40'} />
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-brand-border min-w-[256px]">
              <button
                onClick={async () => {
                  const text = state.sections.map(s => `## ${s.title}\n\n${s.content}`).join('\n\n');
                  try {
                    await navigator.clipboard.writeText(text);
                  } catch {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand('copy'); } catch { /* ignore */ }
                    document.body.removeChild(ta);
                  }
                  setCopyStatus(true);
                  setTimeout(() => setCopyStatus(false), 2000);
                }}
                className="w-full py-2.5 bg-white text-black rounded-lg text-[12px] font-medium hover:bg-white/90 flex items-center justify-center gap-2 transition-colors"
              >
                {copyStatus ? <CheckCircle2 size={14} /> : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-4H7v4"/><path d="M7 13h10"/><path d="M7 9h4"/></svg>}
                {copyStatus ? "COMPILED" : "COMPILE PAPER"}
              </button>
            </div>
          </div>

          {!state.isExplorerVisible && (
            <button onClick={toggleExplorer} className="absolute left-14 top-1/2 -translate-y-1/2 w-4 h-24 bg-brand-border/50 hover:bg-brand-border border border-brand-border rounded-r-xl flex items-center justify-center z-40 transition-all">
              <ChevronRight size={12} />
            </button>
          )}

          <main className="flex-1 flex flex-col min-w-0 bg-brand-bg-primary relative">
            <header className="h-12 border-b border-brand-border bg-brand-bg-secondary flex items-center justify-between px-4 sm:px-5 z-30">
              <div className="flex items-center gap-3">
                <button onClick={toggleExplorer} className={`text-brand-text-secondary/40 hover:text-brand-text-primary transition-all ${state.isExplorerVisible ? '' : 'opacity-40'}`}>
                  <AlignLeft size={16} />
                </button>
                <div className="h-4 w-px bg-brand-border" />
                <div className="flex items-center bg-brand-bg-primary border border-brand-border p-0.5 rounded-lg">
                  <button
                    onClick={() => setState(prev => ({ ...prev, isSplitView: false }))}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded transition-colors ${!state.isSplitView ? 'bg-white text-black' : 'text-brand-text-secondary hover:text-brand-text-primary'}`}
                  >
                    <Maximize2 size={10} /> Single
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, isSplitView: true }))}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded transition-colors ${state.isSplitView ? 'bg-white text-black' : 'text-brand-text-secondary hover:text-brand-text-primary'}`}
                  >
                    <Split size={10} /> Split
                  </button>
                </div>
                <div className="h-4 w-px bg-brand-border" />
                <button
                  onClick={() => leftSection && enterSandbox(leftSection.id)}
                  className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-brand-text-primary rounded-md border border-brand-border flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles size={12} /> Sandbox
                </button>
                <span className="hidden sm:flex text-[11px] text-brand-text-secondary/50 items-center gap-1.5">
                  <CheckCircle2 size={10} className="text-white/30" /> Saved
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={toggleResearch} className={`p-1.5 rounded-lg border transition-colors ${state.isResearchVisible ? 'text-black bg-white border-white' : 'text-brand-text-secondary/50 border-brand-border hover:border-white/20'}`}>
                  <Search size={16} />
                </button>
              </div>
            </header>

            <div className={`flex-1 flex min-h-0 transition-all duration-500 ease-in-out ${state.isSplitView ? 'flex-row' : 'flex-col'}`}>
              <div className="flex-1 min-w-0">
                {leftSection && (
                  <Editor
                    section={leftSection}
                    onUpdate={(val) => handleUpdateSection(leftSection.id, val)}
                    onAddFootnote={(pos) => handleAddFootnote(leftSection.id, pos)}
                    onResearchSelection={setResearchQuery}
                    footnotes={state.footnotes}
                  />
                )}
              </div>
              {state.isSplitView && (
                <div className="flex-1 min-w-0 border-l border-brand-border relative">
                  <div className="absolute top-2 right-4 z-10">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-bg-dark border border-brand-border rounded-lg">
                      <select
                        className="bg-transparent text-[10px] text-brand-text-secondary outline-none cursor-pointer"
                        value={state.activeRightSectionId}
                        onChange={(e) => setState(prev => ({ ...prev, activeRightSectionId: e.target.value }))}
                      >
                        {state.sections.map(s => (
                          <option key={s.id} value={s.id} className="bg-brand-bg-dark text-brand-text-primary">{s.title}</option>
                        ))}
                      </select>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-text-secondary/40"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                  {rightSection && (
                    <Editor
                      section={rightSection}
                      onUpdate={(val) => handleUpdateSection(rightSection.id, val)}
                      onAddFootnote={(pos) => handleAddFootnote(rightSection.id, pos)}
                      onResearchSelection={setResearchQuery}
                      footnotes={state.footnotes}
                    />
                  )}
                </div>
              )}
            </div>

            <footer className="h-10 bg-brand-bg-dark-secondary border-t border-brand-border flex items-center justify-between px-8 shrink-0 z-30">
              <div className="flex items-center gap-8 text-[9px] text-brand-text-secondary uppercase font-bold tracking-[0.2em]">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-accent/50"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8.5L2 8.5V20a2 2 0 0 0 2 2z"/></svg>
                  {state.footnotes.length} FOOTNOTES
                </div>
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-text-secondary/40"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  {leftSection ? leftSection.content.split(/\s+/).filter(x => x.length > 0).length : 0} WORDS
                </div>
                <div className="text-brand-accent/60 font-mono">STATUS::NODE_STABLE</div>
              </div>
              <div className="text-[9px] text-brand-text-secondary/40 font-bold uppercase tracking-widest">LexIDE v1.0</div>
            </footer>
          </main>

          <div className={`hidden lg:flex bg-brand-bg-dark border-l border-brand-border transition-all duration-500 ease-in-out flex-col relative overflow-hidden ${state.isResearchVisible ? 'w-80' : 'w-0'}`}>
            <ResearchSidebar
              initialQuery={researchQuery}
              onCite={handleCite}
              activeSectionId={state.activeLeftSectionId}
              savedReferences={state.savedReferences}
              sections={state.sections}
            />
            {!state.isResearchVisible && (
              <button onClick={toggleResearch} className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-24 bg-brand-border/50 hover:bg-brand-border border border-brand-border rounded-l-xl flex items-center justify-center z-40 transition-all">
                <ChevronLeft size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {validationError && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 bg-brand-error text-white text-xs font-bold rounded-xl shadow-2xl">
          {validationError}
        </div>
      )}

      {/* Section Title Dialog */}
      <Modal isOpen={showSectionTitleDialog} onClose={() => setShowSectionTitleDialog(false)} title="Name this section" size="sm">
          <div>
            <h3 className="text-sm font-bold text-brand-text-primary uppercase tracking-widest mb-2">Name This Section</h3>
            <p className="text-[10px] text-brand-text-secondary/60 mb-6">Give a descriptive title to the selected text from your manuscript.</p>
            <input
              autoFocus
              value={sectionTitleInput}
              onChange={(e) => setSectionTitleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && sectionTitleInput.trim()) confirmCreateSection(); if (e.key === 'Escape') setShowSectionTitleDialog(false); }}
              placeholder="e.g. Introduction, Legal Framework..."
              className="w-full bg-brand-bg-dark-secondary border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-text-primary focus:ring-1 focus:ring-brand-accent/50 outline-none placeholder:text-brand-text-secondary/30"
            />
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowSectionTitleDialog(false)} className="flex-1 py-2.5 text-xs text-brand-text-secondary/60 hover:text-brand-text-primary border border-brand-border rounded-xl transition-all font-bold uppercase tracking-tighter">Cancel</button>
              <button onClick={confirmCreateSection} disabled={!sectionTitleInput.trim()} className="flex-1 py-2.5 text-xs bg-brand-accent hover:opacity-90 text-brand-bg-dark rounded-xl transition-all font-bold uppercase tracking-tighter disabled:opacity-50">Create</button>
            </div>
          </div>
      </Modal>
    </div>
  );
};

export default ResearchIDEScreen;
