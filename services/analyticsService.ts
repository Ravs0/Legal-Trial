type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export interface AnalyticsEvent {
  id: string;
  name: string;
  timestamp: string;
  properties: Record<string, string | number | boolean | null>;
}

const ANALYTICS_KEY = 'lexforge.analytics-events';
const MAX_EVENTS = 100;

const isBrowser = typeof window !== 'undefined';

const cleanProperties = (properties: AnalyticsProperties = {}) => {
  const safe: AnalyticsEvent['properties'] = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    safe[key] = value;
  }
  return safe;
};

export const getRecentEvents = (): AnalyticsEvent[] => {
  if (!isBrowser) return [];
  try {
    const raw = window.localStorage.getItem(ANALYTICS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const trackEvent = (name: string, properties: AnalyticsProperties = {}) => {
  if (!isBrowser) return;

  const event: AnalyticsEvent = {
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    timestamp: new Date().toISOString(),
    properties: cleanProperties(properties),
  };

  const nextEvents = [...getRecentEvents(), event].slice(-MAX_EVENTS);
  try {
    window.localStorage.setItem(ANALYTICS_KEY, JSON.stringify(nextEvents));
  } catch {
    // Analytics must never break the product flow.
  }

  if (import.meta.env.DEV) {
    console.info('[LexForge analytics]', event.name, event.properties);
  }
};
