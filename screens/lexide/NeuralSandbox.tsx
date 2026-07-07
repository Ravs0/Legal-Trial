import React, { useRef, useEffect } from 'react';
import { Sparkles, Activity, RotateCcw, AlignLeft, MessageSquare, Loader2, CheckCircle2 } from 'lucide-react';
import type { LexIDESandboxMessage } from '../../types';

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
  onCommit: (sectionId: string, newContent: string) => void;
  onDiscard: () => void;
}

export const NeuralSandbox: React.FC<NeuralSandboxProps> = ({
  sandboxSectionId, sandboxProposed, sandboxAnalysis, sandboxMessages,
  userIntent, setUserIntent, isSandboxProcessing,
  onAnalyze, onRefine, onCommit, onDiscard,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sandboxMessages]);

  const getWordCount = (text: string) => text.split(/\s+/).filter(x => x.length > 0).length;
  const getCharCount = (text: string) => text.length;

  return (
    <div className="flex-1 flex flex-col bg-[#0c0c0e] overflow-hidden">
      <header className="h-16 border-b border-brand-border flex items-center justify-between px-10 bg-brand-bg-dark-secondary">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-brand-accent/20 flex items-center justify-center border border-brand-accent/30">
            <Sparkles size={20} className="text-brand-accent" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-brand-text-primary">Neural Sandbox</h2>
            <p className="text-[9px] text-brand-text-secondary/60 uppercase font-bold tracking-tighter">Cross-Document Consistency Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onDiscard} className="px-4 py-2 text-xs text-brand-text-secondary/60 hover:text-brand-text-primary uppercase font-bold transition-all">Discard</button>
          <button
            onClick={() => onCommit(sandboxSectionId, sandboxProposed)}
            className="px-6 py-2 bg-brand-accent hover:bg-brand-accent/80 text-brand-bg-dark rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
          >
            <CheckCircle2 size={14} /> COMMIT
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="w-80 flex flex-col border-r border-brand-border bg-brand-bg-dark">
          <div className="p-4 bg-brand-bg-dark-secondary border-b border-brand-border flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-brand-text-secondary uppercase flex items-center gap-2">
              <Activity size={12} className="text-brand-accent"/> Cross-Doc Analysis
            </h3>
            <button onClick={onAnalyze} className="text-brand-text-secondary/40 hover:text-brand-accent transition-all">
              <RotateCcw size={12}/>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-brand-accent animate-pulse" />
                <span className="text-[9px] font-bold text-brand-text-secondary/60 uppercase tracking-widest">Neural Insights</span>
              </div>
              <div className="p-4 bg-brand-accent/5 border border-brand-accent/10 rounded-xl">
                <p className="text-xs text-brand-text-primary/80 leading-relaxed">{sandboxAnalysis}</p>
              </div>
            </div>
            <div className="h-px bg-brand-border my-6" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-brand-bg-dark-secondary border border-brand-border rounded-lg">
                  <p className="text-[9px] text-brand-text-secondary/60 font-bold uppercase mb-1">Words</p>
                  <p className="text-lg font-mono text-brand-text-primary">{getWordCount(sandboxProposed)}</p>
                </div>
                <div className="p-3 bg-brand-bg-dark-secondary border border-brand-border rounded-lg">
                  <p className="text-[9px] text-brand-text-secondary/60 font-bold uppercase mb-1">Chars</p>
                  <p className="text-lg font-mono text-brand-text-primary">{getCharCount(sandboxProposed)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-brand-bg-dark">
          <div className="flex-1 overflow-y-auto p-10 custom-scrollbar flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-[10px] font-bold text-brand-text-secondary/60 uppercase flex items-center gap-2 tracking-[0.2em]">
                <AlignLeft size={12}/> Refinement Draft
              </h4>
              <span className="text-[9px] bg-brand-text-primary/10 text-brand-text-secondary/60 px-2 py-0.5 rounded uppercase font-bold tracking-tighter">Editable Sandbox</span>
            </div>

            <div className="bg-brand-bg-dark-secondary border border-brand-border p-10 rounded-2xl min-h-[40vh] flex flex-col">
              <textarea
                value={sandboxProposed}
                onChange={(e) => onCommit(sandboxSectionId, e.target.value)}
                placeholder="Drafting workspace..."
                className="flex-1 w-full bg-transparent text-brand-text-primary leading-relaxed focus:outline-none resize-none text-base"
              />
            </div>

            <div className="mt-10 space-y-6 max-w-3xl mx-auto w-full">
              {sandboxMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${
                    m.role === 'user'
                    ? 'bg-brand-bg-dark-secondary text-brand-text-primary rounded-tr-none'
                    : 'bg-brand-accent/10 text-brand-accent border border-brand-accent/20 rounded-tl-none'
                  }`}>
                    <p className="leading-relaxed">{m.text}</p>
                    <span className="text-[8px] mt-2 block text-brand-text-secondary/40 font-bold uppercase tracking-widest">{m.role === 'ai' ? 'Neural Node' : 'Researcher'}</span>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

          <div className="p-8 border-t border-brand-border bg-brand-bg-dark-secondary/80 backdrop-blur-xl">
            <div className="relative max-w-4xl mx-auto">
              <div className="absolute -top-6 left-0 flex gap-4">
                <button onClick={() => setUserIntent("Streamline for flow and remove document-wide redundancy.")}
                  className="text-[8px] font-bold text-brand-text-secondary/40 hover:text-brand-accent uppercase tracking-widest transition-all">
                  Quick: Streamline
                </button>
                <button onClick={() => setUserIntent("Ensure formal legal drafting style across all paragraphs.")}
                  className="text-[8px] font-bold text-brand-text-secondary/40 hover:text-brand-accent uppercase tracking-widest transition-all">
                  Quick: Formalize
                </button>
              </div>
              <div className="relative">
                <input
                  value={userIntent}
                  onChange={(e) => setUserIntent(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onRefine()}
                  placeholder="Command AI (e.g. 'Align with Abstract tone' or 'Find repetitions')..."
                  className="w-full bg-brand-bg-dark border border-brand-border rounded-2xl py-5 pl-8 pr-16 text-sm text-brand-text-primary focus:ring-2 focus:ring-brand-accent/50 outline-none transition-all placeholder:text-brand-text-secondary/30"
                />
                <button
                  onClick={onRefine}
                  disabled={isSandboxProcessing}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-brand-accent hover:bg-brand-accent/80 text-brand-bg-dark rounded-xl transition-all flex items-center justify-center disabled:opacity-50"
                >
                  {isSandboxProcessing ? <Loader2 size={20} className="animate-spin" /> : <MessageSquare size={20} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
