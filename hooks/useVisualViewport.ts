import { useState, useEffect } from 'react';

/**
 * Canonical viewport hook. Returns the visible height adjusted for mobile
 * keyboard overlap (iOS Safari floating toolbar), plus an `isMobile` flag.
 *
 * **Variant history** — this was copy-pasted with slight differences into 5
 * separate files (PracticeArena, AIPersonasScreen, DreadlerArenaScreen,
 * StrategyRoomScreen, WebSearchDrawer). This is the single source replacing
 * all of them.
 *
 * @param options.breakpoint   Width threshold for `isMobile`  (default 768).
 * @param options.mobileOffset Pixels subtracted on mobile     (default 80).
 * @param options.desktopOffsetPixels subtracted on desktop   (default 0).
 */
export function useVisualViewport(options?: {
  breakpoint?: number;
  mobileOffset?: number;
  desktopOffset?: number;
}) {
  const {
    breakpoint = 768,
    mobileOffset = 80,
    desktopOffset = 0,
  } = options ?? {};

  const [vpHeight, setVpHeight] = useState(
    () =>
      typeof window !== 'undefined'
        ? window.visualViewport?.height ?? window.innerHeight
        : 800,
  );
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== 'undefined'
        ? window.innerWidth < breakpoint
        : false,
  );

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      setVpHeight(vv.height);
      setIsMobile(window.innerWidth < breakpoint);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [breakpoint]);

  const adjustedHeight = isMobile ? vpHeight - mobileOffset : vpHeight - desktopOffset;

  return { vpHeight: adjustedHeight, isMobile };
}
