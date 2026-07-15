/** @type {import('tailwindcss').Config} */
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
        'brand-bg-primary': '#0c0c0d', 'brand-bg-secondary': '#141416', 'brand-bg-tertiary': '#1c1c1f', 'brand-bg-dark': '#0c0c0d', 'brand-bg-dark-secondary': '#101012',
        'brand-text-primary': '#f2f0ec', 'brand-text-secondary': '#8f8b84', 'brand-accent': '#e8e4dc', 'brand-accent-hover': '#f5f2eb', 'brand-accent-text': '#0c0c0d', 'brand-accent-muted': 'rgba(232, 228, 220, 0.08)',
        'brand-gradient-from': '#e8e4dc', 'brand-gradient-mid': '#d0cbc2', 'brand-gradient-to': '#a8a39a', 'brand-border': '#2a2a2e', 'brand-border-light': '#3a3a40', 'brand-error': '#d48a92', 'brand-success': '#9a968e',
        'brand-navy': '#0c0c0d', 'brand-navy-light': '#141416', 'brand-amber': '#c9c4ba', 'brand-rust': '#b8a99c', 'brand-emerald': '#a8a6a0', 'brand-terracotta': '#b8ada6', 'brand-cobalt': '#a8aeb6', 'brand-sage': '#a6a49e', 'brand-concrete': '#94918c',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], serif: ['Playfair Display', 'Georgia', 'serif'], mono: ['JetBrains Mono', 'ui-monospace', 'monospace'] },
      borderRadius: { sm: '4px', DEFAULT: '6px', md: '8px', lg: '10px', xl: '12px' },
      boxShadow: { 'glow-accent': '0 0 0 1px rgba(139, 115, 85, 0.25), 0 4px 14px rgba(0,0,0,0.08)', 'glow-accent-sm': '0 0 0 1px rgba(139, 115, 85, 0.15)', card: '0 2px 12px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', 'card-hover': '0 6px 24px rgba(0,0,0,0.10), 0 0 0 1px rgba(139, 115, 85, 0.15)', 'inner-subtle': 'inset 0 1px 2px rgba(0,0,0,0.05)' },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } }, fadeInUp: { '0%': { opacity: '0', transform: 'translateY(24px)' }, '100%': { transform: 'translateY(0)' } }, slideInUp: { '0%': { transform: 'translateY(20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } }, slideInLeft: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
        'staggered-fade-in-item': { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { transform: 'translateY(0)' } }, shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } }, float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } }, pulse_ring: { '0%': { transform: 'scale(0.95)', opacity: '0.7' }, '50%': { transform: 'scale(1)', opacity: '1' }, '100%': { transform: 'scale(0.95)', opacity: '0.7' } }, scaleSpin: { '0%': { transform: 'rotate(0deg) scale(1)' }, '50%': { transform: 'rotate(180deg) scale(1.1)' }, '100%': { transform: 'rotate(360deg) scale(1)' } },
      },
      animation: { fadeIn: 'fadeIn 0.6s ease-out', fadeInUp: 'fadeInUp 0.7s ease-out', slideInUp: 'slideInUp 0.5s ease-out', slideInLeft: 'slideInLeft 0.3s ease-out forwards', 'staggered-fade-in-item': 'staggered-fade-in-item 0.6s ease-out forwards', shimmer: 'shimmer 2.5s linear infinite', float: 'float 3s ease-in-out infinite', pulse_ring: 'pulse_ring 2s ease-in-out infinite', scaleSpin: 'scaleSpin 8s linear infinite' },
      backgroundImage: { 'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))' },
    },
  },
  plugins: [],
};
