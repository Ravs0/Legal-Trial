import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BridgeMessage {
  id: string;
  source: string;       // 'constitutional' | 'criminal' | 'corporate' | 'family' | 'international' | 'council' | 'drafting' | 'trial'
  sourceName: string;   // Human readable: 'Samvidhan', 'Danda', etc.
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

// ─── Context ──────────────────────────────────────────────────────────────────

const ConversationBridgeContext = createContext<ConversationBridgeContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ConversationBridgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recentMessages, setRecentMessages] = useState<BridgeMessage[]>([]);
  const counterRef = useRef(0);

  const addMessage = useCallback((msg: Omit<BridgeMessage, 'id' | 'timestamp'>) => {
    const newMsg: BridgeMessage = {
      ...msg,
      id: `bridge-${Date.now()}-${counterRef.current++}`,
      timestamp: Date.now(),
    };
    setRecentMessages(prev => {
      const updated = [...prev, newMsg];
      // Keep only the last MAX_MESSAGES to avoid bloat
      return updated.length > MAX_MESSAGES ? updated.slice(-MAX_MESSAGES) : updated;
    });
  }, []);

  const getConversationSummary = useCallback((): string => {
    if (recentMessages.length === 0) {
      return 'No recent conversations across modules.';
    }

    const slice = recentMessages.slice(-SUMMARY_COUNT);

    // Group by source for a cleaner summary
    const grouped = new Map<string, BridgeMessage[]>();
    for (const msg of slice) {
      const key = msg.sourceName;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(msg);
    }

    const lines: string[] = ['## Recent Cross-Module Activity'];

    for (const [sourceName, msgs] of grouped) {
      lines.push(`\n### Conversation with ${sourceName}:`);
      for (const m of msgs) {
        const role = m.sender === 'user' ? 'User' : sourceName;
        // Truncate very long messages to keep context manageable
        const text = m.text.length > 200 ? m.text.slice(0, 200) + '...' : m.text;
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useConversationBridge = (): ConversationBridgeContextType => {
  const ctx = useContext(ConversationBridgeContext);
  if (!ctx) {
    throw new Error('useConversationBridge must be used within a ConversationBridgeProvider');
  }
  return ctx;
};
