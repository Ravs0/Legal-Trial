import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
  iconOnly?: boolean;
  /** @deprecated Kept for call-site compat; monochrome system ignores category tint. */
  categoryId?: string;
}

/**
 * Flat monochrome CTAs (design.md):
 * - primary = white fill / black text
 * - no glow, lift shadow, or color cast
 * - minimal radius
 */
export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  iconOnly = false,
  className = '',
  categoryId: _categoryId,
  type = 'button',
  ...props
}) => {
  void _categoryId;
  const base =
    'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-150 ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-text-primary/30 focus-visible:ring-offset-0 ' +
    'disabled:opacity-45 disabled:cursor-not-allowed min-h-11 sm:min-h-0 select-none';

  // Primary hierarchy: white on black. Secondary/outline share a border stroke. No shadows.
  const variants = {
    primary:
      'bg-brand-text-primary text-brand-bg-primary border border-brand-text-primary hover:bg-[#3a352c] active:bg-[#3a352c]',
    secondary:
      'bg-transparent text-brand-text-primary border border-brand-border hover:bg-brand-text-primary/[0.05] hover:border-brand-border-light active:bg-brand-text-primary/[0.08]',
    danger:
      'bg-transparent text-brand-error border border-brand-error/40 hover:bg-brand-error/10 active:bg-brand-error/15',
    outline:
      'bg-transparent text-brand-text-primary border border-brand-border hover:bg-brand-text-primary/[0.05] hover:border-brand-border-light active:bg-brand-text-primary/[0.08]',
    ghost:
      'bg-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-text-primary/[0.05] border border-transparent active:bg-brand-text-primary/[0.08]',
  };

  const sizes = {
    sm: `px-3 py-1.5 text-[12px] ${iconOnly ? 'p-1.5' : ''}`,
    md: `px-4 py-2 text-[13px] ${iconOnly ? 'p-2' : ''}`,
    lg: `px-5 py-2.5 text-[14px] ${iconOnly ? 'p-2.5' : ''}`,
  };

  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={isLoading || props.disabled}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && (
        <svg
          className={`animate-spin h-4 w-4 ${children ? 'mr-2' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      <span className="inline-flex items-center justify-center gap-2">{children}</span>
    </button>
  );
};
