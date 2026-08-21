import React, { useRef, useEffect } from 'react';
import { Sparkles, Activity, RotateCcw, AlignLeft, MessageSquare, Loader2, CheckCircle2 } from 'lucide-react';
import type { LexIDESandboxMessage } from '../../types';
import { screenMedia } from '../../assets';

interface NeuralSandboxProps {
  sandboxSectionId: string;
  sandboxDraft: string;
  sandboxProposed: string;
  sandboxAnalysis: string;
  sandboxMessages: LexIDESandboxMessage[];
  userIntent: string;
  setUserIntent: (val: string) => void;
  isSandboxProcessing: boolean;
  onAnalyze: () => void;
  onRefine: () => void;
  /** Live edits stay in proposed draft only. */
  onUpdateProposed: (content: string) => void;
  /** Commit writes proposed content into the section and leaves the sandbox. */
  onCommit: (sectionId: string, newContent: string) => void;
  onDiscard: () => void;
}

export const NeuralSandbox: React.FC<NeuralSandboxProps> = ({
  sandboxSectionId,
  sandboxProposed,
  sandboxAnalysis,
  sandboxMessages,
  userIntent,
  setUserIntent,
  isSandboxProcessing,
  onAnalyze,
  onRefine,
  onUpdateProposed,
  onCommit,
  onDiscard,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sandboxMessages]);

  const getWordCount = (text: string) => text.split(/\s+/).filter((x) => x.length > 0).length;
  const getCharCount = (text: string) => text.length;

  return (
    <div className="flex-1 flex flex-col bg-brand-bg-primary overflow-hidden">
      <header className="relative h-16 border-b border-brand-border flex items-center justify-between px-4 sm:px-8 overflow-hidden shrink-0">
        <img
          src={screenMedia.researchIDE.workspace}
          alt=""
          className="absolute inset-0 w-full h-full object-cover grayscale"
        />
        <div className="absolute inset-0 bg-black/80" />
        <div
          className="absolute inset-0 opacity-[0.14] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-45deg, transparent, transparent 12px, rgba(255,255,255,0.06) 12px, rgba(255,255,255,0.06) 13px)',
          }}
        />
        <div className="relative z-10 flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#1c1914]/[0.06] flex items-center justify-center border border-white/20 shrink-0">
            <Sparkles size={16} className="text-brand-text-primary/80" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-medium tracking-wide text-brand-text-primary truncate">Draft sandbox</h2>
            <p className="text-[10px] text-brand-text-primary/50 uppercase tracking-wider">Cross-document consistency</p>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onDiscard}
            className="px-3 py-2 text-[11px] uppercase tracking-wide text-brand-text-primary/60 hover:text-brand-text-primary border border-white/15 rounded-lg transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => onCommit(sandboxSectionId, sandboxProposed)}
            className="px-4 py-2 bg-white hover:bg-white/90 text-black rounded-lg text-[11px] font-medium flex items-center gap-2 transition-colors uppercase tracking-wide"
          >
            <CheckCircle2 size={14} aria-hidden /> Commit
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden min-h-0">
        <div className="hidden md:flex w-72 lg:w-80 flex-col border-r border-brand-border bg-brand-bg-secondary shrink-0">
          <div className="p-3 border-b border-brand-border flex items-center justify-between">
            <h3 className="text-[10px] font-medium text-brand-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Activity size={12} className="text-brand-text-secondary" aria-hidden /> Analysis
            </h3>
            <button
              type="button"
              onClick={onAnalyze}
              aria-label="Re-run consistency analysis"
              className="text-brand-text-secondary/50 hover:text-brand-text-primary transition-colors p-1"
            >
              <RotateCcw size={12} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-white/50" aria-hidden />
                <span className="text-[10px] font-medium text-brand-text-secondary/70 uppercase tracking-wider">
                  Insights
                </span>
              </div>
              <div className="p-3.5 bg-[#1c1914]/[0.04] border border-brand-border rounded-lg">
                <p className="text-[12px] text-brand-text-primary/85 leading-relaxed">{sandboxAnalysis}</p>
              </div>
            </div>
            <div className="h-px bg-brand-border my-4" />
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-brand-bg-primary border border-brand-border rounded-lg">
                <p className="text-[9px] text-brand-text-secondary/60 font-medium uppercase mb-1">Words</p>
                <p className="text-base font-mono text-brand-text-primary tabular-nums">
                  {getWordCount(sandboxProposed)}
                </p>
              </div>
              <div className="p-3 bg-brand-bg-primary border border-brand-border rounded-lg">
                <p className="text-[9px] text-brand-text-secondary/60 font-medium uppercase mb-1">Chars</p>
                <p className="text-base font-mono text-brand-text-primary tabular-nums">
                  {getCharCount(sandboxProposed)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-[10px] text-brand-text-secondary/55 leading-relaxed">
              Edits stay in the sandbox until you commit. Re-run analysis after refining.
            </p>
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-brand-bg-primary min-w-0">
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar flex flex-col">
            <div className="flex items-center justify-between mb-4 gap-3">
              <h4 className="text-[10px] font-medium text-brand-text-secondary/70 uppercase flex items-center gap-2 tracking-wider">
                <AlignLeft size={12} aria-hidden /> Proposed draft
              </h4>
              <span className="text-[9px] bg-[#1c1914]/[0.05] text-brand-text-secondary border border-brand-border px-2 py-0.5 rounded uppercase tracking-wider">
                Editable
              </span>
            </div>

            <div className="bg-brand-bg-secondary border border-brand-border p-4 sm:p-6 rounded-xl min-h-[32vh] flex flex-col">
              <textarea
                value={sandboxProposed}
                onChange={(e) => onUpdateProposed(e.target.value)}
                placeholder="Refine this section here. Changes apply only when you commit."
                aria-label="Sandbox proposed draft"
                className="flex-1 w-full min-h-[28vh] bg-transparent text-brand-text-primary leading-relaxed focus:outline-none resize-none text-[13px] sm:text-[14px]"
              />
            </div>

            <div className="mt-6 space-y-4 max-w-3xl w-full">
              {sandboxMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[90%] sm:max-w-[85%] p-3.5 rounded-xl text-[13px] border ${
                      m.role === 'user'
                        ? 'bg-brand-text-primary text-brand-bg-primary border-white rounded-tr-sm'
                        : 'bg-brand-bg-secondary text-brand-text-primary border-brand-border rounded-tl-sm'
                    }`}
                  >
                    <p className="leading-relaxed">{m.text}</p>
                    <span
                      className={`text-[9px] mt-2 block uppercase tracking-wider ${
                        m.role === 'user' ? 'text-black/45' : 'text-brand-text-secondary/45'
                      }`}
                    >
                      {m.role === 'ai' ? 'Assistant' : 'You'}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

          <div className="p-4 sm:p-6 border-t border-brand-border bg-brand-bg-secondary/90">
            <div className="relative max-w-4xl mx-auto">
              <div className="mb-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setUserIntent('Streamline for flow and remove document-wide redundancy.')
                  }
                  className="text-[10px] font-medium text-brand-text-secondary/50 hover:text-brand-text-primary uppercase tracking-wider transition-colors"
                >
                  Quick: Streamline
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setUserIntent('Ensure formal legal drafting style across all paragraphs.')
                  }
                  className="text-[10px] font-medium text-brand-text-secondary/50 hover:text-brand-text-primary uppercase tracking-wider transition-colors"
                >
                  Quick: Formalize
                </button>
              </div>
              <div className="relative">
                <input
                  value={userIntent}
                  onChange={(e) => setUserIntent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isSandboxProcessing) onRefine();
                  }}
                  placeholder="Command refine (e.g. align tone, cut repetition)…"
                  aria-label="Sandbox refine command"
                  className="w-full bg-brand-bg-primary border border-brand-border rounded-xl py-3.5 pl-4 pr-14 text-[13px] text-brand-text-primary focus:ring-1 focus:ring-white/20 outline-none transition-colors placeholder:text-brand-text-secondary/30"
                />
                <button
                  type="button"
                  onClick={onRefine}
                  disabled={isSandboxProcessing}
                  aria-label="Run refine"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white hover:bg-white/90 text-black rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                >
                  {isSandboxProcessing ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <MessageSquare size={18} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
