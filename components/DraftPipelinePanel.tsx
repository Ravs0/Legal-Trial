import React, { useState } from 'react';
import { Button } from './Button';

export type DraftPassId = 'drafter' | 'critic' | 'formatter';
export type DraftPassStatus = 'idle' | 'running' | 'done' | 'skipped' | 'error';
export type CitationStyle = 'ILI' | 'OSCOLA';

export interface DraftPass {
  id: DraftPassId;
  status: DraftPassStatus;
}

interface DraftPipelinePanelProps {
  passes: DraftPass[];
  criticIssues: string[];
  criticSkipped: boolean;
  onRun: () => void;
  isRunning: boolean;
  style?: CitationStyle;
  onStyleChange?: (next: CitationStyle) => void;
}

const PASS_LABELS: Record<DraftPassId, string> = {
  drafter: 'Drafter',
  critic: 'Critic',
  formatter: 'Formatter',
};

const STATUS_DOT: Record<DraftPassStatus, string> = {
  idle: 'bg-brand-text-secondary/30',
  running: 'bg-brand-accent animate-pulse',
  done: 'bg-brand-text-primary',
  skipped: 'bg-brand-text-secondary/40',
  error: 'bg-brand-error',
};

const STATUS_TEXT: Record<DraftPassStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  done: 'Done',
  skipped: 'Skipped',
  error: 'Needs retry',
};

export const DraftPipelinePanel: React.FC<DraftPipelinePanelProps> = ({
  passes,
  criticIssues,
  criticSkipped,
  onRun,
  isRunning,
  style,
  onStyleChange,
}) => {
  const [internalStyle, setInternalStyle] = useState<CitationStyle>('ILI');
  const activeStyle = style ?? internalStyle;
  const pickStyle = (next: CitationStyle) => {
    setInternalStyle(next);
    onStyleChange?.(next);
  };
  return (
    <section aria-label="Draft pipeline" className="border border-brand-border bg-brand-bg-secondary rounded-md p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono uppercase tracking-widest text-brand-text-secondary">3 pass pipeline</p>
        <div role="group" aria-label="Citation style" className="flex border border-brand-border rounded-md overflow-hidden">
          {(['ILI', 'OSCOLA'] as CitationStyle[]).map((s) => (
            <button key={s} type="button" aria-pressed={activeStyle === s} onClick={() => pickStyle(s)}
              className={`px-2 py-1 text-[10px] font-mono uppercase ${activeStyle === s ? 'bg-brand-text-primary text-brand-bg-primary' : 'text-brand-text-secondary hover:text-brand-text-primary'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <ol className="space-y-1.5">
        {passes.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-[12px]">
            <span aria-hidden="true" className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[p.status]}`} />
            <span className="text-brand-text-primary">{PASS_LABELS[p.id]}</span>
            <span className="ml-auto text-[10px] font-mono uppercase text-brand-text-secondary">{STATUS_TEXT[p.status]}</span>
          </li>
        ))}
      </ol>
      {criticSkipped && (
        <p role="note" className="text-[11px] leading-relaxed text-brand-text-secondary border border-brand-border bg-brand-bg-primary px-2 py-1.5 rounded-md">
          Critic skipped, showing draft plus formatting only. Run again with review enabled for full checks.
        </p>
      )}
      {criticIssues.length > 0 && (
        <ul aria-label="Critic issues" className="space-y-1 text-[11px] text-brand-text-primary/90">
          {criticIssues.slice(0, 5).map((issue, i) => (
            <li key={i} className="border-l border-brand-border pl-2 leading-relaxed">{issue}</li>
          ))}
        </ul>
      )}
      <Button variant="primary" size="sm" fullWidth onClick={onRun} disabled={isRunning} isLoading={isRunning}>
        {isRunning ? 'Running pipeline' : 'Run 3 pass pipeline'}
      </Button>
    </section>
  );
};
