
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

  const baseCardStyles = `rounded-xl bg-brand-bg-primary shadow-neumorphic-raised`; // Removed overflow-hidden
  
  const interactiveStyles = onClick ? 'cursor-pointer transition-all duration-200' : '';
  const hoverStyles = hoverEffect && onClick 
    ? 'hover:shadow-neumorphic-flat active:shadow-neumorphic-pressed' 
    : (onClick ? 'active:shadow-neumorphic-pressed' : '');

  // Determine if the card itself is intended to be a flex column container for its children area
  const isFlexColCard = className.includes('flex-col');


  return (
    <div 
      className={`${baseCardStyles} ${interactiveStyles} ${hoverStyles} ${className} ${!className.includes('overflow-') ? 'overflow-hidden' : ''}`} // Conditionally add overflow-hidden
      onClick={onClick}
    >
      {icon && ( 
        <div className="w-full pt-5 pb-3 flex items-center justify-center flex-shrink-0"> {/* Added flex-shrink-0 */}
           <div className="text-brand-accent w-16 h-16 sm:w-20 sm:h-20"> 
            {icon}
           </div>
        </div>
      )}

      {(title || actions) && (
        <div className={`p-4 sm:p-5 ${icon ? 'pt-3' : ''} flex justify-between items-center ${children ? 'border-b border-[var(--neumorphic-shadow-dark-var)] opacity-60' : ''} flex-shrink-0`}> {/* Added flex-shrink-0 */}
          {title && (
            <h3 className={`text-lg sm:text-xl font-semibold 
              ${titleGradient ? 'text-transparent bg-clip-text bg-gradient-to-r from-brand-gradient-from via-brand-gradient-mid to-brand-gradient-to' : 'text-brand-accent'}
              ${titleClassName}`
            }>
              {title}
            </h3>
          )}
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>
      )}
      <div className={`p-4 sm:p-5 ${isFlexColCard ? 'flex-grow flex flex-col' : ''}`}>
        {children}
      </div>
    </div>
  );
};
