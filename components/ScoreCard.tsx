import React, { useMemo } from 'react';
import { ScoringResult, MetricBreakdown } from '../services/legalWritingScorer';

interface ScoreCardProps {
  result: ScoringResult;
  className?: string;
}

// Radial gauge for the total score
const ScoreGauge: React.FC<{ score: number; tier: ScoringResult['verdictTier'] }> = ({ score, tier }) => {
  const circumference = 2 * Math.PI * 42; // r=42
  const progress = (score / 100) * circumference;
  const strokeColor = {
    excellent: '#10b981',
    good:      '#d4a84b',
    fair:      '#f59e0b',
    poor:      '#ef4444',
  }[tier];

  return (
    <div className="relative flex items-center justify-center w-28 h-28 mx-auto">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
        <circle
          cx="50" cy="50" r="42"
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 6px ${strokeColor}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-brand-text-primary font-mono">{Math.round(score)}</span>
        <span className="text-[9px] font-mono text-brand-text-secondary uppercase tracking-widest">/100</span>
      </div>
    </div>
  );
};

// Individual metric bar
const MetricRow: React.FC<{ metric: MetricBreakdown; metricKey: string }> = ({ metric }) => {
  const barColor = {
    excellent: 'bg-emerald-500',
    good:      'bg-brand-accent',
    fair:      'bg-amber-500',
    poor:      'bg-red-500',
  }[metric.status];

  const barWidth = Math.min(100, Math.max(0, metric.score));

  return (
    <div className="group py-2 px-1 hover:bg-white/[0.02] rounded-lg transition-colors">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-brand-text-secondary font-light truncate pr-2">{metric.label}</span>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <span className="text-[10px] font-mono text-brand-text-primary">{metric.value}</span>
          <span className="text-[9px] font-mono text-brand-text-secondary/50">/ {metric.target}</span>
        </div>
      </div>
      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
};

export const ScoreCard: React.FC<ScoreCardProps> = ({ result, className = '' }) => {
  // Separate metrics into tiers for prioritised display
  const { critical, secondary } = useMemo(() => {
    const entries = Object.entries(result.breakdown);
    const critKeys = new Set([
      'avg_sentence_length', 'pct_compound_complex', 'comma_interval',
      'connector_pivot_sentences', 'legal_vocab_pct', 'passive_voice_pct',
      'sentence_length_stddev',
    ]);
    return {
      critical: entries.filter(([k]) => critKeys.has(k)),
      secondary: entries.filter(([k]) => !critKeys.has(k)),
    };
  }, [result.breakdown]);

  return (
    <div className={`space-y-5 ${className}`}>
      {/* Score Gauge */}
      <div className="text-center space-y-3">
        <ScoreGauge score={result.totalScore} tier={result.verdictTier} />
        <div>
          <p className={`text-xs font-medium ${
            result.verdictTier === 'excellent' ? 'text-emerald-400' :
            result.verdictTier === 'good' ? 'text-brand-accent' :
            result.verdictTier === 'fair' ? 'text-amber-400' :
            'text-red-400'
          }`}>
            {result.verdict}
          </p>
        </div>
        <div className="flex items-center justify-center space-x-4 text-[10px] font-mono text-brand-text-secondary/60">
          <span>{result.wordCount.toLocaleString()} words</span>
          <span className="w-px h-3 bg-brand-accent/15" />
          <span>{result.sentenceCount} sentences</span>
          {result.aiTellCount > 0 && (
            <>
              <span className="w-px h-3 bg-brand-accent/15" />
              <span className="text-red-400">{result.aiTellCount} AI tells</span>
            </>
          )}
        </div>
      </div>

      {/* Critical Metrics */}
      <div>
        <div className="flex items-center space-x-2 mb-2">
          <div className="h-px w-3 bg-brand-accent" />
          <span className="text-[9px] font-mono text-brand-accent uppercase tracking-[0.2em]">Core Metrics</span>
        </div>
        <div className="space-y-0.5">
          {critical.map(([key, metric]) => (
            <MetricRow key={key} metricKey={key} metric={metric} />
          ))}
        </div>
      </div>

      {/* Secondary Metrics */}
      <div>
        <div className="flex items-center space-x-2 mb-2">
          <div className="h-px w-3 bg-brand-accent/40" />
          <span className="text-[9px] font-mono text-brand-text-secondary uppercase tracking-[0.2em]">Punctuation Profile</span>
        </div>
        <div className="space-y-0.5">
          {secondary.map(([key, metric]) => (
            <MetricRow key={key} metricKey={key} metric={metric} />
          ))}
        </div>
      </div>

      {/* AI-Tell Warning */}
      {result.aiTellCount > 0 && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-start space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div>
              <p className="text-[11px] font-medium text-red-400">AI-Generated Patterns Detected</p>
              <p className="text-[10px] text-brand-text-secondary mt-0.5">
                {result.aiTellCount} phrase{result.aiTellCount > 1 ? 's' : ''} flagged. Penalty: -{result.aiTellCount * 5} points. 
                Revise these to strengthen authenticity.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScoreCard;
