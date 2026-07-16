import { useState, useEffect, useRef, useCallback } from 'react';

interface TimerOptions {
  durationSeconds: number;
  onTick?: (remainingSeconds: number) => void;
  onEnd?: () => void;
  autoStart?: boolean;
}

/** Clamp to a finite non-negative integer second count. */
function normalizeDuration(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function finiteElapsed(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

/**
 * Wall-clock countdown timer.
 *
 * - Callbacks (`onTick` / `onEnd`) are stored in refs so parent identity
 *   changes never restart the interval (stale-closure safe).
 * - Interval is cleared on pause, reset, duration change, and unmount.
 * - setState is skipped when the displayed second is unchanged (avoids
 *   re-render storms every 250ms).
 * - `onEnd` / setState are suppressed after unmount.
 */
export const useTimer = ({ durationSeconds, onTick, onEnd, autoStart = true }: TimerOptions) => {
  const duration = normalizeDuration(durationSeconds);
  const [remainingSeconds, setRemainingSeconds] = useState(duration);
  const [isRunning, setIsRunning] = useState(Boolean(autoStart) && duration > 0);

  const timerRef = useRef<number | null>(null);
  const endAtRef = useRef<number | null>(
    autoStart && duration > 0 ? Date.now() + duration * 1000 : null,
  );
  const pausedRemainingRef = useRef(duration);
  const remainingDisplayRef = useRef(duration);
  const endedOnceRef = useRef(false);
  const mountedRef = useRef(true);

  // Stable callback refs — never put onTick/onEnd in effect deps.
  const onTickRef = useRef(onTick);
  const onEndRef = useRef(onEnd);
  onTickRef.current = onTick;
  onEndRef.current = onEnd;

  const stopInterval = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const applyRemaining = useCallback((nextRemaining: number, opts?: { fromTick?: boolean }) => {
    const clamped = Math.max(0, nextRemaining);
    pausedRemainingRef.current = clamped;

    const changed = remainingDisplayRef.current !== clamped;
    if (changed) {
      remainingDisplayRef.current = clamped;
      if (mountedRef.current) {
        setRemainingSeconds(clamped);
      }
      if (opts?.fromTick) {
        onTickRef.current?.(clamped);
      }
    }

    if (clamped <= 0 && !endedOnceRef.current) {
      endedOnceRef.current = true;
      stopInterval();
      endAtRef.current = null;
      if (mountedRef.current) {
        setIsRunning(false);
        // Fire end only while still mounted — callers often navigate/unmount.
        onEndRef.current?.();
      }
    }
  }, [stopInterval]);

  const syncRemaining = useCallback(() => {
    if (!endAtRef.current) return;
    const nextRemaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
    applyRemaining(nextRemaining, { fromTick: true });
  }, [applyRemaining]);

  // Track mount lifetime for leak-safe setState / callbacks.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopInterval();
      endAtRef.current = null;
    };
  }, [stopInterval]);

  // Reset when duration or autoStart policy changes.
  useEffect(() => {
    const next = normalizeDuration(durationSeconds);
    endedOnceRef.current = false;
    remainingDisplayRef.current = next;
    pausedRemainingRef.current = next;
    if (mountedRef.current) {
      setRemainingSeconds(next);
    }
    if (autoStart && next > 0) {
      endAtRef.current = Date.now() + next * 1000;
      if (mountedRef.current) setIsRunning(true);
    } else {
      endAtRef.current = null;
      if (mountedRef.current) setIsRunning(false);
      stopInterval();
    }
  }, [autoStart, durationSeconds, stopInterval]);

  // Drive the interval from isRunning only. Callbacks live in refs.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!isRunning) {
      stopInterval();
      return;
    }
    if (pausedRemainingRef.current <= 0) {
      if (mountedRef.current) setIsRunning(false);
      return;
    }
    if (!endAtRef.current) {
      endAtRef.current = Date.now() + pausedRemainingRef.current * 1000;
    }
    // Immediate sync so UI is correct before first interval fire.
    syncRemaining();
    timerRef.current = window.setInterval(syncRemaining, 250);
    return stopInterval;
  }, [isRunning, stopInterval, syncRemaining]);

  const start = useCallback(
    (elapsedSeconds = 0) => {
      const total = normalizeDuration(durationSeconds);
      const elapsed = Math.max(0, finiteElapsed(elapsedSeconds));
      endedOnceRef.current = false;

      if (total <= 0) {
        pausedRemainingRef.current = 0;
        remainingDisplayRef.current = 0;
        endAtRef.current = null;
        if (mountedRef.current) {
          setRemainingSeconds(0);
          setIsRunning(false);
        }
        return;
      }

      if (elapsed > 0) {
        const left = Math.max(0, total - elapsed);
        pausedRemainingRef.current = left;
        remainingDisplayRef.current = left;
        if (mountedRef.current) setRemainingSeconds(left);
      }

      // Fresh start when exhausted (or after a completed run).
      if (pausedRemainingRef.current <= 0) {
        pausedRemainingRef.current = total;
        remainingDisplayRef.current = total;
        if (mountedRef.current) setRemainingSeconds(total);
      }

      endAtRef.current = Date.now() + pausedRemainingRef.current * 1000;
      if (mountedRef.current) setIsRunning(true);
    },
    [durationSeconds],
  );

  const pause = useCallback(() => {
    if (endAtRef.current) {
      const left = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      pausedRemainingRef.current = left;
      remainingDisplayRef.current = left;
      if (mountedRef.current) setRemainingSeconds(left);
    }
    endAtRef.current = null;
    stopInterval();
    if (mountedRef.current) setIsRunning(false);
  }, [stopInterval]);

  const reset = useCallback(() => {
    const total = normalizeDuration(durationSeconds);
    stopInterval();
    endAtRef.current = null;
    endedOnceRef.current = false;
    pausedRemainingRef.current = total;
    remainingDisplayRef.current = total;
    if (mountedRef.current) {
      setRemainingSeconds(total);
      setIsRunning(false);
    }
  }, [durationSeconds, stopInterval]);

  const safeRemaining = Math.max(0, remainingSeconds);
  const minutes = Math.floor(safeRemaining / 60);
  const seconds = safeRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return {
    remainingSeconds: safeRemaining,
    isRunning,
    start,
    pause,
    reset,
    formattedTime,
  };
};
