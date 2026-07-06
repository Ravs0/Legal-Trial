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
  lastActivity: { source: string; sourceName: string; timestamp: number } | null;
}

const MAX_MESSAGES = 20;
const SUMMARY_COUNT = 10;

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
    return saved ?? [];
  });
  const counterRef = useRef(0);

  const addMessage = useCallback((msg: Omit<BridgeMessage, 'id' | 'timestamp'>) => {
    const newMsg: BridgeMessage = {
      ...msg,
      text: sanitizeBridgeText(msg.text),
      id: `bridge-${Date.now()}-${counterRef.current++}`,
      timestamp: Date.now(),
    };
    setRecentMessages(prev => {
      const updated = [...prev, newMsg];
      return updated.length > MAX_MESSAGES ? updated.slice(-MAX_MESSAGES) : updated;
    });
  }, []);

  // ─── Persist bridge messages on every change ─────────────────────────
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
    if (recentMessages.length === 0) {
      return 'Cross-module summary: none.';
    }

    const slice = recentMessages.slice(-SUMMARY_COUNT);
    const grouped = new Map<string, BridgeMessage[]>();
    for (const msg of slice) {
      const key = sanitizeBridgeText(msg.sourceName);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(msg);
    }

    const lines: string[] = ['Cross-module summary (sanitized plain text):'];

    for (const [sourceName, msgs] of grouped) {
      lines.push(`Source=${sourceName}`);
      for (const m of msgs) {
        const role = m.sender === 'user' ? 'User' : sourceName;
        const text = sanitizeBridgeText(m.text).slice(0, 220);
        lines.push(`- ${role}: ${text}`);
      }
    }

    return lines.join('\n');
  }, [recentMessages]);

  const lastActivity = recentMessages.length > 0
    ? {
        source: recentMessages[recentMessages.length - 1].source,
        sourceName: recentMessages[recentMessages.length - 1].sourceName,
        timestamp: recentMessages[recentMessages.length - 1].timestamp,
      }
    : null;

  return (
    <ConversationBridgeContext.Provider value={{ recentMessages, addMessage, getConversationSummary, lastActivity }}>
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

