/** @type {import('tailwindcss').Config} */
/* design.md Paper Dossier: paper #f7f4ee / #fdfcf9 / #efeae1 · ink #1c1914 / #5f594e · rule #ddd6c8 · clerk-red #8a2b23.
   Dark surfaces exist ONLY inside the Deception Arena (hardcoded there, not via these tokens). */
module.exports = {
  content: ['./index.html', './{components,hooks,screens,services,vision}/**/*.{ts,tsx}', './App.tsx', './index.tsx'],
  safelist: [
    'text-white/80', 'text-white/55', 'bg-white', 'bg-white/[0.06]', 'border-white/25',
    'hover:border-white/50', 'hover:border-white/30', 'hover:bg-white/90', 'hover:bg-white/10', 'hover:bg-white/[0.06]',
    'group-hover:text-white/80', 'group-hover:bg-white', 'group-hover:border-white/25',
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces (design.md paper ladder)
        'brand-bg-primary': '#f7f4ee',
        'brand-bg-secondary': '#fdfcf9',
        'brand-bg-tertiary': '#efeae1',
        // Kept for legacy references; the arena hardcodes its own blacks.
        'brand-bg-dark': '#12100c',
        'brand-bg-dark-secondary': '#1a1712',
        // Type
        'brand-text-primary': '#1c1914',
        'brand-text-secondary': '#5f594e',
        // Accent = the clerk's red pen (rare, meaningful)
        'brand-accent': '#8a2b23',
        'brand-accent-hover': '#6f211b',
        'brand-accent-text': '#f7f4ee',
        'brand-accent-muted': 'rgba(138, 43, 35, 0.08)',
        // Gradient family = ink
        'brand-gradient-from': '#1c1914',
        'brand-gradient-mid': '#5f594e',
        'brand-gradient-to': '#8f887a',
        // Structure
        'brand-border': '#ddd6c8',
        'brand-border-light': '#cbc3b2',
        // Status: success neutral; error is the clerk-red family
        'brand-error': '#8a2b23',
        'brand-success': '#5f594e',
        // Aliases + category tokens (muted warm inks; no forest map)
        'brand-navy': '#1c1914',
        'brand-navy-light': '#3a352c',
        'brand-amber': '#7a5c12',
        'brand-rust': '#8a4a2b',
        'brand-emerald': '#5f594e',
        'brand-terracotta': '#96502e',
        'brand-cobalt': '#3d4a63',
        'brand-sage': '#5d614a',
        'brand-concrete': '#8f887a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4"', '"Iowan Old Style"', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: { sm: '2px', DEFAULT: '3px', md: '4px', lg: '6px', xl: '8px' },
      boxShadow: {
        'glow-accent': '0 0 0 1px rgba(28, 25, 20, 0.12)',
        'glow-accent-sm': '0 0 0 1px rgba(28, 25, 20, 0.08)',
        card: 'none',
        'card-hover': '0 0 0 1px rgba(28, 25, 20, 0.18)',
        'inner-subtle': 'inset 0 0 0 1px rgba(28, 25, 20, 0.05)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeInUp: { '0%': { opacity: '0', transform: 'translateY(24px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInUp: { '0%': { transform: 'translateY(20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        slideInLeft: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
        'staggered-fade-in-item': { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        pulse_ring: { '0%': { transform: 'scale(0.95)', opacity: '0.7' }, '50%': { transform: 'scale(1)', opacity: '1' }, '100%': { transform: 'scale(0.95)', opacity: '0.7' } },
        scaleSpin: { '0%': { transform: 'rotate(0deg) scale(1)' }, '50%': { transform: 'rotate(180deg) scale(1.1)' }, '100%': { transform: 'rotate(360deg) scale(1)' } },
      },
      animation: {
        fadeIn: 'fadeIn 0.6s ease-out',
        fadeInUp: 'fadeInUp 0.7s ease-out',
        slideInUp: 'slideInUp 0.5s ease-out',
        slideInLeft: 'slideInLeft 0.3s ease-out forwards',
        'staggered-fade-in-item': 'staggered-fade-in-item 0.6s ease-out forwards',
        shimmer: 'shimmer 2.5s linear infinite',
        float: 'float 3s ease-in-out infinite',
        pulse_ring: 'pulse_ring 2s ease-in-out infinite',
        scaleSpin: 'scaleSpin 8s linear infinite',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};
