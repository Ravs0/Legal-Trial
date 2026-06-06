import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
  iconOnly?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  iconOnly = false,
  className = '',
  ...props
}) => {
  const baseStyles = `font-medium rounded-none focus:outline-none focus:ring-1 focus:ring-brand-accent 
                      disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 ease-out 
                      flex items-center justify-center relative overflow-hidden group`;

  let variantStylesConfig = {
    primary: `bg-brand-accent text-brand-accent-text hover:bg-brand-accent-hover focus:ring-brand-accent border border-brand-accent/55`,
    secondary: `bg-brand-bg-secondary text-brand-text-primary hover:text-brand-text-primary border border-brand-text-primary/30 hover:border-brand-text-primary focus:ring-brand-accent`,
    danger: `bg-brand-error text-white hover:bg-red-600 focus:ring-brand-error border border-brand-error`,
    outline: `bg-transparent text-brand-accent border border-brand-accent hover:bg-brand-accent/10 focus:ring-brand-accent`,
    ghost: `bg-transparent text-brand-text-secondary hover:text-brand-text-primary focus:ring-brand-accent hover:bg-white/5 active:bg-white/10`,
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
      {/* Button Shine Effect (for primary) */}
      {variant === 'primary' && !props.disabled && !isLoading && (
        <span className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[45deg] group-hover:animate-[shimmer_1.5s_infinite]"></span>
      )}

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