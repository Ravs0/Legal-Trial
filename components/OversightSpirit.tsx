import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { TrialSimContext } from '../App';
import { ROUTES, type RoutePath } from '../routes';
import { KOKU_SYSTEM_PROMPT } from '../kokuConfig';
import { useConversationBridge, BRIDGE_EMPTY_SUMMARY } from './ConversationBridge';

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

// ─── Predefined useful route remarks (<25 words each) ─────────────────────────
// Keys use ROUTES so renames stay in sync. Legacy /judges + /opposing-counsel
// keep remarks in case a deep link flashes before redirect → /bench.
// Tone: concise practice tips, not roast spam.

const ROUTE_REMARKS: Record<RoutePath, string[]> = {
  [ROUTES.LANDING]: [
    'Pick a mode, then run one short drill. Warm-up beats browsing.',
    'Start with the 15-minute demo if you want a clean first loop.',
    'Choose a jurisdiction only when you are ready to practice in it.',
  ],
  [ROUTES.HOME]: [
    'One decision now: new trial, resume, or review last scores.',
    'Check loop health, then open a single tool. Avoid tab-hopping.',
    'If stats are flat, run setup and one full practice pass.',
  ],
  [ROUTES.SETUP]: [
    'Match judge pressure to your weak skill, not your comfort zone.',
    'Lock case facts before you enter the arena. Ambiguity kills pace.',
    'Harder bench profiles train objections and structure faster.',
  ],
  [ROUTES.PRACTICE]: [
    'Lead with the legal test, then facts. Do not narrate first.',
    'Object only when the record needs it. Precision over volume.',
    'If you stall, restate the issue in one sentence and continue.',
  ],
  [ROUTES.LIBRARY]: [
    'Pick one case and extract issues, elements, and weak facts.',
    'Prefer primary holdings over summaries when you plan argument.',
    'Save a case only if you will argue it in the next session.',
  ],
  [ROUTES.BENCH]: [
    'Study temperament and pressure style, then set that profile in trial setup.',
    'Note how each counsel attacks foundations. Mirror that in practice.',
    'Fictional profiles only. Use them as pressure, not as real people.',
  ],
  [ROUTES.JUDGES]: [
    'Legacy path: you are heading to Bench. Note temperament before setup.',
    'Judge style drives pacing. Pick pressure you can still argue under.',
    'Map each profile to a skill gap: structure, objections, or calm.',
  ],
  [ROUTES.OPPOSING_COUNSEL]: [
    'Legacy path: counsel tab on Bench. Learn their attack patterns.',
    'Anticipate foundation challenges and prepare short answers.',
    'Use counsel profiles to stress-test your theory of the case.',
  ],
  [ROUTES.DRAFTING_STUDIO]: [
    'Open with the standard of review, then the relief you want.',
    'Cut filler. Every sentence should move a legal element.',
    'Cite only what you would defend live. Soft sources stay out.',
  ],
  [ROUTES.STRATEGY]: [
    'Ask for rival theories, not agreement. Tension finds weak spots.',
    'Capture one claim, one counter, and the best reply before you leave.',
    'Use the room to stress-test assumptions, then update your outline.',
  ],
  [ROUTES.DREADLER]: [
    'Pin contradictions to prior words. Vague pressure is not a win.',
    'Track claims as a ledger. Force yes/no on each soft pivot.',
    'When coherence drops, ask what fact changed and why.',
  ],
  [ROUTES.PERSONAS]: [
    'Use personas for style drills, then apply the same structure in court.',
    'Ask for a counter-argument, not comfort. Keep turns short.',
    'Leave with one tactic you will try in the next practice.',
  ],
  [ROUTES.ANALYSIS]: [
    'Fix the lowest score first. One lever beats a full rewrite.',
    'Compare structure notes to your last opening. Patch that only.',
    'If review is empty, run a full trial before you optimize.',
  ],
  [ROUTES.RESEARCH_IDE]: [
    'Verify the primary source before you cite it in drafting or oral.',
    'Keep a short authority list: holding, court, year, why it matters.',
    'Research closes when you can state the rule in one line.',
  ],
  [ROUTES.COURT_SOURCES]: [
    'Prefer official dockets and primary text over secondary summaries.',
    'Record citation metadata while you search so drafting stays honest.',
    'Use real-world texture for practice, not as legal advice.',
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const QUIET_ROUTES = new Set<string>([
  ROUTES.LANDING,
  '/',
]);

const getRouteLabel = (pathname: string): string => {
  const map: Record<string, string> = {
    [ROUTES.LANDING]: 'Landing',
    [ROUTES.HOME]: 'Dashboard',
    [ROUTES.SETUP]: 'Trial Setup',
    [ROUTES.PRACTICE]: 'Practice Arena',
    [ROUTES.ANALYSIS]: 'Performance Review',
    [ROUTES.LIBRARY]: 'Case Library',
    [ROUTES.BENCH]: 'Bench and Counsel',
    [ROUTES.JUDGES]: 'Judges (legacy)',
    [ROUTES.OPPOSING_COUNSEL]: 'Opposing Counsel (legacy)',
    [ROUTES.DRAFTING_STUDIO]: 'Drafting Studio',
    [ROUTES.PERSONAS]: 'AI Personas',
    [ROUTES.STRATEGY]: 'Strategy Room',
    [ROUTES.DREADLER]: 'Deception Arena',
    [ROUTES.RESEARCH_IDE]: 'Research IDE',
    [ROUTES.COURT_SOURCES]: 'Court Sources',
    '/': 'Landing',
  };
  return map[pathname] || 'unknown area';
};

const resolveRemarks = (pathname: string): string[] | null => {
  if (pathname in ROUTE_REMARKS) {
    return ROUTE_REMARKS[pathname as RoutePath];
  }
  // Prefix fallback for nested paths under a known route (future-proof).
  // RoutePath values are never '/' (LANDING is '/landing'); root is handled via QUIET_ROUTES.
  const match = (Object.keys(ROUTE_REMARKS) as RoutePath[]).find((route) =>
    pathname.startsWith(`${route}/`),
  );
  return match ? ROUTE_REMARKS[match] : null;
};

// ─── API call (matches project pattern) ───────────────────────────────────────

async function callKokuApi(
  messages: { role: string; content: string }[],
  system: string,
): Promise<string> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, system }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    return typeof data.text === 'string' ? data.text : '';
  } catch {
    return '';
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROACTIVE_COOLDOWN_MS = 90_000; // 90s between proactive tips
const TOAST_AUTO_DISMISS_MS = 6_500;
const ROUTE_CHANGE_DELAY_MS = 2_500;
const INITIAL_GREETING =
  'Optional coach. Ask for a concise practice prompt, structure check, or second set of eyes.';

// ─── Component ────────────────────────────────────────────────────────────────

export const OversightSpirit: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<KokuMessage[]>([
    { id: 'init', sender: 'koku', text: INITIAL_GREETING },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [toast, setToast] = useState<ToastState>({ visible: false, text: '', exiting: false });
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [proactiveEnabled, setProactiveEnabled] = useState(false);
  const [shareCrossModuleContext, setShareCrossModuleContext] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastProactiveRef = useRef<number>(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPathRef = useRef<string | null>(null);
  const remarkedRoutesRef = useRef<Set<string>>(new Set());
  const isOpenRef = useRef(isOpen);

  const location = useLocation();
  const context = useContext(TrialSimContext);
  const bridge = useConversationBridge();

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const buildSystemPrompt = useCallback((): string => {
    const bridgeSummary = shareCrossModuleContext ? bridge.getConversationSummary() : '';
    const hasBridgeActivity =
      shareCrossModuleContext &&
      bridgeSummary &&
      bridgeSummary !== BRIDGE_EMPTY_SUMMARY &&
      !bridgeSummary.startsWith('Cross-module summary: none');

    return `${KOKU_SYSTEM_PROMPT}

# Current App Context
- Route: ${location.pathname} (${getRouteLabel(location.pathname)})
- Case: ${context?.currentSessionSettings?.caseDetail?.title || 'None selected'}
- Practice Mode: ${context?.practiceMode || 'Not set'}
${hasBridgeActivity ? `\n# Cross-Module Conversation Awareness\nYou can see what the user discussed with other modules. Reference it only when it helps the current task.\n\n${bridgeSummary}` : ''}

Remember: you are Koku, LexForge practice coach. Stay useful. Keep answers punchy and under 100 words unless the user asks for detail. Prefer practice advice over banter. Not legal advice.`;
  }, [location.pathname, context, bridge, shareCrossModuleContext]);

  const dismissToast = useCallback(() => {
    setToast((prev) => ({ ...prev, exiting: true }));
    setTimeout(() => setToast({ visible: false, text: '', exiting: false }), 280);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (text: string) => {
      const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 140);
      if (!cleaned) return;

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ visible: true, text: cleaned, exiting: false });
      toastTimerRef.current = setTimeout(() => {
        dismissToast();
      }, TOAST_AUTO_DISMISS_MS);
    },
    [dismissToast],
  );

  const expandToastToChat = useCallback(() => {
    const toastText = toast.text;
    dismissToast();
    setMessages((prev) => {
      const alreadyHas = prev.some((m) => m.text === toastText && m.sender === 'koku');
      if (alreadyHas) return prev;
      return [...prev, { id: `toast-${Date.now()}`, sender: 'koku', text: toastText }];
    });
    setIsOpen(true);
  }, [toast.text, dismissToast]);

  // Proactive route-change remarks (opt-in, rate-limited, once per route per session).
  useEffect(() => {
    const currentPath = location.pathname;

    // First paint: anchor path without toasting.
    if (prevPathRef.current === null) {
      prevPathRef.current = currentPath;
      return;
    }

    if (!proactiveEnabled) {
      prevPathRef.current = currentPath;
      return;
    }

    if (currentPath === prevPathRef.current || QUIET_ROUTES.has(currentPath)) {
      prevPathRef.current = currentPath;
      return;
    }

    // One tip per route per session keeps noise low.
    if (remarkedRoutesRef.current.has(currentPath)) {
      prevPathRef.current = currentPath;
      return;
    }

    prevPathRef.current = currentPath;

    if (routeTimerRef.current) clearTimeout(routeTimerRef.current);

    routeTimerRef.current = setTimeout(() => {
      const now = Date.now();
      if (now - lastProactiveRef.current < PROACTIVE_COOLDOWN_MS) return;
      if (isOpenRef.current) return;

      const finish = (remark: string) => {
        showToast(remark);
        lastProactiveRef.current = Date.now();
        remarkedRoutesRef.current.add(currentPath);
      };

      // Bridge-aware tip only when recent cross-module chat is real and useful.
      if (bridge.hasRecentActivity(120_000) && bridge.lastActivity) {
        const bridgeSummary = bridge.getConversationSummary();
        if (bridgeSummary !== BRIDGE_EMPTY_SUMMARY) {
          callKokuApi(
            [
              {
                role: 'user',
                content: `User navigated to ${getRouteLabel(currentPath)}. Recent module: ${bridge.lastActivity.sourceName}. Write ONE short practice tip (under 22 words). No roast. No quotes. Actionable only.`,
              },
            ],
            `${KOKU_SYSTEM_PROMPT}\n\nRecent activity:\n${bridgeSummary}\n\nOutput only the tip.`,
          ).then((remark) => {
            if (remark && remark.length > 8) {
              finish(remark);
              return;
            }
            const remarks = resolveRemarks(currentPath);
            if (remarks?.length) finish(pickRandom(remarks));
          });
          return;
        }
      }

      const remarks = resolveRemarks(currentPath);
      if (remarks?.length) finish(pickRandom(remarks));
    }, ROUTE_CHANGE_DELAY_MS);

    return () => {
      if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    };
  }, [location.pathname, proactiveEnabled, bridge, showToast]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    const msgId = Date.now().toString();
    setMessages((prev) => [...prev, { id: `user-${msgId}`, sender: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    const responseId = `koku-${msgId}`;
    setMessages((prev) => [...prev, { id: responseId, sender: 'koku', text: '...' }]);

    try {
      const systemPrompt = buildSystemPrompt();
      const apiMessages = [...chatHistory, { role: 'user', content: userMsg }];

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
        setMessages((prev) =>
          prev.map((m) => (m.id === responseId ? { ...m, text: current } : m)),
        );
      }

      setChatHistory((prev) =>
        [
          ...prev,
          { role: 'user', content: userMsg },
          { role: 'assistant', content: responseText },
        ].slice(-24),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === responseId
            ? { ...m, text: 'Something failed. Check the network and try again.' }
            : m,
        ),
      );
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const openCoach = () => {
      dismissToast();
      setIsOpen(true);
    };
    window.addEventListener('lexforge-open-coach', openCoach);
    return () => window.removeEventListener('lexforge-open-coach', openCoach);
  }, [dismissToast]);

  const routeHint = useMemo(() => getRouteLabel(location.pathname), [location.pathname]);

  // ── Render (flat monochrome; no gold/orange offset glow) ──────────────────
  return (
    <div
      className={`fixed bottom-6 right-6 z-40 flex flex-col items-end ${
        isOpen ? 'flex' : 'hidden sm:flex'
      }`}
    >
      {isOpen && (
        <div className="bg-brand-bg-primary border border-white/10 rounded-lg w-80 sm:w-96 h-[28rem] flex flex-col mb-3 overflow-hidden animate-fadeInUp">
          <div className="bg-brand-bg-secondary border-b border-white/10 px-4 py-2.5 flex justify-between items-center">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 bg-[#1c1914]/[0.06] border border-white/15 rounded-md flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-brand-text-primary font-serif">K</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-brand-text-primary font-serif font-semibold text-[15px]">
                    Koku
                  </span>
                  <span className="text-[9px] text-brand-text-secondary tracking-widest uppercase border border-white/15 px-1.5 py-0.5 rounded-sm">
                    Optional coach
                  </span>
                </div>
                <p className="text-[10px] text-brand-text-secondary truncate mt-0.5">
                  Context: {routeHint}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-brand-text-secondary hover:text-brand-text-primary transition-colors p-1"
              aria-label="Close coach"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-wrap gap-3 border-b border-white/10 px-4 py-2 text-[10px] text-brand-text-secondary">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={proactiveEnabled}
                onChange={(event) => setProactiveEnabled(event.target.checked)}
                className="accent-brand-text-primary"
              />
              Route tips
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={shareCrossModuleContext}
                onChange={(event) => setShareCrossModuleContext(event.target.checked)}
                className="accent-brand-text-primary"
              />
              Share module context
            </label>
          </div>

          <div className="flex-grow p-3 overflow-y-auto custom-scrollbar space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'koku' && (
                  <div className="w-6 h-6 bg-[#1c1914]/[0.06] border border-white/15 rounded-md flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                    <span className="text-[10px] font-semibold text-brand-text-primary font-serif">
                      K
                    </span>
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-3 py-2 text-sm leading-relaxed rounded-md ${
                    msg.sender === 'user'
                      ? 'bg-white text-brand-bg-primary border border-white'
                      : 'bg-[#1c1914]/[0.05] text-brand-text-primary border border-white/10'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="w-6 h-6 bg-[#1c1914]/[0.06] border border-white/15 rounded-md flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                  <span className="text-[10px] font-semibold text-brand-text-primary font-serif">
                    K
                  </span>
                </div>
                <div className="max-w-[80%] px-3 py-2 text-sm bg-[#1c1914]/[0.05] text-brand-text-primary border border-white/10 rounded-md flex space-x-1 items-center">
                  <span
                    className="w-1.5 h-1.5 bg-brand-text-secondary rounded-full animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-brand-text-secondary rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-brand-text-secondary rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-white/10 bg-brand-bg-secondary flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask for a practice tip..."
              aria-label="Ask Koku"
              className="flex-grow bg-transparent text-sm text-brand-text-primary focus:outline-none placeholder-brand-text-secondary/60 font-light"
            />
            <button
              onClick={handleSend}
              disabled={isTyping || !input.trim()}
              className="text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-40 transition-colors"
              aria-label="Send coach message"
            >
              <svg className="w-5 h-5 transform rotate-90" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {toast.visible && !isOpen && (
        <div
          className={`mb-3 max-w-xs cursor-pointer transition-all duration-300 ${
            toast.exiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0 animate-slideUp'
          }`}
          onClick={expandToastToChat}
          role="status"
        >
          <div className="bg-brand-bg-primary border border-white/15 rounded-lg px-4 py-3 flex items-start gap-3 group hover:border-white/30 transition-colors">
            <div className="w-8 h-8 bg-[#1c1914]/[0.06] border border-white/15 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-semibold text-brand-text-primary font-serif">K</span>
            </div>
            <div className="flex-grow min-w-0">
              <p className="text-xs text-brand-text-secondary font-medium tracking-wide uppercase mb-0.5">
                Route tip
              </p>
              <p className="text-sm text-brand-text-primary leading-snug">{toast.text}</p>
              <p className="text-[10px] text-brand-text-secondary/60 mt-1 tracking-wide uppercase group-hover:text-brand-text-secondary transition-colors">
                Click to chat · auto-dismiss
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dismissToast();
              }}
              className="text-brand-text-secondary/50 hover:text-brand-text-primary transition-colors flex-shrink-0 mt-0.5"
              aria-label="Dismiss coach tip"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {!isOpen && (
        <button
          onClick={() => {
            dismissToast();
            setIsOpen(true);
          }}
          className="hidden sm:flex w-12 h-12 bg-brand-bg-secondary border border-white/20 rounded-lg hover:bg-[#1c1914]/[0.06] hover:border-white/35 transition-colors items-center justify-center relative group"
          aria-label="Open optional coach"
        >
          <span className="text-lg font-semibold text-brand-text-primary font-serif">K</span>
          <div className="absolute right-14 bg-brand-bg-secondary border border-white/15 text-brand-text-primary text-[10px] px-2 py-1 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none rounded-md">
            Optional coach
          </div>
        </button>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.25s ease-out;
        }
      `}</style>
    </div>
  );
};
