/** Category accents stay monochrome-adjacent so the app doesn't go green/teal. */
const NEUTRAL = {
  text: 'text-white/80',
  bg: 'bg-white',
  border: 'border-white/25',
  borderHover: 'hover:border-white/50',
  bgMuted: 'bg-white/[0.06]',
  textMuted: 'text-white/55',
  accentGlow: 'hover:border-white/30',
  bgHover: 'hover:bg-white/90',
  bgHoverMuted: 'hover:bg-white/10',
} as const;

export type CategoryColorClasses = typeof NEUTRAL;

/**
 * Resolve monochrome category accent classes.
 * Accepts null/undefined/non-string and always returns a full class set
 * so callers never need optional chaining on the result.
 */
export const getCategoryColorClasses = (
  categoryId?: string | null,
): CategoryColorClasses => {
  // Keep switch for API compat; all map to the same neutral system.
  // Coerce so accidental non-strings never throw in the switch.
  const id = typeof categoryId === 'string' ? categoryId : '';
  switch (id) {
    case 'constitutional':
    case 'public_international_law':
    case 'criminal':
    case 'international_criminal_law':
    case 'commercial':
    case 'international_arbitration':
    case 'family':
    case 'labor':
    case 'international_human_rights':
    case 'property':
    case 'law_of_the_sea':
    case 'ipr_in':
    case 'international_ip_law':
    case 'environmental_in':
    case 'international_environmental_law':
    default:
      return NEUTRAL;
  }
};
