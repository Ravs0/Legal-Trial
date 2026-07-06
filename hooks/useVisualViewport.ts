import { useState, useEffect, useMemo } from 'react';

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
 * @param options.breakpoint Width threshold for `isMobile` (default 768).
 * @param options.mobileOffset Optional fixed chrome deducted on mobile.
 * @param options.desktopOffset Optional fixed chrome deducted on desktop.
 */
export function useVisualViewport(options?: {
  breakpoint?: number;
  mobileOffset?: number;
  desktopOffset?: number;
}) {
  const {
    breakpoint = 768,
    mobileOffset = 0,
    desktopOffset = 0,
  } = options ?? {};

  const readViewport = () => {
    if (typeof window === 'undefined') {
      return {
        width: 1280,
        height: 800,
        offsetTop: 0,
      };
    }

    const vv = window.visualViewport;
    return {
      width: window.innerWidth,
      height: vv?.height ?? window.innerHeight,
      offsetTop: vv?.offsetTop ?? 0,
    };
  };

  const [{ width, height, offsetTop }, setViewport] = useState(readViewport);

  useEffect(() => {
    const update = () => setViewport(readViewport());
    const vv = window.visualViewport;

    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [breakpoint]);

  const isMobile = width < breakpoint;
  const chromeOffset = isMobile ? mobileOffset : desktopOffset;
  const viewportHeight = Math.max(320, Math.round(height + offsetTop));
  const contentHeight = Math.max(240, viewportHeight - chromeOffset);

  return useMemo(() => ({
    vpHeight: contentHeight,
    viewportHeight,
    keyboardOffsetTop: offsetTop,
    isMobile,
  }), [contentHeight, isMobile, offsetTop, viewportHeight]);
}
