import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * Dense empty placeholder: border structure, sans hierarchy,
 * primary action as white monochrome CTA (design.md).
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => (
  <div
    className={`flex flex-col items-center justify-center text-center px-5 py-10 rounded-md border border-brand-border bg-brand-bg-secondary/50 ${className}`}
  >
    {icon && (
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-brand-border text-brand-text-secondary/50 [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </div>
    )}
    <h3 className="text-[15px] font-medium tracking-tight text-brand-text-primary">{title}</h3>
    {description && (
      <div className="mt-1.5 text-[13px] text-brand-text-secondary max-w-md leading-relaxed">{description}</div>
    )}
    {actionLabel && onAction && (
      <Button variant="primary" size="sm" className="mt-5" onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </div>
);
