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
  const baseStyles = `font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-brand-bg-primary 
                      disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 ease-in-out 
                      flex items-center justify-center`;

  // Neumorphic base styles for buttons that extrude (not primary/danger solid bg)
  const neumorphicExtrudedBase = 'bg-brand-bg-primary shadow-neumorphic-raised active:shadow-neumorphic-pressed';

  let variantStylesConfig = {
    // Primary: Solid red background for strong CTA, still with neumorphic active state for consistency
    primary: `bg-brand-accent text-brand-accent-text hover:bg-brand-accent-hover focus:ring-brand-accent shadow-neumorphic-raised active:shadow-neumorphic-pressed active:bg-brand-accent-hover`, 
    // Secondary: Neumorphic base, red text on hover
    secondary: `${neumorphicExtrudedBase} text-brand-text-secondary hover:text-brand-accent focus:ring-brand-accent`,
    // Danger: Distinct solid red, similar to primary but for error/destructive actions
    danger: `bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-neumorphic-raised active:shadow-neumorphic-pressed active:bg-red-700`, 
    // Outline: Neumorphic base, red border and text
    outline: `${neumorphicExtrudedBase} text-brand-accent border border-brand-accent hover:border-brand-accent-hover hover:text-brand-accent-hover focus:ring-brand-accent`,
    // Ghost: Transparent, red text on hover, subtle bg change
    ghost: `bg-transparent text-brand-text-secondary hover:text-brand-accent focus:ring-brand-accent shadow-none hover:bg-brand-bg-secondary/50 active:bg-brand-bg-secondary`,
  };
  
  const currentVariantStyle = variantStylesConfig[variant];

  const sizeStyles = {
    sm: `px-3.5 py-2 text-sm ${iconOnly ? 'p-2' : ''}`,
    md: `px-5 py-2.5 text-base ${iconOnly ? 'p-2.5' : ''}`,
    lg: `px-7 py-3.5 text-lg ${iconOnly ? 'p-3' : ''}`,
  };

  const widthStyles = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseStyles} ${currentVariantStyle} ${sizeStyles[size]} ${widthStyles} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && (
        <svg className={`animate-spin h-5 w-5 text-current ${children ? '-ml-1 mr-3' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};