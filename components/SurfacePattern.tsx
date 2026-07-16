import React from 'react';

type PatternVariant = 'grid' | 'dots' | 'lines';

/** Subtle structural pattern for interior chrome (not loud geometry). Monochrome white-on-black only. */
export const SurfacePattern: React.FC<{
  className?: string;
  variant?: PatternVariant;
  /** Screen-reader: always decorative. */
  'aria-hidden'?: boolean | 'true' | 'false';
}> = ({ className = '', variant = 'grid' }) => {
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
      role="presentation"
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 opacity-100 ${className}`}
      style={style}
    />
  );
};

/**
 * Diagonal hatch + black scrims over photography.
 * Flat monochrome only (design.md): no gold/green glow, white opacity hatch, black gradients.
 */
export const PhotoMonoOverlays: React.FC<{
  /** hero = L→R + bottom scrims; tile = bottom-weighted card scrim */
  variant?: 'hero' | 'tile';
  /** Hatch direction in degrees (PhotoHero -45, PhotoTile 135 historically). */
  hatchAngle?: number;
  className?: string;
}> = ({ variant = 'hero', hatchAngle, className = '' }) => {
  const angle = hatchAngle ?? (variant === 'tile' ? 135 : -45);
  const hatchOpacity = variant === 'tile' ? 0.15 : 0.12;
  const step = variant === 'tile' ? 10 : 12;

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true" role="presentation">
      <div
        className="absolute inset-0"
        style={{
          opacity: hatchOpacity,
          backgroundImage: `repeating-linear-gradient(${angle}deg, transparent, transparent ${step}px, rgba(255,255,255,0.06) ${step}px, rgba(255,255,255,0.06) ${
            step + 1
          }px)`,
        }}
      />
      {variant === 'hero' ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/70 to-black/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
      )}
    </div>
  );
};

/** Panel with border + optional pattern, for forms and lists. */
export const PatternPanel: React.FC<{
  children: React.ReactNode;
  className?: string;
  pattern?: PatternVariant | 'none';
}> = ({ children, className = '', pattern = 'dots' }) => (
  <div
    className={`relative rounded-xl border border-brand-border bg-brand-bg-secondary overflow-hidden ${className}`}
  >
    {pattern !== 'none' && <SurfacePattern variant={pattern} />}
    <div className="relative z-10">{children}</div>
  </div>
);
