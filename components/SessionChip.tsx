import React from 'react';

interface SessionChipProps {
  label: string;
  value: string;
  tone?: string;
  className?: string;
}

/**
 * Dense session meta cell (design.md: borders over cards, mono hierarchy).
 */
export const SessionChip: React.FC<SessionChipProps> = ({
  label,
  value,
  tone = 'text-brand-text-primary',
  className = '',
}) => (
  <div
    className={`min-w-0 rounded-sm border border-brand-border bg-brand-bg-secondary px-2.5 py-2 ${className}`}
  >
    <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary/80 truncate">
      {label}
    </p>
    <p
      className={`mt-1 text-[13px] tabular-nums tracking-tight truncate ${tone}`}
      title={value}
    >
      {value}
    </p>
  </div>
);

interface SessionChipRowProps {
  items: Array<{ label: string; value: string; tone?: string }>;
  className?: string;
}

export const SessionChipRow: React.FC<SessionChipRowProps> = ({ items, className = '' }) => (
  <div
    className={`grid grid-cols-2 sm:grid-cols-4 gap-px border border-brand-border bg-[#1c1914]/[0.06] rounded-sm overflow-hidden ${className}`}
    role="list"
    aria-label="Session metrics"
  >
    {items.map((item) => (
      <div key={item.label} role="listitem" className="bg-brand-bg-secondary">
        <SessionChip
          label={item.label}
          value={item.value}
          tone={item.tone || 'text-brand-text-primary'}
          className="border-0 rounded-none h-full"
        />
      </div>
    ))}
  </div>
);
