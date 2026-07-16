/** @type {import('tailwindcss').Config} */
/* design.md monochrome: #0a0a0a / #111 / #1a1a1a · text #e8e6e3 / #9a9690 · accent #c4bfb6 · border #2a2a2a · no gold/green glow */
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
        // Surfaces (design.md bg ladder)
        'brand-bg-primary': '#0a0a0a',
        'brand-bg-secondary': '#111111',
        'brand-bg-tertiary': '#1a1a1a',
        'brand-bg-dark': '#0a0a0a',
        'brand-bg-dark-secondary': '#111111',
        // Type
        'brand-text-primary': '#e8e6e3',
        'brand-text-secondary': '#9a9690',
        // Accent = warm gray only (rare highlight; primary CTA is white/black)
        'brand-accent': '#c4bfb6',
        'brand-accent-hover': '#d4cfc6',
        'brand-accent-text': '#0a0a0a',
        'brand-accent-muted': 'rgba(196, 191, 182, 0.08)',
        // Gradients stay monochrome (no cream/brass)
        'brand-gradient-from': '#c4bfb6',
        'brand-gradient-mid': '#9a9690',
        'brand-gradient-to': '#6e6a64',
        // Structure
        'brand-border': '#2a2a2a',
        'brand-border-light': '#3a3a3a',
        // Status: success = neutral gray (not traffic-light green)
        'brand-error': '#b8a4a6',
        'brand-success': '#9a9690',
        // Aliases + category tokens (all monochrome; no emerald/sage forest map)
        'brand-navy': '#0a0a0a',
        'brand-navy-light': '#111111',
        'brand-amber': '#c4bfb6',
        'brand-rust': '#b0aaa2',
        'brand-emerald': '#9a9690',
        'brand-terracotta': '#a8a29a',
        'brand-cobalt': '#a6a6a6',
        'brand-sage': '#9a9690',
        'brand-concrete': '#7a7670',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      // design.md: prefer square / minimal radius
      borderRadius: { sm: '2px', DEFAULT: '4px', md: '6px', lg: '8px', xl: '10px' },
      // Borders over lift; no gold/brass (139,115,85) or green glow on CTAs
      boxShadow: {
        'glow-accent': '0 0 0 1px rgba(255, 255, 255, 0.12)',
        'glow-accent-sm': '0 0 0 1px rgba(255, 255, 255, 0.08)',
        card: 'none',
        'card-hover': '0 0 0 1px rgba(255, 255, 255, 0.10)',
        'inner-subtle': 'inset 0 0 0 1px rgba(255, 255, 255, 0.04)',
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
