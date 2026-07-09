import React from 'react';

/** Subtle structural pattern for interior chrome (not loud geometry). */
export const SurfacePattern: React.FC<{ className?: string; variant?: 'grid' | 'dots' | 'lines' }> = ({
  className = '',
  variant = 'grid',
}) => {
  const style: React.CSSProperties =
    variant === 'dots'
      ? {
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }
      : variant === 'lines'
        ? {
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(255,255,255,0.03) 23px, rgba(255,255,255,0.03) 24px)',
          }
        : {
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
          };

  return (
    <div
      className={`pointer-events-none absolute inset-0 opacity-100 ${className}`}
      style={style}
      aria-hidden
    />
  );
};

/** Panel with border + optional pattern, for forms and lists. */
export const PatternPanel: React.FC<{
  children: React.ReactNode;
  className?: string;
  pattern?: 'grid' | 'dots' | 'lines' | 'none';
}> = ({ children, className = '', pattern = 'dots' }) => (
  <div className={`relative rounded-xl border border-brand-border bg-brand-bg-secondary overflow-hidden ${className}`}>
    {pattern !== 'none' && <SurfacePattern variant={pattern} />}
    <div className="relative z-10">{children}</div>
  </div>
);
