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
    <header className={`flex flex-col gap-3 sm:gap-4 ${alignClass} ${className}`}>
      {icon && (
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-brand-bg-secondary border border-brand-border flex items-center justify-center text-brand-accent">
          {icon}
        </div>
      )}
      {eyebrow && (
        <p className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] text-brand-accent/90">
          {eyebrow}
        </p>
      )}
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-brand-text-primary tracking-tight">
        {title}
      </h1>
      {subtitle && (
        <div className={`text-sm sm:text-base text-brand-text-secondary/90 leading-relaxed max-w-2xl ${align === 'center' ? 'mx-auto' : ''}`}>
          {subtitle}
        </div>
      )}
      {actions && (
        <div className={`flex flex-wrap gap-2 mt-1 ${align === 'center' ? 'justify-center' : ''}`}>
          {actions}
        </div>
      )}
    </header>
  );
};
