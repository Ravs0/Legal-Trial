import React from 'react';

interface SessionChipProps {
  label: string;
  value: string;
  tone?: string;
  className?: string;
}

export const SessionChip: React.FC<SessionChipProps> = ({
  label,
  value,
  tone = 'text-brand-text-primary',
  className = '',
}) => (
  <div className={`rounded-md border border-brand-border bg-brand-bg-secondary px-2.5 py-2 min-w-0 ${className}`}>
    <p className="text-[10px] text-brand-text-secondary truncate">{label}</p>
    <p className={`mt-0.5 text-[13px] tabular-nums capitalize truncate ${tone}`}>{value}</p>
  </div>
);

interface SessionChipRowProps {
  items: Array<{ label: string; value: string; tone?: string }>;
  className?: string;
}

export const SessionChipRow: React.FC<SessionChipRowProps> = ({ items, className = '' }) => (
  <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${className}`}>
    {items.map((item) => (
      <SessionChip
        key={item.label}
        label={item.label}
        value={item.value}
        tone={item.tone || 'text-brand-text-primary'}
      />
    ))}
  </div>
);
