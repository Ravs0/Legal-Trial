import React, { useMemo } from 'react';
import { ScoringResult, MetricBreakdown } from '../services/legalWritingScorer';

interface ScoreCardProps {
  result: ScoringResult;
  className?: string;
}

// Monochrome tier strokes (design.md: no gold/green glow)
const TIER_STROKE: Record<ScoringResult['verdictTier'], string> = {
  excellent: '#f2f0ec',
  good: '#c4bfb6',
  fair: '#8f8b84',
  poor: '#d48a92',
};

const TIER_TEXT: Record<ScoringResult['verdictTier'], string> = {
  excellent: 'text-brand-text-primary',
  good: 'text-brand-text-primary',
  fair: 'text-brand-text-secondary',
  poor: 'text-brand-error',
};

const TIER_BAR: Record<MetricBreakdown['status'], string> = {
  excellent: 'bg-white',
  good: 'bg-white/70',
  fair: 'bg-white/40',
  poor: 'bg-brand-error/70',
};

const ScoreGauge: React.FC<{ score: number; tier: ScoringResult['verdictTier'] }> = ({
  score,
  tier,
}) => {
  const circumference = 2 * Math.PI * 42;
  const clamped = Math.min(100, Math.max(0, score));
  const progress = (clamped / 100) * circumference;
  const strokeColor = TIER_STROKE[tier];

  return (
    <div
      className="relative flex items-center justify-center w-28 h-28 mx-auto"
      role="img"
      aria-label={`Score ${Math.round(clamped)} out of 100, ${tier}`}
    >
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="5"
        />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={strokeColor}
          strokeWidth="5"
          strokeLinecap="square"
          strokeDasharray={`${progress} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-brand-text-primary font-mono tabular-nums leading-none">
          {Math.round(clamped)}
        </span>
        <span className="mt-1 text-[9px] font-mono text-brand-text-secondary uppercase tracking-[0.18em]">
          /100
        </span>
      </div>
    </div>
  );
};

const MetricRow: React.FC<{ metric: MetricBreakdown }> = ({ metric }) => {
  const barColor = TIER_BAR[metric.status];
  const barWidth = Math.min(100, Math.max(0, metric.score));

  return (
    <div className="py-2 px-1.5 border-b border-white/[0.04] last:border-b-0">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[11px] text-brand-text-secondary font-light truncate min-w-0">
          {metric.label}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0 font-mono tabular-nums">
          <span className="text-[10px] text-brand-text-primary">{metric.value}</span>
          <span className="text-[9px] text-brand-text-secondary/45">/ {metric.target}</span>
        </div>
      </div>
      <div className="w-full h-px bg-white/10 overflow-hidden">
        <div
          className={`h-full transition-[width] duration-500 ease-out ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode; strong?: boolean }> = ({
  children,
  strong = false,
}) => (
  <div className="flex items-center gap-2 mb-1.5">
    <div className={`h-px w-3 ${strong ? 'bg-white/40' : 'bg-white/20'}`} />
    <span className="text-[9px] font-mono text-brand-text-secondary uppercase tracking-[0.18em]">
      {children}
    </span>
  </div>
);

export const ScoreCard: React.FC<ScoreCardProps> = ({ result, className = '' }) => {
  const { critical, secondary } = useMemo(() => {
    const entries = Object.entries(result.breakdown);
    const critKeys = new Set([
      'avg_sentence_length',
      'pct_compound_complex',
      'comma_interval',
      'connector_pivot_sentences',
      'legal_vocab_pct',
      'passive_voice_pct',
      'sentence_length_stddev',
    ]);
    return {
      critical: entries.filter(([k]) => critKeys.has(k)),
      secondary: entries.filter(([k]) => !critKeys.has(k)),
    };
  }, [result.breakdown]);

  return (
    <div className={`space-y-5 ${className}`}>
      <div className="text-center space-y-3 pb-4 border-b border-white/10">
        <ScoreGauge score={result.totalScore} tier={result.verdictTier} />
        <p className={`text-xs font-medium tracking-tight ${TIER_TEXT[result.verdictTier]}`}>
          {result.verdict}
        </p>
        <div className="flex items-center justify-center gap-3 text-[10px] font-mono text-brand-text-secondary/70">
          <span>{result.wordCount.toLocaleString()} words</span>
          <span className="w-px h-3 bg-white/15" aria-hidden="true" />
          <span>{result.sentenceCount} sentences</span>
          {result.aiTellCount > 0 && (
            <>
              <span className="w-px h-3 bg-white/15" aria-hidden="true" />
              <span className="text-brand-error">{result.aiTellCount} AI tells</span>
            </>
          )}
        </div>
      </div>

      {critical.length > 0 && (
        <div>
          <SectionLabel strong>Core Metrics</SectionLabel>
          <div className="border border-white/10 bg-brand-bg-secondary/40">
            {critical.map(([key, metric]) => (
              <MetricRow key={key} metric={metric} />
            ))}
          </div>
        </div>
      )}

      {secondary.length > 0 && (
        <div>
          <SectionLabel>Punctuation Profile</SectionLabel>
          <div className="border border-white/10 bg-brand-bg-secondary/40">
            {secondary.map(([key, metric]) => (
              <MetricRow key={key} metric={metric} />
            ))}
          </div>
        </div>
      )}

      {result.aiTellCount > 0 && (
        <div
          className="p-3 border border-brand-error/25 bg-brand-error/[0.06]"
          role="status"
        >
          <div className="flex items-start gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4 text-brand-error flex-shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-brand-error">
                AI-generated patterns detected
              </p>
              <p className="text-[10px] text-brand-text-secondary mt-0.5 leading-relaxed">
                {result.aiTellCount} phrase{result.aiTellCount > 1 ? 's' : ''} flagged. Penalty: -
                {result.aiTellCount * 5} points. Revise these to strengthen authenticity.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScoreCard;
