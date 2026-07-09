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
    <header className={`flex flex-col gap-2 ${alignClass} ${className}`}>
      {icon && (
        <div className="w-10 h-10 border border-white/15 flex items-center justify-center text-white/60">
          {icon}
        </div>
      )}
      {eyebrow && (
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">{eyebrow}</p>
      )}
      <h1 className="text-[1.5rem] sm:text-[1.75rem] font-semibold tracking-tight text-white leading-snug">
        {title}
      </h1>
      {subtitle && (
        <div className={`text-[14px] text-white/50 leading-relaxed max-w-xl ${align === 'center' ? 'mx-auto' : ''}`}>
          {subtitle}
        </div>
      )}
      {actions && (
        <div className={`flex flex-wrap gap-2 mt-2 ${align === 'center' ? 'justify-center' : ''}`}>
          {actions}
        </div>
      )}
    </header>
  );
};
