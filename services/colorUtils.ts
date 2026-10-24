/** Category treatments use the daylight workspace's ink and paper tokens. */
const NEUTRAL = {
  text: 'text-brand-text-primary',
  bg: 'bg-brand-text-primary',
  border: 'border-brand-border',
  borderHover: 'hover:border-brand-border-light',
  bgMuted: 'bg-brand-text-primary/[0.05]',
  textMuted: 'text-brand-text-secondary',
  accentGlow: 'hover:border-brand-border-light',
  bgHover: 'hover:bg-brand-navy-light',
  bgHoverMuted: 'hover:bg-brand-bg-tertiary',
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
