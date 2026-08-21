import React from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
  icon?: React.ReactNode;
}

/**
 * Interior page title block (design.md: tight hierarchy, no giant serif chrome).
 * Prefer RoomBanner for photo rooms; use this for plain decision screens.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  actions,
  align = 'left',
  className = '',
  icon,
}) => {
  const alignClass = align === 'center' ? 'text-center items-center' : 'text-left items-start';

  return (
    <header className={`flex flex-col gap-2 ${alignClass} ${className}`}>
      {icon && (
        <div
          className="w-9 h-9 border border-white/15 bg-[#1c1914]/[0.04] flex items-center justify-center text-brand-text-secondary [&>svg]:h-4 [&>svg]:w-4"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      {eyebrow && (
        <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary/70">
          {eyebrow}
        </p>
      )}
      <h1 className="text-[1.375rem] sm:text-[1.625rem] font-semibold tracking-tight text-brand-text-primary leading-snug">
        {title}
      </h1>
      {subtitle && (
        <div
          className={`text-[13px] sm:text-[14px] text-brand-text-secondary leading-relaxed max-w-xl ${
            align === 'center' ? 'mx-auto' : ''
          }`}
        >
          {subtitle}
        </div>
      )}
      {actions && (
        <div
          className={`flex flex-wrap items-center gap-2 mt-1.5 ${
            align === 'center' ? 'justify-center' : ''
          }`}
        >
          {actions}
        </div>
      )}
    </header>
  );
};
