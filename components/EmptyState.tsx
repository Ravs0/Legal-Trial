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

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center text-center px-6 py-12 rounded-2xl border border-dashed border-brand-border bg-brand-bg-secondary/40 ${className}`}>
    {icon && (
      <div className="mb-4 text-brand-text-secondary/40 [&>svg]:h-10 [&>svg]:w-10">
        {icon}
      </div>
    )}
    <h3 className="text-lg font-serif font-semibold text-brand-text-primary">{title}</h3>
    {description && (
      <p className="mt-2 text-sm text-brand-text-secondary/85 max-w-md leading-relaxed">{description}</p>
    )}
    {actionLabel && onAction && (
      <Button variant="primary" size="sm" className="mt-5" onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </div>
);
