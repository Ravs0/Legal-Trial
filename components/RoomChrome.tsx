import React from 'react';
import { SurfacePattern } from './SurfacePattern';

interface RoomBannerProps {
  image: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Extra controls on the right (tabs, steppers, etc.) */
  trailing?: React.ReactNode;
  /** compact strip for full-height app rooms */
  dense?: boolean;
  className?: string;
}

/**
 * Shared chrome for module rooms so Strategy / Drafting / Personas / Research
 * do not look like abandoned one-offs. Same photo + hatch language as PhotoHero.
 * Flat monochrome overlays only; no gold/green glow.
 */
export const RoomBanner: React.FC<RoomBannerProps> = ({
  image,
  eyebrow,
  title,
  subtitle,
  trailing,
  dense = false,
  className = '',
}) => (
  <header
    className={`relative overflow-hidden border border-brand-border rounded-xl flex-shrink-0 ${
      dense ? 'min-h-[72px]' : 'min-h-[100px] sm:min-h-[112px]'
    } ${className}`}
  >
    <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
    <div
      className="absolute inset-0 opacity-[0.14] pointer-events-none"
      style={{
        backgroundImage:
          'repeating-linear-gradient(-45deg, transparent, transparent 12px, rgba(255,255,255,0.06) 12px, rgba(255,255,255,0.06) 13px)',
      }}
    />
    <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/75 to-black/45" />
    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />

    <div
      className={`relative z-10 h-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
        dense ? 'px-3.5 py-3' : 'px-4 sm:px-5 py-3.5 sm:py-4'
      }`}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-brand-text-primary/50 mb-0.5">
            {eyebrow}
          </p>
        )}
        <h1
          className={`font-serif font-semibold text-brand-text-primary tracking-tight leading-snug ${
            dense ? 'text-[1.05rem] sm:text-[1.2rem]' : 'text-[1.2rem] sm:text-[1.4rem]'
          }`}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-[12px] sm:text-[13px] text-brand-text-primary/65 leading-snug max-w-xl line-clamp-2">
            {subtitle}
          </p>
        )}
      </div>
      {trailing && <div className="flex-shrink-0 flex items-center gap-2">{trailing}</div>}
    </div>
  </header>
);

/** Segmented control: white = active (anti-slop, no gold glow). */
export const RoomTabs: React.FC<{
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ tabs, active, onChange, className = '' }) => (
  <div
    role="tablist"
    className={`relative inline-flex rounded-lg border border-white/20 bg-black/40 p-0.5 gap-0.5 overflow-hidden backdrop-blur-sm ${className}`}
  >
    <SurfacePattern variant="dots" className="opacity-50" />
    {tabs.map((t) => (
      <button
        key={t.id}
        type="button"
        role="tab"
        aria-selected={active === t.id}
        onClick={() => onChange(t.id)}
        className={`relative z-10 min-h-10 px-2.5 sm:px-3.5 py-1.5 rounded-md text-[11px] sm:text-[12px] font-medium transition-colors ${
          active === t.id ? 'bg-brand-text-primary text-brand-bg-primary' : 'text-brand-text-primary/70 hover:text-brand-text-primary'
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
);

/** Step chips for multi-stage rooms (drafting). */
export const RoomStepper: React.FC<{
  steps: { id: string; label: string }[];
  currentIndex: number;
  className?: string;
}> = ({ steps, currentIndex, className = '' }) => (
  <div className={`flex items-center gap-1 sm:gap-2 ${className}`}>
    {steps.map((step, idx) => (
      <React.Fragment key={step.id}>
        <div className="flex flex-col items-center">
          <div
            className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md flex items-center justify-center text-[10px] sm:text-[11px] font-semibold border ${
              idx <= currentIndex
                ? 'bg-brand-text-primary text-brand-bg-primary border-white'
                : 'bg-black/40 text-white/40 border-white/20'
            }`}
          >
            {idx < currentIndex ? '✓' : idx + 1}
          </div>
          <span
            className={`hidden sm:block text-[9px] mt-1 uppercase tracking-wide ${
              idx <= currentIndex ? 'text-brand-text-primary/80' : 'text-brand-text-primary/35'
            }`}
          >
            {step.label}
          </span>
        </div>
        {idx < steps.length - 1 && (
          <div
            className={`h-px w-3 sm:w-6 mb-0 sm:mb-4 ${
              idx < currentIndex ? 'bg-white/60' : 'bg-white/15'
            }`}
          />
        )}
      </React.Fragment>
    ))}
  </div>
);

/**
 * Soft patterned workspace frame for app-like modules.
 * Prefer a single root: flex-1 min-h-0 h-full on screen roots that live under Layout.
 * Avoid stacking extra h-full wrappers (they collapse height in flex columns).
 */
export const RoomFrame: React.FC<{
  children: React.ReactNode;
  className?: string;
  pattern?: 'grid' | 'dots' | 'lines' | 'none';
}> = ({ children, className = '', pattern = 'grid' }) => (
  <div className={`relative flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden ${className}`}>
    {pattern !== 'none' && <SurfacePattern variant={pattern} className="opacity-30" />}
    <div className="relative z-10 flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      {children}
    </div>
  </div>
);
