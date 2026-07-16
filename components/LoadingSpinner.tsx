import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
  textColor?: string;
  spinnerColor?: string;
}

/**
 * Flat monochrome spinner (design.md: no gold/green glow).
 * Default stroke is warm secondary gray; override for overlays.
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  text,
  className = '',
  textColor = 'text-brand-text-secondary',
  spinnerColor = 'text-brand-text-secondary',
}) => {
  const sizeClasses = {
    sm: 'h-5 w-5',
    md: 'h-9 w-9',
    lg: 'h-14 w-14',
  };

  return (
    <div
      className={`flex flex-col items-center justify-center ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={text || 'Loading'}
    >
      <svg
        className={`animate-spin ${sizeClasses[size]} ${spinnerColor}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-20"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {text ? (
        <p className={`mt-3 text-[11px] font-mono uppercase tracking-[0.16em] ${textColor}`}>
          {text}
        </p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
};
