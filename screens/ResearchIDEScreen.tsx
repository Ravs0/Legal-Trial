import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Layout as LayoutIcon, RefreshCw, ChevronLeft, ChevronRight, AlignLeft, Split, Search, Maximize2, CheckCircle2, Sparkles, FileText } from 'lucide-react';
import { trackEvent } from '../services/analyticsService';
import { parseLegalPaper, analyzeLegalConsistency, refineLegalWithIntent } from '../services/lexideService';
import { MasterManuscript } from './lexide/MasterManuscript';
import { Editor } from './lexide/Editor';
import { ResearchSidebar } from './lexide/ResearchSidebar';
import { NeuralSandbox } from './lexide/NeuralSandbox';
import type { LexIDEAppState, LexIDEResearchResult, LexIDESection } from '../types';
import { PageHeader } from '../components/PageHeader';
import { RoomTabs } from '../components/RoomChrome';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import ResearchTray from '../components/ResearchTray';

const STORAGE_KEY = 'lexide_v1_session';

const INITIAL_STATE: LexIDEAppState = {
  viewMode: 'home',
  fullContent: '',
  sections: [],
  footnotes: [],
  citationStyle: 'ILI',
  activeLeftSectionId: '',
  activeRightSectionId: '',
  isSplitView: false,
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
  const [state, setState] = useState<LexIDEAppState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return INITIAL_STATE;
  });

  const deskRef = useRef<HTMLDivElement>(null);
  const [deskWidth, setDeskWidth] = useState(0);
  const [outlineDrawerOpen, setOutlineDrawerOpen] = useState(false);
  const [researchDrawerOpen, setResearchDrawerOpen] = useState(false);
  useEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    const observer = new ResizeObserver(entries => setDeskWidth(entries[0].contentRect.width));
    observer.observe(desk);
    return () => observer.disconnect();
  }, []);
  const showExplorer = deskWidth >= 1100 ? state.isExplorerVisible : outlineDrawerOpen;
  const showResearch = deskWidth >= 1300 ? state.isResearchVisible : researchDrawerOpen;
  const editorWidth = deskWidth - (deskWidth >= 1100 && showExplorer ? 256 : 0) - (deskWidth >= 1300 && showResearch ? 320 : 0);
  const canSplit = editorWidth >= 760;
  const splitView = state.isSplitView && canSplit;

  useEffect(() => {
    if (!outlineDrawerOpen && !researchDrawerOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const label = researchDrawerOpen ? 'Show research panel' : 'Show explorer';
      setOutlineDrawerOpen(false);
      setResearchDrawerOpen(false);
      requestAnimationFrame(() => deskRef.current?.querySelector<HTMLButtonElement>('[aria-label="' + label + '"]')?.focus());
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [outlineDrawerOpen, researchDrawerOpen]);

  const [researchQuery, setResearchQuery] = useState('');
  const handleResearchSelection = (text: string) => {
    setResearchQuery(text);
    if (deskWidth < 1300) setResearchDrawerOpen(true);
    else setState(previous => ({ ...previous, isResearchVisible: true }));
  };
  const [copyStatus, setCopyStatus] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSandboxProcessing, setIsSandboxProcessing] = useState(false);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [userIntent, setUserIntent] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSectionTitleDialog, setShowSectionTitleDialog] = useState(false);
  const [sectionTitleInput, setSectionTitleInput] = useState('');
  const [hasAiConsent, setHasAiConsent] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const skipNextDirtyRef = useRef(true);

  const homeTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Debounced local autosave with explicit dirty / saving / saved chrome.
  useEffect(() => {
    if (skipNextDirtyRef.current) {
      skipNextDirtyRef.current = false;
      return;
    }
    setSaveState('dirty');
    const timeoutId = setTimeout(() => {
      setSaveState('saving');
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSaveState('saved');
      } catch {
        setSaveState('dirty');
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [state]);

  useEffect(() => {
    trackEvent('research_ide_opened', {});
  }, []);

  const toggleExplorer = () => deskWidth < 1100 ? setOutlineDrawerOpen(value => !value) : setState(prev => ({ ...prev, isExplorerVisible: !prev.isExplorerVisible }));
  const toggleResearch = () => deskWidth < 1300 ? setResearchDrawerOpen(value => !value) : setState(prev => ({ ...prev, isResearchVisible: !prev.isResearchVisible }));

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
    const hasWork = state.fullContent.trim() || state.sections.length > 0;
    if (hasWork && !window.confirm('Clear the manuscript and all sections?')) return;
    setState(INITIAL_STATE);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
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
      sandboxAnalysis: 'Running consistency check…',
      sandboxMessages: [{
        role: 'ai',
        text: `Draft sandbox open for "${section.title}". Checking consistency against the rest of the paper…`,
      }],
    }));
    const analysis = await analyzeLegalConsistency(section, state.sections);
    setState(prev => ({ ...prev, sandboxAnalysis: analysis }));
  };

  /** Re-run analysis without resetting the editable proposed draft. */
  const reanalyzeSandbox = async () => {
    if (!hasAiConsent || !state.sandboxSectionId) return;
    const section = state.sections.find(s => s.id === state.sandboxSectionId);
    if (!section) return;
    const working: LexIDESection = {
      ...section,
      content: state.sandboxProposed || section.content,
    };
    setState(prev => ({ ...prev, sandboxAnalysis: 'Running consistency check…' }));
    const analysis = await analyzeLegalConsistency(working, state.sections);
    setState(prev => ({ ...prev, sandboxAnalysis: analysis }));
  };

  const handleSandboxRefine = async () => {
    if (!hasAiConsent) return;
    if (!state.sandboxProposed.trim() && !userIntent.trim()) return;
    setIsSandboxProcessing(true);
    const intent = userIntent.trim() || 'Streamline and ensure document-wide stylistic consistency.';
    setState(prev => ({
      ...prev,
      sandboxMessages: [...prev.sandboxMessages, { role: 'user', text: intent }],
    }));
    const contextSummary = state.sections.map(s => s.title).join(', ');
    const refined = await refineLegalWithIntent(state.sandboxProposed, intent, contextSummary);
    setState(prev => ({
      ...prev,
      sandboxProposed: refined,
      sandboxMessages: [
        ...prev.sandboxMessages,
        { role: 'ai', text: 'Proposed draft refined. Re-run analysis or commit when ready.' },
      ],
    }));
    setUserIntent('');
    setIsSandboxProcessing(false);
  };

  /** Live sandbox edits update proposed only; sections change only on Commit. */
  const updateSandboxProposed = (newContent: string) => {
    setState(prev => ({ ...prev, sandboxProposed: newContent }));
  };

  const commitSandbox = (sectionId: string, newContent: string) => {
    setState(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === sectionId ? { ...s, content: newContent } : s),
      viewMode: 'workspace',
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
    };
    setState(prev => ({
      ...prev,
      // Index derives from the live ledger inside the updater — a captured
      // length here could duplicate numbers when citations land back-to-back.
      footnotes: [...prev.footnotes, { ...newFootnote, index: prev.footnotes.length + 1 }],
    }));
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
    if (!state.fullContent.trim()) {
      setValidationError('Paste a draft before running Smart Split.');
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    if (!hasAiConsent) {
      setValidationError('Confirm AI-processing consent before running Smart Split.');
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    setIsProcessing(true);
    try {
      const parsed = await parseLegalPaper(state.fullContent);
      const newSections: LexIDESection[] = parsed.sections.map((s, idx) => ({
        id: `auto-${idx}-${Date.now()}`,
        title: s.title || `Section ${idx + 1}`,
        content: s.content || '',
      }));
      if (newSections.length === 0) {
        setValidationError('Smart Split returned no sections. Check headings or split manually.');
        setTimeout(() => setValidationError(null), 5000);
        return;
      }
      setState(prev => ({ ...prev, sections: [...prev.sections, ...newSections] }));
      trackEvent('ai_smart_split_used', { sectionCount: newSections.length });
    } catch (err) {
      const detail = err instanceof Error && err.message ? err.message : 'Check your AI API key or try again.';
      setValidationError(`AI Smart Split failed. ${detail}`);
      setTimeout(() => setValidationError(null), 6000);
    } finally {
      setIsProcessing(false);
    }
  };

  const leftSection = state.sections.find(s => s.id === state.activeLeftSectionId) || state.sections[0];
  const rightSection = state.sections.find(s => s.id === state.activeRightSectionId) || state.sections[1] || state.sections[0];

  const allSavedReferences = Object.values(state.savedReferences ?? {}).flat().filter(Boolean);
  const verifiedCites = allSavedReferences
    .filter((r) => r.summary?.trim())
    .map((r) => ({
      id: r.id || r.url || r.title,
      title: r.title || 'Untitled source',
      quote: r.summary?.trim() || r.snippet || '',
      url: r.url || '',
      verify: 100,
      relevance: 100,
    }));
  const researchLeads = allSavedReferences
    .filter((r) => !r.summary?.trim())
    .map((r) => ({
      id: r.id || r.url || r.title,
      title: r.title || 'Untitled source',
      snippet: r.snippet || 'No snippet available.',
      reason: 'Awaiting summary verification.',
    }));

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
    <div ref={deskRef} className="research-desk flex flex-col flex-1 min-h-0 h-full w-full bg-brand-bg-primary text-brand-text-primary overflow-hidden">
      <div className="px-4 pt-5 sm:px-6 sm:pt-6 pb-4">
        <PageHeader dense eyebrow="The workbench / Research" title="Research desk" description="Read closely. Build your authority." actions={<>
          <RoomTabs tabs={[{id:'home',label:'Manuscript'},{id:'workspace',label:'Workspace'}]} active={state.viewMode === 'home' ? 'home' : 'workspace'} onChange={id => id === 'home' ? switchToHome() : switchToWorkspace()} />
          <Button variant="ghost" onClick={clearSession} aria-label="Clear research session"><RefreshCw size={15} />Reset</Button>
        </>} />
      </div>
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
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
          saveState={saveState}
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
          onAnalyze={reanalyzeSandbox}
          onRefine={handleSandboxRefine}
          onUpdateProposed={updateSandboxProposed}
          onCommit={commitSandbox}
          onDiscard={switchToWorkspace}
        />
        </div>
      ) : (
        /* Workspace: IDE View */
        <div className="research-surface relative z-10 flex-1 flex min-h-0 overflow-hidden">
          {/* Collapsible Explorer */}
          <div className={`${showExplorer ? 'flex' : 'hidden'} research-outline bg-brand-bg-secondary border-r border-brand-border flex-col relative overflow-hidden ${showExplorer ? 'w-64' : 'w-0'}`}>
            <div className="relative min-w-[256px] h-14 border-b border-brand-border overflow-hidden shrink-0">
              <div className="relative z-10 h-full px-4 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-brand-text-primary flex items-center gap-2">
                  <LayoutIcon size={12} aria-hidden /> Explorer
                </span>
                <button onClick={toggleExplorer} aria-label="Hide explorer" className="text-brand-text-primary/50 hover:text-brand-text-primary transition-colors">
                  <ChevronLeft size={14}/>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-w-[256px] py-2 custom-scrollbar">
              {state.sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => setState(prev => ({ ...prev, activeLeftSectionId: s.id }))}
                  className={`w-full text-left px-4 py-2.5 text-[12px] flex items-center gap-3 transition-colors ${state.activeLeftSectionId === s.id ? 'bg-[#1c1914]/[0.06] text-brand-text-primary border-r-2 border-white' : 'hover:bg-[#1c1914]/[0.04] text-brand-text-secondary'}`}
                >
                  <FileText size={14} className={state.activeLeftSectionId === s.id ? 'text-brand-text-primary/80' : 'text-brand-text-secondary/40'} />
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
                className="w-full py-2.5 bg-brand-text-primary text-brand-bg-primary rounded-lg text-[12px] font-medium hover:bg-brand-navy-light flex items-center justify-center gap-2 transition-colors"
              >
                {copyStatus ? <CheckCircle2 size={14} /> : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-4H7v4"/><path d="M7 13h10"/><path d="M7 9h4"/></svg>}
                {copyStatus ? 'Compiled' : 'Compile paper'}
              </button>
            </div>
          </div>

          {!showExplorer && (
            <button onClick={toggleExplorer} aria-label="Show explorer" className="absolute left-14 top-1/2 -translate-y-1/2 w-4 h-24 bg-brand-border/50 hover:bg-brand-border border border-brand-border rounded-r-xl flex items-center justify-center z-40 transition-all">
              <ChevronRight size={12} />
            </button>
          )}

          <main className="flex-1 flex flex-col min-w-0 bg-brand-bg-primary relative">
            <header className="research-editor-toolbar min-h-12 border-b border-brand-border bg-brand-bg-secondary flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-5 z-30">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={toggleExplorer} aria-label={showExplorer ? 'Hide explorer' : 'Show explorer'} className={`text-brand-text-secondary/40 hover:text-brand-text-primary transition-all ${showExplorer ? '' : 'opacity-40'}`}>
                  <AlignLeft size={16} />
                </button>
                <div className="h-4 w-px bg-brand-border" />
                <div className="flex items-center bg-brand-bg-primary border border-brand-border p-0.5 rounded-lg">
                  <button
                    onClick={() => setState(prev => ({ ...prev, isSplitView: false }))}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded transition-colors ${!splitView ? 'bg-brand-text-primary text-brand-bg-primary' : 'text-brand-text-secondary hover:text-brand-text-primary'}`}
                  >
                    <Maximize2 size={10} /> Single
                  </button>
                  <button
                    disabled={!canSplit}
                    title={canSplit ? 'Compare sections side by side' : 'Widen the editor to compare sections'}
                    onClick={() => setState(prev => ({ ...prev, isSplitView: true }))}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded transition-colors ${splitView ? 'bg-brand-text-primary text-brand-bg-primary' : 'text-brand-text-secondary hover:text-brand-text-primary'}`}
                  >
                    <Split size={10} /> Split
                  </button>
                </div>
                <div className="h-4 w-px bg-brand-border" />
                <button
                  onClick={() => leftSection && enterSandbox(leftSection.id)}
                  className="px-2.5 py-1 bg-[#1c1914]/[0.05] hover:bg-[#1c1914]/[0.08] text-[11px] text-brand-text-primary rounded-md border border-brand-border flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles size={12} aria-hidden /> Sandbox
                </button>
                <span
                  role="status"
                  className={`hidden sm:flex text-[11px] items-center gap-1.5 tabular-nums ${
                    saveState === 'dirty'
                      ? 'text-brand-text-primary'
                      : 'text-brand-text-secondary/60'
                  }`}
                >
                  <CheckCircle2
                    size={10}
                    className={
                      saveState === 'saving'
                        ? 'text-brand-text-primary/50 animate-pulse'
                        : saveState === 'dirty'
                          ? 'text-brand-text-primary/80'
                          : 'text-brand-text-primary/30'
                    }
                  />
                  {saveState === 'saving'
                    ? 'Saving…'
                    : saveState === 'dirty'
                      ? 'Unsaved'
                      : saveState === 'saved'
                        ? 'Saved'
                        : 'Local draft'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={toggleResearch} aria-label={showResearch ? 'Hide research panel' : 'Show research panel'} className={`p-1.5 rounded-lg border transition-colors ${showResearch ? 'text-brand-bg-primary bg-brand-text-primary border-brand-text-primary' : 'text-brand-text-secondary/50 border-brand-border hover:border-brand-border'}`}>
                  <Search size={16} />
                </button>
              </div>
            </header>

            <div className={`flex-1 flex min-h-0 transition-all duration-500 ease-in-out ${splitView ? 'flex-row' : 'flex-col'}`}>
              <div className="flex-1 min-w-0">
                {leftSection && (
                  <Editor
                    section={leftSection}
                    onUpdate={(val) => handleUpdateSection(leftSection.id, val)}
                    onAddFootnote={(pos) => handleAddFootnote(leftSection.id, pos)}
                    onResearchSelection={handleResearchSelection}
                    footnotes={state.footnotes}
                    saveState={saveState}
                  />
                )}
              </div>
              {splitView && (
                <div className="flex-1 min-w-0 border-l border-brand-border relative">
                  <div className="absolute top-2 right-4 z-10">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-bg-secondary border border-brand-border rounded-lg">
                      <select
                        className="bg-transparent text-[11px] text-brand-text-secondary outline-none cursor-pointer"
                        value={state.activeRightSectionId}
                        onChange={(e) => setState(prev => ({ ...prev, activeRightSectionId: e.target.value }))}
                      >
                        {state.sections.map(s => (
                          <option key={s.id} value={s.id} className="bg-brand-bg-secondary text-brand-text-primary">{s.title}</option>
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
                      onResearchSelection={handleResearchSelection}
                      footnotes={state.footnotes}
                      saveState={saveState}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-brand-border bg-brand-bg-secondary px-4 py-3 overflow-y-auto max-h-64 shrink-0 custom-scrollbar">
              <ResearchTray verified={verifiedCites} leads={researchLeads} />
            </div>

            <footer className="h-10 bg-brand-bg-secondary border-t border-brand-border flex items-center justify-between px-4 sm:px-6 shrink-0 z-30">
              <div className="flex items-center gap-5 sm:gap-8 text-[11px] text-brand-text-secondary uppercase tracking-wider">
                <div className="flex items-center gap-2 tabular-nums">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-text-secondary/50" aria-hidden><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8.5L2 8.5V20a2 2 0 0 0 2 2z"/></svg>
                  {state.footnotes.length} footnotes
                </div>
                <div className="flex items-center gap-2 tabular-nums">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-text-secondary/40" aria-hidden><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  {leftSection ? leftSection.content.split(/\s+/).filter(x => x.length > 0).length : 0} words
                </div>
                <div className="hidden sm:block font-mono text-brand-text-secondary/50 normal-case tracking-normal">
                  {saveState === 'saving' ? 'autosave…' : saveState === 'dirty' ? 'pending' : 'local'}
                </div>
              </div>
              <div className="text-[11px] text-brand-text-secondary/40 uppercase tracking-widest">LexIDE</div>
            </footer>
          </main>

          <div className={`${showResearch ? 'flex' : 'hidden'} research-source-panel bg-brand-bg-secondary border-l border-brand-border flex-col relative overflow-hidden ${showResearch ? 'w-80' : 'w-0'}`}>
            <div className="research-drawer-heading">
              <button type="button" className="text-link" aria-label="Close research panel" onClick={() => {
                setResearchDrawerOpen(false);
                requestAnimationFrame(() => deskRef.current?.querySelector<HTMLButtonElement>('[aria-label="Show research panel"]')?.focus());
              }}>Close panel ×</button>
            </div>
            <ResearchSidebar
              initialQuery={researchQuery}
              onCite={handleCite}
              activeSectionId={state.activeLeftSectionId}
              savedReferences={state.savedReferences}
              sections={state.sections}
            />
            {!showResearch && (
              <button onClick={toggleResearch} className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-24 bg-brand-border/50 hover:bg-brand-border border border-brand-border rounded-l-xl flex items-center justify-center z-40 transition-all">
                <ChevronLeft size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {validationError && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 bg-brand-error text-brand-text-primary text-xs font-bold rounded-xl shadow-2xl">
          {validationError}
        </div>
      )}

      {/* Section Title Dialog */}
      <Modal isOpen={showSectionTitleDialog} onClose={() => setShowSectionTitleDialog(false)} title="Name this section" size="sm">
          <div>
            <p className="text-[12px] text-brand-text-secondary mb-4 leading-relaxed">
              Give a descriptive title to the selected text from your manuscript.
            </p>
            <input
              autoFocus
              value={sectionTitleInput}
              onChange={(e) => setSectionTitleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && sectionTitleInput.trim()) confirmCreateSection(); if (e.key === 'Escape') setShowSectionTitleDialog(false); }}
              aria-label="Section title"
              placeholder="e.g. Introduction, Legal Framework…"
              className="w-full bg-brand-bg-secondary border border-brand-border rounded-lg px-4 py-3 text-sm text-brand-text-primary focus:ring-1 focus:ring-[#1c1914]/20 outline-none placeholder:text-brand-text-secondary/30"
            />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowSectionTitleDialog(false)} className="flex-1 py-2.5 text-xs text-brand-text-secondary hover:text-brand-text-primary border border-brand-border rounded-lg transition-colors font-medium uppercase tracking-wide">Cancel</button>
              <button onClick={confirmCreateSection} disabled={!sectionTitleInput.trim()} className="flex-1 py-2.5 text-xs bg-brand-text-primary hover:bg-[#3a352c] text-brand-bg-primary rounded-lg transition-colors font-medium uppercase tracking-wide disabled:opacity-50">Create</button>
            </div>
          </div>
      </Modal>
      </div>
    </div>
  );
};

export default ResearchIDEScreen;
