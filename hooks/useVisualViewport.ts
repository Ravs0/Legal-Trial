import { useState, useEffect, useMemo, useRef } from 'react';

export interface VisualViewportOptions {
  /** Width threshold for `isMobile` (default 768). */
  breakpoint?: number;
  /** Optional fixed chrome deducted on mobile. */
  mobileOffset?: number;
  /** Optional fixed chrome deducted on desktop. */
  desktopOffset?: number;
}

export interface VisualViewportState {
  /** Keyboard-aware content height (viewportHeight − chrome offset). */
  vpHeight: number;
  /** Live visual viewport height (vv.height only), floored at 320. */
  viewportHeight: number;
  /** visualViewport.offsetTop — non-zero when the layout is shifted by the keyboard. */
  keyboardOffsetTop: number;
  isMobile: boolean;
}

type RawViewport = {
  width: number;
  height: number;
  offsetTop: number;
};

function finitePositive(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function finiteNonNeg(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function readViewport(): RawViewport {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 800, offsetTop: 0 };
  }

  const vv = window.visualViewport;
  const offsetTop = vv && Number.isFinite(vv.offsetTop) ? vv.offsetTop : 0;

  return {
    width: Math.max(0, window.innerWidth || 0),
    height: Math.max(0, vv?.height ?? window.innerHeight ?? 0),
    offsetTop: Math.max(0, offsetTop),
  };
}

function sameViewport(a: RawViewport, b: RawViewport): boolean {
  return a.width === b.width && a.height === b.height && a.offsetTop === b.offsetTop;
}

/**
 * Canonical viewport hook. Returns the live visible viewport height and a
 * keyboard-aware content height that screens can use to stay readable while
 * typing on mobile.
 *
 * **Variant history** — this was copy-pasted with slight differences into 5
 * separate files (PracticeArena, AIPersonasScreen, DreadlerArenaScreen,
 * StrategyRoomScreen, WebSearchDrawer). This is the single source replacing
 * all of them.
 *
 * Cleanup / stale-state guarantees:
 * - Event listeners removed on unmount (resize, scroll, orientationchange).
 * - Pending rAF / orientation timeout cancelled on unmount.
 * - setState suppressed after unmount and when dimensions are unchanged.
 */
export function useVisualViewport(options?: VisualViewportOptions): VisualViewportState {
  const breakpoint = finitePositive(options?.breakpoint, 768);
  const mobileOffset = finiteNonNeg(options?.mobileOffset, 0);
  const desktopOffset = finiteNonNeg(options?.desktopOffset, 0);

  const [{ width, height, offsetTop }, setViewport] = useState<RawViewport>(readViewport);
  // Keep a ref mirror so the event handler can bail without stale closures
  // forcing an extra render just to compare.
  const latestRef = useRef<RawViewport>({ width, height, offsetTop });
  latestRef.current = { width, height, offsetTop };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let rafId: number | null = null;
    let orientationTimer: ReturnType<typeof setTimeout> | null = null;

    const commit = (next: RawViewport) => {
      if (cancelled) return;
      if (sameViewport(latestRef.current, next)) return;
      latestRef.current = next;
      setViewport(next);
    };

    const update = () => {
      commit(readViewport());
    };

    // orientationchange often fires before the visual viewport settles (iOS).
    const updateAfterOrientation = () => {
      if (orientationTimer != null) clearTimeout(orientationTimer);
      orientationTimer = setTimeout(() => {
        orientationTimer = null;
        if (cancelled) return;
        if (rafId != null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = null;
          update();
        });
      }, 100);
    };

    update();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', updateAfterOrientation);

    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (orientationTimer != null) clearTimeout(orientationTimer);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', updateAfterOrientation);
    };
    // Subscribe once for the component lifetime. breakpoint/offsets only
    // affect derived values computed during render.
  }, []);

  const isMobile = width < breakpoint;
  const chromeOffset = isMobile ? mobileOffset : desktopOffset;
  // Visible visualViewport height only. Adding offsetTop re-inflates height when
  // iOS scrolls for a focused field and fights keyboard-aware shells / composers.
  const viewportHeight = Math.max(320, Math.round(height));
  const contentHeight = Math.max(240, viewportHeight - chromeOffset);

  return useMemo(
    () => ({
      vpHeight: contentHeight,
      viewportHeight,
      keyboardOffsetTop: offsetTop,
      isMobile,
    }),
    [contentHeight, isMobile, offsetTop, viewportHeight],
  );
}
