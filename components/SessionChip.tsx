import React from 'react';

interface SessionChipProps {
  label: string;
  value: string;
  tone?: string;
  className?: string;
}

/** Compact meta pill for phase / score / timer / active session labels. */
export const SessionChip: React.FC<SessionChipProps> = ({
  label,
  value,
  tone = 'text-brand-accent',
  className = '',
}) => (
  <div className={`rounded-xl border border-white/10 bg-brand-bg-dark/40 px-3 py-2 min-w-0 ${className}`}>
    <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/45 truncate">{label}</p>
    <p className={`mt-0.5 text-sm font-mono capitalize truncate ${tone}`}>{value}</p>
  </div>
);

interface SessionChipRowProps {
  items: Array<{ label: string; value: string; tone?: string }>;
  className?: string;
}

export const SessionChipRow: React.FC<SessionChipRowProps> = ({ items, className = '' }) => (
  <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${className}`}>
    {items.map(item => (
      <SessionChip key={item.label} label={item.label} value={item.value} tone={item.tone} />
    ))}
  </div>
);
