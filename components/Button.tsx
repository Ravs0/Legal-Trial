import React from 'react';

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
  categoryId: _categoryId,
  ...props
}) => {
  void _categoryId;
  const base =
    'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-45 disabled:cursor-not-allowed min-h-[40px] sm:min-h-0';

  const variants = {
    primary: 'bg-brand-text-primary text-brand-bg-primary hover:bg-white border border-transparent',
    secondary: 'bg-transparent text-brand-text-primary border border-brand-border hover:bg-white/[0.04]',
    danger: 'bg-transparent text-brand-error border border-brand-error/40 hover:bg-brand-error/10',
    outline: 'bg-transparent text-brand-text-primary border border-brand-border hover:bg-white/[0.04]',
    ghost: 'bg-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-white/[0.04] border border-transparent',
  };

  const sizes = {
    sm: `px-3 py-1.5 text-[12px] ${iconOnly ? 'p-1.5' : ''}`,
    md: `px-4 py-2 text-[13px] ${iconOnly ? 'p-2' : ''}`,
    lg: `px-5 py-2.5 text-[14px] ${iconOnly ? 'p-2.5' : ''}`,
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && (
        <svg className={`animate-spin h-4 w-4 ${children ? 'mr-2' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      <span className="inline-flex items-center justify-center gap-2">{children}</span>
    </button>
  );
};
