import React from 'react';
import { getCategoryColorClasses } from '../services/colorUtils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
  iconOnly?: boolean;
  categoryId?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  iconOnly = false,
  className = '',
  categoryId,
  ...props
}) => {
  const catColors = categoryId ? getCategoryColorClasses(categoryId) : null;

  const baseStyles = `font-medium rounded-none focus:outline-none focus:ring-1 ${
    catColors ? `focus:ring-${catColors.text.replace('text-', '')}` : 'focus:ring-brand-accent'
  } disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 
                      flex items-center justify-center relative overflow-hidden group min-h-[44px] sm:min-h-[0]`;

  let variantStylesConfig = {
    primary: catColors
      ? `${catColors.bg} text-brand-navy ${catColors.bgHover} focus:ring-${catColors.text.replace('text-', '')} border ${catColors.border}`
      : `bg-brand-accent text-brand-accent-text hover:bg-brand-accent-hover focus:ring-brand-accent border border-brand-accent`,
    secondary: `bg-brand-bg-secondary text-brand-text-primary hover:text-brand-text-primary border border-brand-text-primary/30 hover:border-brand-text-primary ${
      catColors ? `focus:ring-${catColors.text.replace('text-', '')}` : 'focus:ring-brand-accent'
    }`,
    danger: `bg-brand-error text-white hover:bg-red-600 focus:ring-brand-error border border-brand-error`,
    outline: catColors
      ? `bg-transparent ${catColors.text} border ${catColors.border} ${catColors.bgHoverMuted} focus:ring-${catColors.text.replace('text-', '')}`
      : `bg-transparent text-brand-accent border border-brand-accent hover:bg-brand-accent/10 focus:ring-brand-accent`,
    ghost: `bg-transparent text-brand-text-secondary hover:text-brand-text-primary ${
      catColors ? `focus:ring-${catColors.text.replace('text-', '')}` : 'focus:ring-brand-accent'
    } hover:bg-brand-text-primary/5 active:bg-brand-text-primary/10`,
  };

  const currentVariantStyle = variantStylesConfig[variant];

  const sizeStyles = {
    sm: `px-4 py-2 text-sm ${iconOnly ? 'p-2' : ''}`,
    md: `px-6 py-2.5 text-base ${iconOnly ? 'p-2.5' : ''}`,
    lg: `px-8 py-3.5 text-lg ${iconOnly ? 'p-3' : ''}`,
  };

  const widthStyles = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseStyles} ${currentVariantStyle} ${sizeStyles[size]} ${widthStyles} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {/* Shimmer effect removed for Brutalist flat UI */}

      {isLoading && (
        <svg className={`animate-spin h-5 w-5 text-current ${children ? '-ml-1 mr-3' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      <span className="relative z-10 flex items-center justify-center">{children}</span>
    </button>
  );
};