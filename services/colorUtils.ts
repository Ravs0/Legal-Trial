export const getCategoryColorClasses = (categoryId: string) => {
  switch (categoryId) {
    case 'constitutional':
    case 'public_international_law':
      return {
        text: 'text-brand-amber',
        bg: 'bg-brand-amber',
        border: 'border-brand-amber',
        borderHover: 'hover:border-brand-amber',
        bgMuted: 'bg-brand-amber/10',
        textMuted: 'text-brand-amber/80',
        accentGlow: 'hover:border-brand-amber/50 hover:shadow-[0_0_15px_rgba(212,154,59,0.15)]',
        bgHover: 'hover:bg-brand-amber/90',
        bgHoverMuted: 'hover:bg-brand-amber/20',
      };
    case 'criminal':
    case 'international_criminal_law':
      return {
        text: 'text-brand-rust',
        bg: 'bg-brand-rust',
        border: 'border-brand-rust',
        borderHover: 'hover:border-brand-rust',
        bgMuted: 'bg-brand-rust/10',
        textMuted: 'text-brand-rust/80',
        accentGlow: 'hover:border-brand-rust/50 hover:shadow-[0_0_15px_rgba(194,89,63,0.15)]',
        bgHover: 'hover:bg-brand-rust/90',
        bgHoverMuted: 'hover:bg-brand-rust/20',
      };
    case 'commercial':
    case 'international_arbitration':
      return {
        text: 'text-brand-emerald',
        bg: 'bg-brand-emerald',
        border: 'border-brand-emerald',
        borderHover: 'hover:border-brand-emerald',
        bgMuted: 'bg-brand-emerald/10',
        textMuted: 'text-brand-emerald/80',
        accentGlow: 'hover:border-brand-emerald/50 hover:shadow-[0_0_15px_rgba(46,125,50,0.15)]',
        bgHover: 'hover:bg-brand-emerald/90',
        bgHoverMuted: 'hover:bg-brand-emerald/20',
      };
    case 'family':
    case 'labor':
    case 'international_human_rights':
      return {
        text: 'text-brand-terracotta',
        bg: 'bg-brand-terracotta',
        border: 'border-brand-terracotta',
        borderHover: 'hover:border-brand-terracotta',
        bgMuted: 'bg-brand-terracotta/10',
        textMuted: 'text-brand-terracotta/80',
        accentGlow: 'hover:border-brand-terracotta/50 hover:shadow-[0_0_15px_rgba(212,106,106,0.15)]',
        bgHover: 'hover:bg-brand-terracotta/90',
        bgHoverMuted: 'hover:bg-brand-terracotta/20',
      };
    case 'property':
    case 'law_of_the_sea':
    case 'ipr_in':
    case 'international_ip_law':
      return {
        text: 'text-brand-cobalt',
        bg: 'bg-brand-cobalt',
        border: 'border-brand-cobalt',
        borderHover: 'hover:border-brand-cobalt',
        bgMuted: 'bg-brand-cobalt/10',
        textMuted: 'text-brand-cobalt/80',
        accentGlow: 'hover:border-brand-cobalt/50 hover:shadow-[0_0_15px_rgba(63,81,181,0.15)]',
        bgHover: 'hover:bg-brand-cobalt/90',
        bgHoverMuted: 'hover:bg-brand-cobalt/20',
      };
    case 'environmental_in':
    case 'international_environmental_law':
      return {
        text: 'text-brand-sage',
        bg: 'bg-brand-sage',
        border: 'border-brand-sage',
        borderHover: 'hover:border-brand-sage',
        bgMuted: 'bg-brand-sage/10',
        textMuted: 'text-brand-sage/80',
        accentGlow: 'hover:border-brand-sage/50 hover:shadow-[0_0_15px_rgba(123,142,120,0.15)]',
        bgHover: 'hover:bg-brand-sage/90',
        bgHoverMuted: 'hover:bg-brand-sage/20',
      };
    default:
      return {
        text: 'text-brand-concrete',
        bg: 'bg-brand-concrete',
        border: 'border-brand-concrete',
        borderHover: 'hover:border-brand-concrete',
        bgMuted: 'bg-brand-concrete/10',
        textMuted: 'text-brand-concrete/80',
        accentGlow: 'hover:border-brand-concrete/50 hover:shadow-[0_0_15px_rgba(209,213,219,0.15)]',
        bgHover: 'hover:bg-brand-concrete/90',
        bgHoverMuted: 'hover:bg-brand-concrete/20',
      };
  }
};
