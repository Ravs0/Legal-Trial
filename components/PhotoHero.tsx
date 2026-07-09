import React from 'react';

interface PhotoHeroProps {
  image: string;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** compact | default | tall */
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'center';
}

const heightClass = {
  sm: 'min-h-[120px] sm:min-h-[140px]',
  md: 'min-h-[160px] sm:min-h-[200px]',
  lg: 'min-h-[200px] sm:min-h-[260px]',
};

/** Shared photo banner used across interior screens. */
export const PhotoHero: React.FC<PhotoHeroProps> = ({
  image,
  eyebrow,
  title,
  subtitle,
  actions,
  className = '',
  size = 'md',
  align = 'left',
}) => {
  const alignCls = align === 'center' ? 'text-center items-center' : 'text-left items-start';

  return (
    <section
      className={`relative overflow-hidden rounded-xl border border-brand-border ${heightClass[size]} ${className}`}
    >
      <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
      {/* Diagonal soft pattern over photo */}
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-45deg, transparent, transparent 12px, rgba(255,255,255,0.06) 12px, rgba(255,255,255,0.06) 13px)',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/70 to-black/35" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />

      <div className={`relative z-10 h-full flex flex-col justify-end p-5 sm:p-7 gap-4 ${alignCls}`}>
        <div className={`flex flex-col gap-2 max-w-2xl ${alignCls}`}>
          {eyebrow && (
            <p className="text-[11px] sm:text-[12px] uppercase tracking-[0.14em] text-white/55">{eyebrow}</p>
          )}
          <h1 className="text-[1.45rem] sm:text-[1.85rem] font-serif font-semibold text-white leading-snug tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <div className="text-[13px] sm:text-[14px] text-white/70 leading-relaxed max-w-lg">
              {subtitle}
            </div>
          )}
        </div>
        {actions && (
          <div className={`flex flex-wrap gap-2 ${align === 'center' ? 'justify-center' : ''}`}>
            {actions}
          </div>
        )}
      </div>
    </section>
  );
};
