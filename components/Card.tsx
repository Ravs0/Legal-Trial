import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  titleClassName?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  hoverEffect?: boolean;
  titleGradient?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  titleClassName = '',
  actions,
  icon,
  onClick,
  hoverEffect = false,
}) => {
  const isFlexColCard = className.includes('flex-col');

  return (
    <div
      className={`rounded-lg bg-brand-bg-secondary border border-brand-border overflow-hidden
        ${onClick ? 'cursor-pointer' : ''}
        ${hoverEffect && onClick ? 'hover:bg-brand-bg-tertiary/80 transition-colors' : ''}
        ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {icon && (
        <div className="w-full pt-5 pb-2 flex items-center justify-center">
          <div className="w-11 h-11 rounded-md border border-brand-border flex items-center justify-center text-brand-text-secondary">
            {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'h-5 w-5' })}
          </div>
        </div>
      )}

      {(title || actions) && (
        <div className={`px-4 py-3 flex justify-between items-center ${children ? 'border-b border-brand-border' : ''}`}>
          {title && (
            <h3 className={`text-[15px] font-medium tracking-tight text-brand-text-primary ${titleClassName}`}>
              {title}
            </h3>
          )}
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>
      )}
      <div className={`p-4 ${isFlexColCard ? 'flex-grow flex flex-col' : ''}`}>{children}</div>
    </div>
  );
};
