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
  /**
   * @deprecated Gradient titles removed (design.md monochrome). Accepted for call-site compat only.
   */
  titleGradient?: boolean;
}

/**
 * Flat surface card: border structure over elevation.
 * design.md — borders over cards, no lift shadows, minimal radius.
 */
export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  titleClassName = '',
  actions,
  icon,
  onClick,
  hoverEffect = false,
  titleGradient: _titleGradient,
}) => {
  void _titleGradient;
  const isFlexColCard = className.includes('flex-col');

  return (
    <div
      className={`rounded-md bg-brand-bg-secondary border border-brand-border overflow-hidden
        ${onClick ? 'cursor-pointer' : ''}
        ${hoverEffect && onClick ? 'hover:bg-brand-bg-tertiary hover:border-brand-border transition-colors duration-150' : ''}
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
        <div className="w-full pt-4 pb-1.5 flex items-center justify-center">
          <div className="w-10 h-10 rounded-md border border-brand-border flex items-center justify-center text-brand-text-secondary">
            {React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
              className: 'h-5 w-5',
            })}
          </div>
        </div>
      )}

      {(title || actions) && (
        <div
          className={`px-4 py-2.5 flex justify-between items-center gap-3 ${
            children ? 'border-b border-brand-border' : ''
          }`}
        >
          {title && (
            <h3
              className={`text-[13px] font-medium tracking-tight text-brand-text-primary min-w-0 ${titleClassName}`}
            >
              {title}
            </h3>
          )}
          {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`p-4 ${isFlexColCard ? 'flex-grow flex flex-col' : ''}`}>{children}</div>
    </div>
  );
};
