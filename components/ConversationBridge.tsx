import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { saveGenericState, readGenericState, STORAGE_KEYS } from '../services/storageService';

export interface BridgeMessage {
  id: string;
  source: string;
  sourceName: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface ConversationBridgeContextType {
  recentMessages: BridgeMessage[];
  addMessage: (msg: Omit<BridgeMessage, 'id' | 'timestamp'>) => void;
  getConversationSummary: () => string;
  /** True when any bridge traffic exists within the given window (default 2 min). */
  hasRecentActivity: (withinMs?: number) => boolean;
  lastActivity: { source: string; sourceName: string; timestamp: number } | null;
}

const MAX_MESSAGES = 20;
const SUMMARY_COUNT = 8;
const DEFAULT_ACTIVITY_WINDOW_MS = 120_000;
const MAX_TEXT_CHARS = 180;
const EMPTY_SUMMARY = 'Cross-module summary: none.';

const ConversationBridgeContext = createContext<ConversationBridgeContextType | null>(null);

const sanitizeBridgeText = (value: string): string => {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>`{}\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const ConversationBridgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recentMessages, setRecentMessages] = useState<BridgeMessage[]>(() => {
    const saved = readGenericState<BridgeMessage[]>(STORAGE_KEYS.bridgeMessages);
    if (!Array.isArray(saved)) return [];
    // Drop empty or corrupted rows from storage; keep newest first-cap.
    return saved
      .filter((m): m is BridgeMessage =>
        Boolean(m && typeof m.text === 'string' && m.text.trim() && typeof m.timestamp === 'number'),
      )
      .slice(-MAX_MESSAGES);
  });
  const counterRef = useRef(0);

  const addMessage = useCallback((msg: Omit<BridgeMessage, 'id' | 'timestamp'>) => {
    const text = sanitizeBridgeText(msg.text);
    if (!text || text.length < 2) return;

    const source = sanitizeBridgeText(msg.source).slice(0, 64) || 'module';
    const sourceName = sanitizeBridgeText(msg.sourceName).slice(0, 64) || source;

    const newMsg: BridgeMessage = {
      source,
      sourceName,
      sender: msg.sender === 'user' ? 'user' : 'ai',
      text: text.slice(0, MAX_TEXT_CHARS * 2),
      id: `bridge-${Date.now()}-${counterRef.current++}`,
      timestamp: Date.now(),
    };

    setRecentMessages(prev => {
      // Collapse near-duplicate consecutive posts (same source + same text).
      const last = prev[prev.length - 1];
      if (
        last &&
        last.source === newMsg.source &&
        last.sender === newMsg.sender &&
        last.text === newMsg.text &&
        newMsg.timestamp - last.timestamp < 4_000
      ) {
        return prev;
      }
      const updated = [...prev, newMsg];
      return updated.length > MAX_MESSAGES ? updated.slice(-MAX_MESSAGES) : updated;
    });
  }, []);

  // Persist bridge messages (debounced).
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      saveGenericState(STORAGE_KEYS.bridgeMessages, recentMessages);
    }, 600);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [recentMessages]);

  const getConversationSummary = useCallback((): string => {
    if (recentMessages.length === 0) return EMPTY_SUMMARY;

    const slice = recentMessages.slice(-SUMMARY_COUNT);
    const grouped = new Map<string, BridgeMessage[]>();
    for (const msg of slice) {
      const key = msg.sourceName || msg.source;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(msg);
    }

    const lines: string[] = ['Cross-module summary (sanitized plain text):'];

    for (const [sourceName, msgs] of grouped) {
      lines.push(`Source=${sourceName}`);
      for (const m of msgs) {
        const role = m.sender === 'user' ? 'User' : sourceName;
        const text = sanitizeBridgeText(m.text).slice(0, MAX_TEXT_CHARS);
        lines.push(`- ${role}: ${text}`);
      }
    }

    return lines.join('\n');
  }, [recentMessages]);

  const hasRecentActivity = useCallback(
    (withinMs: number = DEFAULT_ACTIVITY_WINDOW_MS): boolean => {
      if (recentMessages.length === 0) return false;
      const last = recentMessages[recentMessages.length - 1];
      return Date.now() - last.timestamp < withinMs;
    },
    [recentMessages],
  );

  const lastActivity =
    recentMessages.length > 0
      ? {
          source: recentMessages[recentMessages.length - 1].source,
          sourceName: recentMessages[recentMessages.length - 1].sourceName,
          timestamp: recentMessages[recentMessages.length - 1].timestamp,
        }
      : null;

  return (
    <ConversationBridgeContext.Provider
      value={{ recentMessages, addMessage, getConversationSummary, hasRecentActivity, lastActivity }}
    >
      {children}
    </ConversationBridgeContext.Provider>
  );
};

export const useConversationBridge = (): ConversationBridgeContextType => {
  const ctx = useContext(ConversationBridgeContext);
  if (!ctx) {
    throw new Error('useConversationBridge must be used within a ConversationBridgeProvider');
  }
  return ctx;
};

/** Shared empty-summary sentinel for consumers that parse the summary string. */
export const BRIDGE_EMPTY_SUMMARY = EMPTY_SUMMARY;
