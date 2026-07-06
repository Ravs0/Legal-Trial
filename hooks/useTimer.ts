
import { useState, useEffect, useRef, useCallback } from 'react';

interface TimerOptions {
  durationSeconds: number;
  onTick?: (remainingSeconds: number) => void;
  onEnd?: () => void;
  autoStart?: boolean;
}

export const useTimer = ({ durationSeconds, onTick, onEnd, autoStart = true }: TimerOptions) => {
  const [remainingSeconds, setRemainingSeconds] = useState(durationSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const timerRef = useRef<number | null>(null);
  const endAtRef = useRef<number | null>(autoStart ? Date.now() + durationSeconds * 1000 : null);
  const pausedRemainingRef = useRef(durationSeconds);

  const stopInterval = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const syncRemaining = useCallback(() => {
    if (!endAtRef.current) return;
    const nextRemaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
    pausedRemainingRef.current = nextRemaining;
    setRemainingSeconds(nextRemaining);
    if (onTick) {
      onTick(nextRemaining);
    }
    if (nextRemaining <= 0) {
      stopInterval();
      setIsRunning(false);
      endAtRef.current = null;
      if (onEnd) {
        onEnd();
      }
    }
  }, [onEnd, onTick, stopInterval]);

  useEffect(() => {
    pausedRemainingRef.current = durationSeconds;
    setRemainingSeconds(durationSeconds);
    if (autoStart) {
      endAtRef.current = Date.now() + durationSeconds * 1000;
      setIsRunning(true);
    } else {
      endAtRef.current = null;
      setIsRunning(false);
      stopInterval();
    }
  }, [autoStart, durationSeconds, stopInterval]);

  useEffect(() => {
    if (!isRunning) {
      stopInterval();
      return;
    }
    if (!endAtRef.current) {
      endAtRef.current = Date.now() + pausedRemainingRef.current * 1000;
    }
    syncRemaining();
    timerRef.current = window.setInterval(syncRemaining, 250);
    return stopInterval;
  }, [isRunning, stopInterval, syncRemaining]);

  const start = useCallback(() => {
    if (pausedRemainingRef.current <= 0) {
      pausedRemainingRef.current = durationSeconds;
      setRemainingSeconds(durationSeconds);
    }
    endAtRef.current = Date.now() + pausedRemainingRef.current * 1000;
    setIsRunning(true);
  }, [durationSeconds]);

  const pause = useCallback(() => {
    if (endAtRef.current) {
      pausedRemainingRef.current = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setRemainingSeconds(pausedRemainingRef.current);
    }
    endAtRef.current = null;
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    stopInterval();
    endAtRef.current = null;
    pausedRemainingRef.current = durationSeconds;
    setRemainingSeconds(durationSeconds);
    setIsRunning(false);
  }, [durationSeconds, stopInterval]);

  const formattedTime = (): string => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return {
    remainingSeconds,
    isRunning,
    start,
    pause,
    reset,
    formattedTime: formattedTime(),
  };
};
