
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
  titleGradient = false,
}) => {

  const baseCardStyles = `rounded-none bg-brand-bg-primary border border-brand-text-primary/30`;

  const interactiveStyles = onClick ? 'cursor-pointer transition-all duration-300' : '';
  const hoverStyles = hoverEffect && onClick
    ? 'hover:bg-brand-accent/5 focus-ring group'
    : (onClick ? 'focus-ring group' : '');

  const isFlexColCard = className.includes('flex-col');


  return (
    <div
      className={`${baseCardStyles} ${interactiveStyles} ${hoverStyles} ${className} overflow-hidden`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyPress={(e) => { if (onClick && e.key === 'Enter') onClick(); }}
    >
      {icon && (
        <div className="w-full pt-6 pb-4 flex items-center justify-center flex-shrink-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-none bg-brand-bg-secondary border border-brand-text-primary/30 flex items-center justify-center transition-colors">
            <div className="text-brand-accent">
              {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "h-8 w-8 sm:h-10 sm:w-10" })}
            </div>
          </div>
        </div>
      )}

      {(title || actions) && (
        <div className={`p-5 sm:p-6 ${icon ? 'pt-4' : ''} flex justify-between items-center ${children ? 'border-b border-brand-accent/10' : ''} flex-shrink-0 bg-brand-bg-primary/30`}>
          {title && (
            <h3 className={`text-xl sm:text-2xl font-serif font-semibold tracking-tight
              ${titleGradient ? 'text-shimmer drop-shadow-md' : 'text-brand-text-primary group-hover:text-brand-accent transition-colors'}
              ${titleClassName}`
            }>
              {title}
            </h3>
          )}
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>
      )}
      <div className={`p-5 sm:p-6 ${isFlexColCard ? 'flex-grow flex flex-col' : ''}`}>
        {children}
      </div>
    </div>
  );
};
