
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
  // Fix: Changed NodeJS.Timeout to number for browser compatibility
  const timerRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    setRemainingSeconds(prev => {
      const newRemaining = prev - 1;
      if (onTick) {
        onTick(newRemaining);
      }
      if (newRemaining <= 0) {
        setIsRunning(false);
        if (timerRef.current) clearInterval(timerRef.current);
        if (onEnd) {
          onEnd();
        }
        return 0;
      }
      return newRemaining;
    });
  }, [onTick, onEnd]);

  useEffect(() => {
    if (isRunning && remainingSeconds > 0) {
      timerRef.current = setInterval(tick, 1000) as unknown as number; // Cast because setInterval can return NodeJS.Timeout or number
    } else if (!isRunning && timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning, remainingSeconds, tick]);

  useEffect(() => {
    // Reset remaining seconds if duration changes
    setRemainingSeconds(durationSeconds);
  }, [durationSeconds]);

  const start = useCallback(() => {
    if (remainingSeconds <= 0) setRemainingSeconds(durationSeconds); // Reset if ended
    setIsRunning(true);
  }, [durationSeconds, remainingSeconds]);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setRemainingSeconds(durationSeconds);
  }, [durationSeconds]);

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
