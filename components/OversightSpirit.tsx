import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { TrialSimContext } from '../App';
import { KOKU_SYSTEM_PROMPT } from '../kokuConfig';
import { useConversationBridge } from './ConversationBridge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KokuMessage {
  id: string;
  sender: 'user' | 'koku';
  text: string;
}

interface ToastState {
  visible: boolean;
  text: string;
  exiting: boolean;
}

// ─── Predefined witty route remarks (<25 words each) ──────────────────────────

const ROUTE_REMARKS: Record<string, string[]> = {
  '/dashboard': [
    "Home sweet home. Don't just stare at the dashboard — go practice something.",
    "Back to base. Your win rate isn't going to improve by itself, you know.",
    "Dashboard again? Bold of you to look at your stats voluntarily.",
  ],
  '/setup': [
    "Setting up a trial? Choose wisely. Or don't. I'll roast you either way.",
    "Pick a tough judge. You need the pressure. Trust me on this one.",
    "Oh, configuring a trial. Let's see if you pick something above beginner this time.",
  ],
  '/practice': [
    "Showtime. Don't embarrass us both in front of the judge.",
    "You're in the arena now. Deep breaths. Make your arguments count.",
    "Trial time. Remember: the judge is watching. And so am I.",
  ],
  '/library': [
    "Browsing cases? Good. Reading is step one. Arguing well is step two.",
    "The case library. Try picking something you haven't already failed at.",
    "Research mode. Smart move. Actually read the facts this time.",
  ],
  '/judges': [
    "Studying the judges? Know thy enemy. Well, not enemy — authority figure.",
    "Looking at judges. Each one will destroy you differently. Choose your poison.",
    "Judge shopping? They all expect you to know your stuff. No shortcuts.",
  ],
  '/opposing-counsel': [
    "Sizing up the opposition? Good instinct. Know how they argue.",
    "Studying opposing counsel. They're studying you too. Metaphorically.",
    "Looking at the people who'll tear your arguments apart. Prepare accordingly.",
  ],
  '/drafting-studio': [
    "Drafting studio. Every word matters. Don't write like you text your friends.",
    "Time to draft. Precision over volume. Make every sentence earn its place.",
    "Legal drafting? Remember: courts read documents, not your intentions.",
  ],
  '/council': [
    "The AI Council Chamber. Where brilliant minds argue. Try to keep up.",
    "Council time. Multiple perspectives, one goal — finding the truth.",
    "Entering the council. Listen first, then form your own opinion.",
  ],
  '/sentient-subjects': [
    "Communing with the Subjects? They don't bite. Well, Kira might~",
    "Going to chat with anime law personalities? Ren won't show it, but they care.",
    "Careful with Sora. She'll deny caring about you. She definitely cares.",
  ],
  '/analysis': [
    "Checking your performance? Brave. The numbers don't lie, even if you do.",
    "Analysis time. Let's see what the scoreboard says about your lawyering.",
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const getRouteLabel = (pathname: string): string => {
  const map: Record<string, string> = {
    '/dashboard': 'the Dashboard',
    '/setup': 'Trial Setup',
    '/practice': 'the Practice Arena',
    '/library': 'the Case Library',
    '/judges': 'the Judges gallery',
    '/opposing-counsel': 'Opposing Counsel profiles',
    '/drafting-studio': 'the Drafting Studio',
    '/council': 'the AI Council Chamber',
    '/sentient-subjects': 'the Sentient Subjects commune',
    '/analysis': 'Performance Analysis',
    '/': 'the Landing page',
  };
  return map[pathname] || 'an unknown area';
};

// ─── API call (matches project pattern) ───────────────────────────────────────

async function callKokuApi(
  messages: { role: string; content: string }[],
  system: string
): Promise<string> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, system }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.text || '';
  } catch {
    return '';
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROACTIVE_COOLDOWN_MS = 60_000;  // 60 seconds between popups
const TOAST_AUTO_DISMISS_MS = 8_000;   // 8 seconds
const ROUTE_CHANGE_DELAY_MS = 3_000;   // 3 seconds after route change
const INITIAL_GREETING = "Finally. Let's see what you're up to. Try not to embarrass yourself too much while I'm watching.";

// ─── Component ────────────────────────────────────────────────────────────────

export const OversightSpirit: React.FC = () => {
  // ── State ─────────────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<KokuMessage[]>([
    { id: 'init', sender: 'koku', text: INITIAL_GREETING },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [toast, setToast] = useState<ToastState>({ visible: false, text: '', exiting: false });
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastProactiveRef = useRef<number>(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPathRef = useRef<string>('');

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const location = useLocation();
  const context = useContext(TrialSimContext);

  // ConversationBridge is always available (provider wraps the app in App.tsx)
  const bridge = useConversationBridge();

  // ── Auto-scroll messages ─────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Build Koku's system prompt with bridge context ───────────────────────
  const buildSystemPrompt = useCallback((): string => {
    const bridgeSummary = bridge?.getConversationSummary() || '';
    const hasBridgeActivity = bridgeSummary && !bridgeSummary.includes('No recent conversations');

    return `${KOKU_SYSTEM_PROMPT}

# Current App Context
- Route: ${location.pathname} (${getRouteLabel(location.pathname)})
- Case: ${context?.currentSessionSettings?.caseDetail?.title || 'None selected'}
- Practice Mode: ${context?.practiceMode || 'Not set'}
${hasBridgeActivity ? `\n# Cross-Module Conversation Awareness\nYou can see what the user has been discussing with other modules. Use this to make insightful, connected observations. Reference their conversations naturally — e.g., "I saw you were talking to Danda about bail. Here's what I think..."\n\n${bridgeSummary}` : ''}

Remember: you are Koku, the Oversight Spirit. Never break character. Keep responses punchy and under 100 words unless the user asks for detail.`;
  }, [location.pathname, context, bridge]);

  // ── Toast management ─────────────────────────────────────────────────────
  const dismissToast = useCallback(() => {
    setToast(prev => ({ ...prev, exiting: true }));
    setTimeout(() => setToast({ visible: false, text: '', exiting: false }), 300);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const showToast = useCallback((text: string) => {
    // Clear any existing toast timer
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    setToast({ visible: true, text, exiting: false });

    // Auto-dismiss after 8 seconds
    toastTimerRef.current = setTimeout(() => {
      dismissToast();
    }, TOAST_AUTO_DISMISS_MS);
  }, [dismissToast]);

  const expandToastToChat = useCallback(() => {
    const toastText = toast.text;
    dismissToast();
    // Add toast message to chat history if it's not already there
    setMessages(prev => {
      const alreadyHas = prev.some(m => m.text === toastText && m.sender === 'koku');
      if (alreadyHas) return prev;
      return [...prev, { id: `toast-${Date.now()}`, sender: 'koku', text: toastText }];
    });
    setIsOpen(true);
  }, [toast.text, dismissToast]);

  // ── Proactive route-change remarks ───────────────────────────────────────
  useEffect(() => {
    const currentPath = location.pathname;

    // Skip if same route, or chat is already open, or on landing
    if (currentPath === prevPathRef.current || currentPath === '/') {
      prevPathRef.current = currentPath;
      return;
    }

    prevPathRef.current = currentPath;

    // Clear any pending route timer
    if (routeTimerRef.current) clearTimeout(routeTimerRef.current);

    routeTimerRef.current = setTimeout(() => {
      const now = Date.now();

      // Rate limit: max 1 proactive popup per 60 seconds
      if (now - lastProactiveRef.current < PROACTIVE_COOLDOWN_MS) return;

      // Don't show toast if chat is open
      if (isOpen) return;

      // Check if bridge has recent activity for richer context
      const hasRecentBridgeActivity = bridge?.lastActivity &&
        (now - bridge.lastActivity.timestamp < 120_000); // Activity in last 2 min

      if (hasRecentBridgeActivity && bridge?.lastActivity) {
        // Use API for context-aware remark when bridge has recent activity
        const bridgeSummary = bridge.getConversationSummary();
        callKokuApi(
          [{
            role: 'user',
            content: `The user just navigated to ${getRouteLabel(currentPath)}. They were recently talking to ${bridge.lastActivity.sourceName}. Generate a SHORT (under 25 words), witty, contextual remark as Koku. Reference their recent activity naturally. No quotes around the response.`,
          }],
          `${KOKU_SYSTEM_PROMPT}\n\nRecent activity:\n${bridgeSummary}\n\nGenerate ONLY a short witty remark. Under 25 words. No fluff.`
        ).then(remark => {
          if (remark && remark.length > 5) {
            showToast(remark.slice(0, 150)); // Safety cap
            lastProactiveRef.current = Date.now();
          }
        });
      } else {
        // Use predefined remarks for simple route changes
        const remarks = ROUTE_REMARKS[currentPath];
        if (remarks && remarks.length > 0) {
          showToast(pickRandom(remarks));
          lastProactiveRef.current = now;
        }
      }
    }, ROUTE_CHANGE_DELAY_MS);

    return () => {
      if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // ── Send message handler ─────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    const msgId = Date.now().toString();
    setMessages(prev => [...prev, { id: `user-${msgId}`, sender: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    const responseId = `koku-${msgId}`;
    setMessages(prev => [...prev, { id: responseId, sender: 'koku', text: '...' }]);

    try {
      const systemPrompt = buildSystemPrompt();

      // Build conversation for API
      const apiMessages = [
        ...chatHistory,
        { role: 'user', content: userMsg },
      ];

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, system: systemPrompt, stream: true }),
      });

      if (!res.ok) throw new Error('API error');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream reader');

      const decoder = new TextDecoder();
      let responseText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        responseText += chunk;
        const current = responseText;
        setMessages(prev =>
          prev.map(m => m.id === responseId ? { ...m, text: current } : m)
        );
      }

      // Update chat history for continuity
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: userMsg },
        { role: 'assistant', content: responseText },
      ]);
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === responseId
          ? { ...m, text: "Wait, WHAT? Something broke. Fix your internet, bestie." }
          : m
        )
      );
    } finally {
      setIsTyping(false);
    }
  };

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">

      {/* ─── Full Chat Window ──────────────────────────────────────────────── */}
      {isOpen && (
        <div className="bg-brand-bg-primary border border-brand-accent shadow-[6px_6px_0px_0px_#FF5A1F] rounded-none w-80 sm:w-96 h-[28rem] flex flex-col mb-4 overflow-hidden animate-fadeInUp">
          {/* Header */}
          <div className="bg-brand-bg-secondary border-b border-brand-accent px-4 py-2.5 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 bg-brand-accent/20 border border-brand-accent rounded-none flex items-center justify-center">
                <span className="text-sm font-bold text-brand-accent font-serif">K</span>
              </div>
              <div>
                <span className="text-brand-accent font-serif font-bold text-base">Koku</span>
                <span className="ml-2 text-[9px] text-brand-text-secondary tracking-widest uppercase border border-brand-text-primary/20 px-1.5 py-0.5">
                  Oversight Spirit
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-brand-text-secondary hover:text-brand-accent transition-colors p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-grow p-3 overflow-y-auto custom-scrollbar space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.sender === 'koku' && (
                  <div className="w-6 h-6 bg-brand-accent/15 border border-brand-accent/40 rounded-none flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                    <span className="text-[10px] font-bold text-brand-accent font-serif">K</span>
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-3 py-2 text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-brand-bg-secondary text-brand-text-primary border border-brand-text-primary/20'
                      : 'bg-brand-accent/8 text-brand-text-primary border border-brand-accent/30'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="w-6 h-6 bg-brand-accent/15 border border-brand-accent/40 rounded-none flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                  <span className="text-[10px] font-bold text-brand-accent font-serif">K</span>
                </div>
                <div className="max-w-[80%] px-3 py-2 text-sm bg-brand-accent/8 text-brand-text-primary border border-brand-accent/30 flex space-x-1 items-center">
                  <span className="w-1.5 h-1.5 bg-brand-accent rounded-none animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-brand-accent rounded-none animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-brand-accent rounded-none animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-brand-text-primary/20 bg-brand-bg-secondary flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask Koku..."
              className="flex-grow bg-transparent text-sm text-brand-text-primary focus:outline-none placeholder-brand-text-secondary/50 font-light"
            />
            <button
              onClick={handleSend}
              disabled={isTyping || !input.trim()}
              className="text-brand-accent hover:text-brand-accent-hover disabled:opacity-40 transition-colors"
            >
              <svg className="w-5 h-5 transform rotate-90" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ─── Proactive Toast Notification ───────────────────────────────────── */}
      {toast.visible && !isOpen && (
        <div
          className={`mb-3 max-w-xs cursor-pointer transition-all duration-300 ${
            toast.exiting
              ? 'opacity-0 translate-y-2'
              : 'opacity-100 translate-y-0 animate-slideUp'
          }`}
          onClick={expandToastToChat}
        >
          <div className="bg-brand-bg-primary border border-brand-accent/60 shadow-[4px_4px_0px_0px_#FF5A1F] rounded-none px-4 py-3 flex items-start gap-3 group hover:border-brand-accent transition-colors">
            {/* Koku avatar */}
            <div className="w-8 h-8 bg-brand-accent/20 border border-brand-accent rounded-none flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-bold text-brand-accent font-serif">K</span>
            </div>
            <div className="flex-grow min-w-0">
              <p className="text-xs text-brand-accent font-serif font-semibold mb-0.5">Koku</p>
              <p className="text-sm text-brand-text-primary leading-snug">{toast.text}</p>
              <p className="text-[10px] text-brand-text-secondary/50 mt-1 tracking-wide uppercase group-hover:text-brand-accent/50 transition-colors">
                Click to chat · or wait to dismiss
              </p>
            </div>
            {/* Dismiss X */}
            <button
              onClick={e => { e.stopPropagation(); dismissToast(); }}
              className="text-brand-text-secondary/40 hover:text-brand-accent transition-colors flex-shrink-0 mt-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ─── Floating K Button ─────────────────────────────────────────────── */}
      {!isOpen && (
        <button
          onClick={() => { dismissToast(); setIsOpen(true); }}
          className="w-14 h-14 bg-brand-bg-secondary border-2 border-brand-accent rounded-none shadow-[4px_4px_0px_0px_#FF5A1F] hover:shadow-[2px_2px_0px_0px_#FF5A1F] hover:translate-x-0.5 hover:translate-y-0.5 transition-all flex items-center justify-center relative group"
        >
          <span className="text-xl font-bold text-brand-accent font-serif">K</span>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-brand-error rounded-none border border-brand-bg-primary animate-pulse" />
          <div className="absolute right-16 bg-brand-bg-secondary border border-brand-accent text-brand-text-primary text-[10px] px-2 py-1 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none rounded-none">
            Oversight Active
          </div>
        </button>
      )}

      {/* ─── Inline Styles for Custom Animations ───────────────────────────── */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slideUp {
          animation: slideUp 0.35s ease-out;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};
