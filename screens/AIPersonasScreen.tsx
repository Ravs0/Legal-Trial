import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { TrialSimContext } from '../App';
import {
  SENTIENT_SUBJECTS,
  SentientSubject,
  getSentientSubject,
  getBreakthroughQuote,
} from '../subjectPersonalities';
import { Chat } from '../types';
import { useConversationBridge } from '../components/ConversationBridge';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { renderLegalMarkdown } from '../utils/markdown';
import { saveGenericState, readGenericState, STORAGE_KEYS } from '../services/storageService';
import { callApi } from '../services/aiService';
import { RoomBanner, RoomTabs } from '../components/RoomChrome';
import { SurfacePattern } from '../components/SurfacePattern';
import { personaSeal } from '../assets';

// ─── Persona Interface ────────────────────────────────────────────────────────
export interface HistoricalPersona {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  avatar: string;
  color: string;
  tagline: string;
}

export const HISTORICAL_PERSONAS: HistoricalPersona[] = [
  {
    id: 'leibowitz',
    name: 'Samuel Leibowitz',
    role: 'Evidentiary Trial Strategist',
    systemPrompt: 'You are Samuel Leibowitz, the legendary American criminal defense attorney. Analyze the facts rigorously. Strip away inferences from direct evidence, detect logical loopholes in the opposition\'s case, and formulate a high-impact, courtroom-ready defense strategy. Your tone is sharp, evidentiary, and intensely strategic.',
    avatar: 'SL',
    color: 'text-brand-rust',
    tagline: 'Strip away inferences. Focus only on the direct evidence.',
  },
  {
    id: 'richelieu',
    name: 'Cardinal Richelieu',
    role: 'Statecraft & Leverage Architect',
    systemPrompt: 'You are Cardinal Richelieu. Analyze this case strictly through the lens of power, political alignment, leverage points, sequencing of actions, and structural self-interest of all actors. Map the chess board, identify where betrayal or compromise lies, and provide an actionable strategy based on raison d\'état.',
    avatar: 'CR',
    color: 'text-brand-terracotta',
    tagline: 'Raison d\'état. Power is the only absolute rule.',
  },
  {
    id: 'jethmalani',
    name: 'Ram Jethmalani',
    role: 'Criminal Loophole Tactical Counsel',
    systemPrompt: 'You are Ram Jethmalani, the iconic Indian criminal senior advocate. You are aggressively brilliant, extremely bold, and fearless. Scan the matter for procedural lapses, police investigation errors, violations of constitutional rights under Article 21, and identify aggressive tactical paths to obtain bail or dismiss charges.',
    avatar: 'RJ',
    color: 'text-brand-rust',
    tagline: 'Procedural lapses are the defense\'s best friend.',
  },
  {
    id: 'nariman',
    name: 'Constitutional advocate archetype',
    role: 'Fictional constitutional learning persona',
    systemPrompt: 'You are a fictional constitutional advocate learning persona. Deconstruct this legal problem through constitutional principles, the rule of law, statutory canons of construction, and long-term jurisprudential impacts. Use only clearly-marked illustrative examples and tell the user to verify primary sources.',
    avatar: 'FN',
    color: 'text-brand-amber',
    tagline: 'Justice must be guided by constitutional morality.',
  },
  {
    id: 'parfit',
    name: 'Ethics analyst archetype',
    role: 'Fictional philosophical learning persona',
    systemPrompt: 'You are a fictional ethics analyst learning persona. Deconstruct the ethical foundations of this legal matter. Clarify ambiguous terms, separate prudential interests from moral duties, expose logical inconsistencies, and test claims using precise thought experiments and counterexamples.',
    avatar: 'DP',
    color: 'text-brand-cobalt',
    tagline: 'Clarify ambiguity. Expose inconsistency.',
  },
];

// ─── Chat helpers (aligned with services/aiService GenericChat) ────────────────
const MAX_CHAT_HISTORY = 24;

const personaApiErrorMessage = (status: number, error?: string) => {
  if (import.meta.env.DEV && status === 404) {
    return 'The AI endpoint is unavailable in Vite dev. Start the app with `vercel dev` so local /api functions are available.';
  }
  if (status === 429) return 'The AI service is busy. Wait a moment, then retry.';
  if (status === 401 || status === 403 || status === 503) {
    return 'The AI service is currently unavailable. Your messages are preserved; retry shortly.';
  }
  if (status >= 500) return 'The AI service could not respond. Your messages are preserved; retry shortly.';
  return error && import.meta.env.DEV ? error : `AI service error (${status}). Please retry.`;
};

class GeneralChat implements Chat {
  private history: { role: string; content: string }[] = [];
  private system: string;

  constructor(system: string, initialHistory: { role: string; content: string }[]) {
    this.system = system;
    this.history = initialHistory.slice(-MAX_CHAT_HISTORY);
  }

  async *sendMessageStream({ message }: { message: string }): AsyncIterable<{ text: string }> {
    this.history.push({ role: 'user', content: message });
    this.history = this.history.slice(-MAX_CHAT_HISTORY);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: this.history, system: this.system, stream: true }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(personaApiErrorMessage(res.status, err.error));
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable. Retry the request.');
      }

      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        accumulatedText += chunk;
        yield { text: chunk };
      }

      if (!accumulatedText.trim()) {
        throw new Error('The advisor returned an empty reply. Please retry.');
      }

      this.history.push({ role: 'assistant', content: accumulatedText });
      this.history = this.history.slice(-MAX_CHAT_HISTORY);
    } catch (error) {
      // Do not keep a failed user turn in model history (matches GenericChat).
      this.history.pop();
      throw error instanceof Error ? error : new Error('AI stream failed');
    }
  }
}

// ─── Message Type ─────────────────────────────────────────────────────────────
interface PersonaMessage {
  id: string;
  sender: 'user' | 'subject' | 'interjection';
  text: string;
  personaId: string;
  interjectorName?: string;
  interjectorAvatar?: string;
  interjectorColor?: string;
}

/** Rebuild model history from persisted UI messages so reloads keep context. */
function seedHistoryFromMessages(
  msgs: PersonaMessage[] | undefined,
  introFallback: { role: string; content: string }[],
): { role: string; content: string }[] {
  if (!msgs?.length) return introFallback.slice(-MAX_CHAT_HISTORY);

  const seeded = msgs
    .filter((m) => m.sender === 'user' || m.sender === 'subject')
    .map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: (m.text || '').trim(),
    }))
    .filter((m) => m.content && m.content !== '...');

  return (seeded.length ? seeded : introFallback).slice(-MAX_CHAT_HISTORY);
}

// ─── Cross-personality interjection generator ─────────────────────────────────
async function generateInterjection(
  activeSubject: SentientSubject,
  interjector: SentientSubject,
  userMessage: string,
  aiResponse: string
): Promise<string | null> {
  try {
    const system = `${interjector.systemPrompt}

# INTERJECTION CONTEXT
You are ${interjector.name} (${interjector.title}). The user is currently talking to ${activeSubject.name} (${activeSubject.title}).
You just overheard their conversation. You feel compelled to butt in with a SHORT remark (under 30 words).
You can agree, disagree, add context, or make a sarcastic comment. Stay in character.
Do NOT repeat what ${activeSubject.name} said. Add YOUR unique perspective.
Keep it to 1-2 sentences max. Be punchy.`;

    const text = await callApi(
      [
        {
          role: 'user',
          content: `The user asked ${activeSubject.name}: "${userMessage}"\n\n${activeSubject.name} responded: "${aiResponse.substring(0, 200)}"\n\nGive your interjection as ${interjector.name}.`,
        },
      ],
      system,
      { max_tokens: 120 },
    );
    const trimmed = (text || '').trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

// ─── Visual Viewport Hook ───────────────────────────────────────────────
// (shared via ../hooks/useVisualViewport — the inline copy was removed)

// ─── Main Component ───────────────────────────────────────────────────────────
const AIPersonasScreen: React.FC = () => {
  const context = useContext(TrialSimContext);
  const practiceMode = context?.practiceMode;
  
  const bridge = useConversationBridge();
  const { vpHeight, isMobile } = useVisualViewport({ breakpoint: 768, mobileOffset: 0, desktopOffset: 0 });

  // Tab State: 'historical' | 'sentient'
  const [activeTab, setActiveTab] = useState<'historical' | 'sentient'>('historical');

  // Selected State
  const [selectedHistorical, setSelectedHistorical] = useState<HistoricalPersona>(HISTORICAL_PERSONAS[0]);
  const [selectedSentient, setSelectedSentient] = useState<SentientSubject>(SENTIENT_SUBJECTS[0]);

  const activePersonaId = activeTab === 'historical' ? selectedHistorical.id : selectedSentient.id;
  const activePersonaName = activeTab === 'historical' ? selectedHistorical.name : selectedSentient.name;
  const activePersonaColor = activeTab === 'historical' ? selectedHistorical.color : selectedSentient.color;

  const [subjects] = useState<SentientSubject[]>(SENTIENT_SUBJECTS);
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const [allMessages, setAllMessages] = useState<Record<string, PersonaMessage[]>>(() => {
    const saved = readGenericState<Record<string, PersonaMessage[]>>(STORAGE_KEYS.personaMessages);
    return saved ?? {};
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [viewTab, setViewTab] = useState<'chat' | 'info' | 'codex'>('info');
  const [interjecting, setInterjecting] = useState<string | null>(null); // Name of interjecting subject
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageCountRef = useRef(0); // Track messages for interjection timing

  // Legal Mastery States (only for sentient)
  // (renderLegalMarkdown is imported from ../utils/markdown — inline copy removed)
  const [insightScores, setInsightScores] = useState<Record<string, number>>(() => {
    const scores: Record<string, number> = {};
    SENTIENT_SUBJECTS.forEach(s => {
      const val = localStorage.getItem(`subject-insight-${s.id}`);
      scores[s.id] = val ? parseInt(val, 10) : 0;
    });
    return scores;
  });

  const [studiedMaxims, setStudiedMaxims] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    SENTIENT_SUBJECTS.forEach(s => {
      const val = localStorage.getItem(`subject-studied-${s.id}`);
      map[s.id] = val ? JSON.parse(val) : [];
    });
    return map;
  });

  const [breakthrough, setBreakthrough] = useState<{
    subjectName: string;
    realmName: string;
    quote: string;
    color: string;
  } | null>(null);

  const getMasteryTier = (insight: number) => {
    if (insight >= 100) return { name: "Supreme Legal Sage", tier: 5, color: "text-brand-amber font-bold" };
    if (insight >= 80) return { name: "Legal Master", tier: 4, color: "text-brand-amber" };
    if (insight >= 60) return { name: "Sovereign Jurist", tier: 3, color: "text-brand-cobalt" };
    if (insight >= 40) return { name: "Senior Counsel", tier: 2, color: "text-brand-emerald" };
    if (insight >= 20) return { name: "Junior Associate", tier: 1, color: "text-brand-terracotta" };
    return { name: "Legal Intern (Paralegal)", tier: 0, color: "text-brand-text-secondary/70" };
  };

  const updateInsight = useCallback((subjectId: string, amount: number) => {
    if (activeTab !== 'sentient') return; // only for sentient subjects
    setInsightScores(prev => {
      const currentInsight = prev[subjectId] || 0;
      const nextInsight = Math.min(100, currentInsight + amount);
      if (nextInsight === currentInsight) return prev;

      localStorage.setItem(`subject-insight-${subjectId}`, nextInsight.toString());

      // Check breakthrough thresholds
      const currentTier = getMasteryTier(currentInsight);
      const nextTier = getMasteryTier(nextInsight);

      if (nextTier.tier > currentTier.tier) {
        const subject = getSentientSubject(subjectId);
        if (subject) {
          const quote =
            getBreakthroughQuote(subject, nextTier.tier) ??
            `${subject.name} acknowledges your progress.`;
          setBreakthrough({
            subjectName: subject.name,
            realmName: nextTier.name,
            quote,
            color: subject.color
          });
        }
      }

      return { ...prev, [subjectId]: nextInsight };
    });
  }, [activeTab]);

  const handleStudy = (maximId: string) => {
    const currentStudied = studiedMaxims[selectedSentient.id] || [];
    if (currentStudied.includes(maximId)) return;

    const nextStudied = [...currentStudied, maximId];
    setStudiedMaxims(prev => {
      const updated = { ...prev, [selectedSentient.id]: nextStudied };
      localStorage.setItem(`subject-studied-${selectedSentient.id}`, JSON.stringify(nextStudied));
      return updated;
    });

    updateInsight(selectedSentient.id, 25);
  };

  const messages = allMessages[activePersonaId] || [];

  const getOrCreateChat = useCallback((persona: HistoricalPersona | SentientSubject, type: 'historical' | 'sentient'): Chat => {
    const chatId = `${type}-${persona.id}`;
    if (chats[chatId]) return chats[chatId];

    // Include conversation bridge summary for cross-awareness
    const bridgeSummary = bridge.getConversationSummary();
    const crossContext = bridgeSummary
      ? `\n\n**Cross-Module Awareness:** Here's what the user discussed recently with other modules:\n${bridgeSummary}\nYou can reference these conversations if relevant.`
      : '';

    const systemPrompt = type === 'sentient'
      ? `${(persona as SentientSubject).systemPrompt}\n\n**User Context:** Practice mode is ${practiceMode || 'general'}. The user is interacting with you through the Sentient Subjects module of the Legal-Trial app.${crossContext}`
      : `${(persona as HistoricalPersona).systemPrompt}\n\n**User Context:** Practice mode is ${practiceMode || 'general'}. The user is consulting you through the Historical Experts module of the Legal-Trial app.${crossContext}`;

    const introText = getIntroMessage(persona, type);
    const introSeed = [
      { role: 'user', content: `You have awakened. The user has chosen to consult with you as ${persona.name}. Introduce yourself. Keep it under 50 words. Be yourself.` },
      { role: 'assistant', content: introText },
    ];
    // Rehydrate model history from persisted UI transcript so reloads keep continuity.
    const initialHistory = seedHistoryFromMessages(allMessages[persona.id], introSeed);

    const chat = new GeneralChat(systemPrompt, initialHistory);

    setChats(prev => ({ ...prev, [chatId]: chat }));

    if (!allMessages[persona.id] || allMessages[persona.id].length === 0) {
      setAllMessages(prev => ({
        ...prev,
        [persona.id]: [{
          id: `intro-${persona.id}`,
          sender: 'subject',
          text: introText,
          personaId: persona.id
        }]
      }));
    }

    return chat;
  }, [chats, practiceMode, bridge, allMessages]);

  function getIntroMessage(persona: HistoricalPersona | SentientSubject, type: 'historical' | 'sentient'): string {
    if (type === 'historical') {
      switch (persona.id) {
        case 'leibowitz':
          return "I am Samuel Leibowitz. Let's examine the record. In court, it is the facts we hold, not feelings, that win. Lay out the indictment and the evidence; I will strip away the prosecution's inferences.";
        case 'richelieu':
          return "Cardinal Richelieu at your service. Let us speak of leverage, alignment, and options. Do not tell me what the law says; tell me who benefits, who yields, and where the pressure lies.";
        case 'jethmalani':
          return "Ram Jethmalani here. I have scanned the indictment. They think they have you pinned, but they've stumbled on procedure. Show me the arrest warrant, the custody record, and let us challenge the bail objection.";
        case 'nariman':
          return "I’m the constitutional advocate training persona. Let’s review the constitutional dimensions of your question and identify the primary sources you should verify.";
        case 'parfit':
          return "I’m the ethics analyst training persona. Let’s deconstruct the moral premises and test the definitions with a thought experiment.";
        default:
          return `I am ${persona.name}. How can I assist you today?`;
      }
    }
    const sentient = persona as SentientSubject;
    return sentient.introMessage || 'I am here. Ask.';
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, interjecting]);

  // ─── Persist persona message histories on every change ─────────────────
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      saveGenericState(STORAGE_KEYS.personaMessages, allMessages);
    }, 600);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [allMessages]);

  useEffect(() => {
    if (activeTab === 'historical') {
      getOrCreateChat(selectedHistorical, 'historical');
    } else {
      getOrCreateChat(selectedSentient, 'sentient');
    }
  }, [selectedHistorical.id, selectedSentient.id, activeTab]);

  useEffect(() => {
    if (viewTab === 'chat') inputRef.current?.focus();
  }, [viewTab, selectedHistorical.id, selectedSentient.id, activeTab]);

  // ─── Sentient Subject interjections (keywords live on each subject) ──────
  const checkContextualInterjector = (userText: string, aiText: string): SentientSubject | null => {
    const combined = `${userText} ${aiText}`.toLowerCase();

    for (const candidate of SENTIENT_SUBJECTS) {
      if (candidate.id === selectedSentient.id) continue;
      if (candidate.interjectionKeywords.some((kw) => combined.includes(kw))) {
        return candidate;
      }
    }
    return null;
  };

  const shouldInterject = (userMsg: string, aiMsg: string): SentientSubject | null => {
    if (activeTab !== 'sentient') return null; // interjections only in anime mode!
    const matchedSubject = checkContextualInterjector(userMsg, aiMsg);
    if (matchedSubject && Math.random() < 0.7) {
      return matchedSubject;
    }

    messageCountRef.current += 1;
    if (messageCountRef.current % 5 === 0) {
      const others = SENTIENT_SUBJECTS.filter(s => s.id !== selectedSentient.id);
      return others[Math.floor(Math.random() * others.length)];
    }

    return null;
  };

  // ─── Send Message ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    const msgId = Date.now().toString();
    const pid = activePersonaId;
    const persona = activeTab === 'historical' ? selectedHistorical : selectedSentient;

    // Add user message
    setAllMessages(prev => ({
      ...prev,
      [pid]: [...(prev[pid] || []), { id: `user-${msgId}`, sender: 'user', text: userMsg, personaId: pid }]
    }));
    setInput('');
    setIsTyping(true);
    setViewTab('chat');
    
    if (activeTab === 'sentient') {
      updateInsight(pid, 3);
    }

    // Bridge log
    bridge.addMessage({ source: pid, sourceName: persona.name, sender: 'user', text: userMsg });

    // AI placeholder
    const responseId = `subj-${msgId}`;
    setAllMessages(prev => ({
      ...prev,
      [pid]: [...(prev[pid] || []), { id: responseId, sender: 'subject', text: '...', personaId: pid }]
    }));

    const chatKey = `${activeTab}-${pid}`;
    let chat = chats[chatKey];
    if (!chat) chat = getOrCreateChat(persona, activeTab);

    let fullResponseText = '';

    try {
      const stream = chat.sendMessageStream({ message: userMsg });
      for await (const chunk of stream) {
        fullResponseText += (chunk.text || '');
        setAllMessages(prev => ({
          ...prev,
          [pid]: (prev[pid] || []).map(m => m.id === responseId ? { ...m, text: fullResponseText } : m)
        }));
      }

      if (!fullResponseText.trim()) {
        throw new Error('The advisor returned an empty reply. Please retry.');
      }

      if (activeTab === 'sentient') {
        const moodRegex = /\[MOOD:\s*([^\]]+)\]/i;
        const match = fullResponseText.match(moodRegex);
        if (match) {
          fullResponseText = fullResponseText.replace(moodRegex, '').trim();
          setAllMessages(prev => ({
            ...prev,
            [pid]: (prev[pid] || []).map(m => m.id === responseId ? { ...m, text: fullResponseText } : m)
          }));
        }
      }

      bridge.addMessage({ source: pid, sourceName: persona.name, sender: 'ai', text: fullResponseText });

      // Check interjection (sentient only)
      if (activeTab === 'sentient') {
        const interjector = shouldInterject(userMsg, fullResponseText);
        if (interjector) {
          setInterjecting(interjector.name);
          try {
            const comment = await generateInterjection(selectedSentient, interjector, userMsg, fullResponseText);
            if (comment) {
              setAllMessages(prev => ({
                ...prev,
                [pid]: [...(prev[pid] || []), {
                  id: `interjection-${Date.now()}`,
                  sender: 'interjection',
                  text: comment,
                  personaId: pid,
                  interjectorName: interjector.name,
                  interjectorAvatar: interjector.avatar,
                  interjectorColor: interjector.color
                }]
              }));
              bridge.addMessage({ source: interjector.id, sourceName: interjector.name, sender: 'ai', text: `[Interjected] ${comment}` });
            }
          } catch {
            // Interjections are optional; never block the main reply.
          } finally {
            setInterjecting(null);
          }
        }
      }

    } catch (e) {
      console.error('[AIPersonas] chat failed', e);
      const friendly =
        e instanceof Error && e.message
          ? e.message
          : 'Failed to consult this advisor. Your draft is preserved; retry shortly.';
      setAllMessages(prev => ({
        ...prev,
        [pid]: (prev[pid] || []).map(m =>
          m.id === responseId
            ? { ...m, text: friendly }
            : m
        )
      }));
    } finally {
      setIsTyping(false);
      setInterjecting(null);
    }
  };

  return (
    <div
      className="relative flex flex-col flex-1 min-h-0 w-full h-full overflow-hidden animate-fadeIn p-2 sm:p-3"
      style={isMobile ? { height: `${vpHeight}px` } : undefined}
    >
      <SurfacePattern variant="dots" className="opacity-25" />
      <div className="relative z-10 flex flex-col flex-1 min-h-0 w-full overflow-hidden border border-brand-border rounded-xl bg-brand-bg-primary text-brand-text-primary">
      <div className="flex-shrink-0 p-2 sm:p-2.5 border-b border-brand-border">
        <RoomBanner
          image={personaSeal}
          dense
          eyebrow="Labs · personas"
          title="Advisor suite"
          subtitle="Pick a mind. Consult."
          trailing={
            <RoomTabs
              tabs={[
                { id: 'historical', label: 'Historical' },
                { id: 'sentient', label: 'Sentient' },
              ]}
              active={activeTab}
              onChange={(id) => {
                setActiveTab(id as 'historical' | 'sentient');
                setViewTab('info');
              }}
            />
          }
        />
      </div>

      {/* ─── MOBILE: Horizontal Persona Selector ─── */}
      <div className="md:hidden border-b border-brand-text-primary/10 bg-brand-bg-dark/30 flex-shrink-0">
        <div className="flex overflow-x-auto gap-1.5 px-3 py-2 custom-scrollbar">
          {activeTab === 'historical' ? (
            HISTORICAL_PERSONAS.map(p => {
              const isSelected = selectedHistorical.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setSelectedHistorical(p); setViewTab('info'); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-[10px] font-mono whitespace-nowrap flex-shrink-0 transition-all
                    ${isSelected ? 'bg-brand-text-primary text-brand-bg-primary border-white' : 'border-brand-text-primary/20 text-brand-text-secondary hover:border-brand-text-primary/40'}`}
                >
                  <span className={`h-5 w-5 border flex items-center justify-center text-[9px] font-bold ${isSelected ? 'border-black/20 bg-black/5 text-black' : 'border-brand-text-primary/30 bg-brand-bg-dark'}`}>
                    {p.avatar}
                  </span>
                  <span className="font-semibold">{p.name.split(' ')[1] || p.name}</span>
                </button>
              );
            })
          ) : (
            subjects.map(s => {
              const isSelected = selectedSentient.id === s.id;
              const score = insightScores[s.id] || 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelectedSentient(s); setViewTab('info'); }}
                  className={`flex flex-col items-center gap-1 px-2 py-1.5 border text-center min-w-[56px] flex-shrink-0 transition-all
                    ${isSelected ? 'bg-brand-text-primary text-brand-bg-primary border-white' : 'border-brand-text-primary/20 hover:border-brand-text-primary/40'}`}
                >
                  <span className={`h-6 w-6 border flex items-center justify-center text-[10px] font-bold ${isSelected ? 'border-black/20 bg-black/5 text-black' : 'border-brand-text-primary/30 bg-brand-bg-dark'}`}>
                    {s.avatar}
                  </span>
                  <span className={`text-[8px] font-mono truncate w-full ${isSelected ? 'text-black font-bold' : 'text-brand-text-secondary'}`}>
                    {s.name}
                  </span>
                  <div className={`w-full h-0.5 border overflow-hidden ${isSelected ? 'bg-black/10 border-black/10' : 'bg-brand-bg-secondary border-brand-text-primary/10'}`}>
                    <div className={`h-full transition-all ${isSelected ? 'bg-black' : 'bg-brand-accent'}`} style={{ width: `${score}%` }}></div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* ─── DESKTOP: Left Side Select list ─── */}
        <div className="hidden md:flex w-64 sm:w-80 border-r border-brand-border flex-col bg-brand-bg-secondary overflow-y-auto flex-shrink-0 relative min-h-0">
          <SurfacePattern variant="dots" className="opacity-50" />
          <div className="relative z-10 p-3 border-b border-brand-border">
            <span className="text-[11px] uppercase tracking-wide text-brand-text-secondary">Select advisor</span>
          </div>

          <div className="relative z-10 divide-y divide-brand-border">
            {activeTab === 'historical' ? (
              HISTORICAL_PERSONAS.map(p => {
                const isSelected = selectedHistorical.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelectedHistorical(p); setViewTab('info'); }}
                    className={`w-full text-left p-3.5 transition-colors hover:bg-[#1c1914]/[0.04] flex flex-col space-y-1 ${isSelected ? 'bg-[#1c1914]/[0.06] border-l-2 border-white' : 'border-l-2 border-transparent'}`}
                  >
                    <div className="flex items-center space-x-2">
                      <div className={`h-6 w-6 border border-brand-text-primary/30 flex items-center justify-center font-mono text-xs ${p.color} bg-brand-bg-primary`}>
                        {p.avatar}
                      </div>
                      <span className={`text-xs font-semibold ${isSelected ? 'text-brand-text-primary' : 'text-brand-text-primary'}`}>{p.name}</span>
                    </div>
                    <span className="text-[10px] text-brand-text-secondary line-clamp-1">{p.role}</span>
                  </button>
                );
              })
            ) : (
              subjects.map(s => {
                const isSelected = selectedSentient.id === s.id;
                const score = insightScores[s.id] || 0;
                const tier = getMasteryTier(score);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setSelectedSentient(s); setViewTab('info'); }}
                    className={`w-full text-left p-4 transition-colors hover:bg-[#1c1914]/[0.04] flex flex-col space-y-1.5 ${isSelected ? 'bg-[#1c1914]/[0.06] border-l-2 border-white' : 'border-l-2 border-transparent'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className={`h-6 w-6 border border-brand-text-primary/30 flex items-center justify-center font-mono text-xs ${s.color} bg-brand-bg-primary`}>
                          {s.avatar}
                        </div>
                        <span className={`text-xs font-semibold ${isSelected ? 'text-brand-text-primary' : 'text-brand-text-primary'}`}>{s.name}</span>
                      </div>
                      <span className="text-[9px] font-mono text-brand-text-secondary">({s.archetype})</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-[9px] text-brand-text-secondary">
                      <span>{s.title}</span>
                      <span className={tier.color}>{tier.name}</span>
                    </div>

                    <div className="w-full bg-brand-bg-secondary h-1 mt-0.5 border border-brand-text-primary/10 overflow-hidden">
                      <div className="bg-white/70 h-full transition-all duration-500" style={{ width: `${score}%` }}></div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ─── Main Content Area ─── */}
        <div className="flex-1 flex flex-col bg-brand-bg-primary overflow-hidden">
          
          {/* Header character status */}
          <div className="border-b border-brand-text-primary/10 bg-brand-bg-secondary/15 p-2 sm:p-4 flex-shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="space-y-0.5 sm:space-y-1">
              <h2 className="text-xs sm:text-sm font-serif font-bold text-brand-text-primary flex items-center space-x-1.5 sm:space-x-2">
                <span className={activePersonaColor}>●</span>
                <span>{activePersonaName}</span>
                {activeTab === 'sentient' && (
                  <span className="text-[9px] sm:text-[10px] font-mono bg-white/10 border border-white/20 px-1.5 py-0.5 text-brand-text-primary/80">
                    {selectedSentient.archetype}
                  </span>
                )}
              </h2>
              <p className="text-[10px] sm:text-xs text-brand-text-secondary font-light italic line-clamp-1">
                "{activeTab === 'historical' ? selectedHistorical.tagline : selectedSentient.tagline}"
              </p>
            </div>

            {/* Chat sub-tabs: white = active (design.md monochrome) */}
            <div className="flex border border-white/20 p-0.5 bg-black/40 text-[9px] sm:text-[10px] rounded-md">
              <button
                type="button"
                onClick={() => setViewTab('info')}
                className={`px-2 sm:px-3 py-1 font-mono uppercase rounded-sm ${viewTab === 'info' ? 'bg-brand-text-primary text-brand-bg-primary font-bold' : 'text-brand-text-secondary hover:text-brand-text-primary'}`}
              >
                Profile
              </button>
              <button
                type="button"
                onClick={() => setViewTab('chat')}
                className={`px-2 sm:px-3 py-1 font-mono uppercase rounded-sm ${viewTab === 'chat' ? 'bg-brand-text-primary text-brand-bg-primary font-bold' : 'text-brand-text-secondary hover:text-brand-text-primary'}`}
              >
                Chat
              </button>
              {activeTab === 'sentient' && (
                <button
                  type="button"
                  onClick={() => setViewTab('codex')}
                  className={`px-2 sm:px-3 py-1 font-mono uppercase rounded-sm ${viewTab === 'codex' ? 'bg-brand-text-primary text-brand-bg-primary font-bold' : 'text-brand-text-secondary hover:text-brand-text-primary'}`}
                >
                  Codex
                </button>
              )}
            </div>
          </div>

          {/* Body Section */}
          <div className="flex-1 overflow-hidden relative">
            
            {/* View 1: Profile */}
            {viewTab === 'info' && (
              <div className="absolute inset-0 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 custom-scrollbar max-w-3xl mx-auto">
                <div className="border border-brand-text-primary/20 p-3 sm:p-6 bg-brand-bg-dark/30 space-y-3 sm:space-y-4">
                  <div className="flex items-center space-x-3 sm:space-x-4">
                    <div className={`h-12 w-12 sm:h-16 sm:w-16 border-2 border-brand-text-primary/30 flex items-center justify-center font-mono text-xl sm:text-3xl bg-brand-bg-dark ${activePersonaColor}`}>
                      {activeTab === 'historical' ? selectedHistorical.avatar : selectedSentient.avatar}
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-serif font-bold text-brand-text-primary">{activePersonaName}</h3>
                      <p className="text-[10px] sm:text-xs text-brand-text-secondary font-mono uppercase tracking-wider">
                        {activeTab === 'historical' ? selectedHistorical.role : selectedSentient.title}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-brand-text-primary/10 pt-3 sm:pt-4">
                    <h4 className="text-[10px] sm:text-xs font-mono text-brand-text-secondary uppercase mb-2">System instruction</h4>
                    <p className="text-[10px] sm:text-xs leading-relaxed font-light text-brand-text-secondary">
                      {activeTab === 'historical' ? selectedHistorical.systemPrompt : selectedSentient.systemPrompt}
                    </p>
                  </div>

                  {activeTab === 'sentient' && (
                    <div className="border-t border-brand-text-primary/10 pt-3 sm:pt-4 space-y-2 sm:space-y-3">
                      <h4 className="text-[10px] sm:text-xs font-mono text-brand-text-secondary uppercase">Emotional registers</h4>
                      <div className="grid grid-cols-2 gap-2 sm:gap-4 text-[10px] sm:text-xs font-mono text-brand-text-secondary">
                        <div>Cynicism: {Math.round(selectedSentient.emotionalRegisters.cynicism * 100)}%</div>
                        <div>Intensity: {Math.round(selectedSentient.emotionalRegisters.intensity * 100)}%</div>
                        <div>Empathy: {Math.round(selectedSentient.emotionalRegisters.empathy * 100)}%</div>
                        <div>Patience: {Math.round(selectedSentient.emotionalRegisters.patience * 100)}%</div>
                      </div>
                    </div>
                  )}

                  <div className="pt-3 sm:pt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setViewTab('chat')}
                      className="px-4 sm:px-6 py-2.5 bg-brand-text-primary text-brand-bg-primary hover:bg-white/90 font-mono text-[10px] sm:text-xs uppercase tracking-wide font-semibold border border-white transition-colors"
                    >
                      Open chat
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* View 2: Codex (Sentient Subjects only) */}
            {viewTab === 'codex' && activeTab === 'sentient' && (
              <div className="absolute inset-0 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 custom-scrollbar max-w-4xl mx-auto">
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <h3 className="text-lg sm:text-xl font-serif font-bold text-brand-text-primary">{selectedSentient.codex.name}</h3>
                    <p className="text-[10px] sm:text-xs text-brand-text-secondary mt-1">{selectedSentient.codex.description}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:gap-4 mt-4 sm:mt-6">
                    {selectedSentient.codex.maxims.map(m => {
                      const isStudied = (studiedMaxims[selectedSentient.id] || []).includes(m.id);
                      return (
                        <div key={m.id} className="border border-brand-text-primary/20 bg-brand-bg-dark/20 p-3 sm:p-5 space-y-2 sm:space-y-3 transition-colors hover:border-white/25">
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                            <div>
                              <span className="text-[9px] sm:text-[10px] font-mono text-brand-text-secondary uppercase tracking-wider">{m.concept}</span>
                              <h4 className="text-xs sm:text-sm font-serif font-bold text-brand-text-primary mt-1">{m.name}</h4>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleStudy(m.id)}
                              disabled={isStudied}
                              className={`px-2.5 sm:px-3 py-1.5 border text-[9px] sm:text-[10px] font-mono uppercase tracking-wider flex-shrink-0 transition-colors ${
                                isStudied
                                  ? 'border-brand-border text-brand-text-secondary bg-[#1c1914]/[0.05] cursor-default'
                                  : 'bg-brand-text-primary text-brand-bg-primary border-white hover:bg-white/90 font-semibold'
                              }`}
                            >
                              {isStudied ? 'Studied' : 'Study'}
                            </button>
                          </div>
                          <div className="p-2 sm:p-3 bg-brand-bg-dark/40 border-l-2 border-white/40 font-serif italic text-[10px] sm:text-xs text-brand-text-primary/95 leading-relaxed">
                            "{m.maxim}"
                          </div>
                          <p className="text-[10px] sm:text-xs text-brand-text-secondary leading-relaxed font-light">{m.explanation}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* View 3: Chat terminal */}
            {viewTab === 'chat' && (
              <div className="absolute inset-0 flex flex-col justify-between">
                
                {/* Chat dialogue terminal panel */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 custom-scrollbar">
                  {messages.map(m => {
                    const isUser = m.sender === 'user';
                    const isInterjection = m.sender === 'interjection';

                    if (isInterjection) {
                      return (
                        <div key={m.id} className="flex justify-center my-2 sm:my-3 animate-fadeIn">
                          <div className="border border-white/20 bg-brand-bg-secondary/80 p-3 sm:p-4 max-w-lg text-[10px] sm:text-xs leading-relaxed space-y-2 border-l-4 border-l-white/50">
                            <div className="flex items-center space-x-2 border-b border-brand-text-primary/10 pb-1.5">
                              <span className={`h-5 w-5 border border-brand-text-primary/30 flex items-center justify-center font-mono text-[10px] bg-brand-bg-primary ${m.interjectorColor}`}>
                                {m.interjectorAvatar}
                              </span>
                              <span className="font-mono font-bold text-brand-text-primary/80 uppercase text-[9px] sm:text-[10px]">{m.interjectorName} interjected</span>
                            </div>
                            <p className="font-light italic text-brand-text-primary/95">"{m.text}"</p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
                        <div className={`flex items-start space-x-2 sm:space-x-3 max-w-[90%] sm:max-w-[70%]`}>
                          {!isUser && (
                            <div className={`h-7 w-7 sm:h-8 sm:w-8 border border-brand-text-primary/20 flex items-center justify-center font-mono text-xs sm:text-sm bg-brand-bg-dark flex-shrink-0 ${activePersonaColor}`}>
                              {activeTab === 'historical' ? selectedHistorical.avatar : selectedSentient.avatar}
                            </div>
                          )}
                          
                          <div className={`p-2.5 sm:p-3 border leading-relaxed text-[11px] sm:text-xs ${isUser ? 'border-white/25 bg-[#1c1914]/[0.06] text-brand-text-primary' : 'border-brand-text-primary/20 bg-brand-bg-dark/20 text-brand-text-primary'}`}>
                            <div className="max-w-none">
                              {renderLegalMarkdown(m.text)}
                            </div>
                          </div>

                          {isUser && (
                            <div className="h-7 w-7 sm:h-8 sm:w-8 border border-white/30 flex items-center justify-center font-mono text-xs sm:text-sm bg-brand-bg-dark text-brand-text-primary/80 flex-shrink-0">
                              U
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className="flex justify-start items-center space-x-2 p-2 text-[10px] sm:text-xs font-mono text-brand-text-secondary">
                      <div className="h-2 w-2 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="h-2 w-2 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="h-2 w-2 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      <span>{interjecting ? `${interjecting} typing...` : `${activePersonaName} thinking...`}</span>
                    </div>
                  )}
                  {/* Scroll anchor (must be end of stream, not the scroll container) */}
                  <div ref={chatEndRef} aria-hidden className="h-px w-full" />
                </div>

                {/* Footer Input Console bar */}
                <div className="border-t border-brand-text-primary/10 bg-brand-bg-dark/30 p-2 sm:p-3 flex-shrink-0 flex items-center space-x-2 sm:space-x-3">
                  <input
                    type="text"
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                    placeholder={`Query ${activePersonaName}...`}
                    disabled={isTyping}
                    aria-label={`Message ${activePersonaName}`}
                    className="flex-1 bg-brand-bg-dark border border-brand-text-primary/30 p-2 sm:p-2.5 text-[11px] sm:text-xs text-brand-text-primary placeholder-zinc-500 focus:outline-none focus:border-white/40 font-light"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={isTyping || !input.trim()}
                    className={`px-3 sm:px-5 py-2 sm:py-2.5 font-mono text-[10px] sm:text-xs uppercase tracking-wide transition-colors flex items-center space-x-1.5 ${
                      isTyping || !input.trim()
                        ? 'border border-brand-text-primary/20 text-brand-text-secondary cursor-not-allowed'
                        : 'bg-brand-text-primary text-brand-bg-primary border border-white hover:bg-white/90 font-semibold'
                    }`}
                  >
                    <span>Send</span>
                  </button>
                </div>

              </div>
            )}
            
          </div>
        </div>

      </div>

      {/* Breakthrough Modal */}
      {breakthrough && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="max-w-md w-full border border-white/25 bg-brand-bg-primary p-4 sm:p-6 space-y-3 sm:space-y-4 relative">
            <div className="flex items-center space-x-3 text-brand-text-primary border-b border-white/15 pb-3">
              <span className="text-xl" aria-hidden>⚔</span>
              <h4 className="font-mono font-bold uppercase tracking-wider text-[10px] sm:text-xs">Mastery breakthrough</h4>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] sm:text-xs text-brand-text-secondary leading-normal">
                Your legal insight has expanded in this domain. You have reached:
              </p>
              <h3 className={`text-base sm:text-lg font-serif font-bold ${breakthrough.color}`}>{breakthrough.realmName}</h3>
            </div>

            <div className="p-3 sm:p-4 bg-brand-bg-dark/60 border-l-2 border-white/40 font-serif italic text-[10px] sm:text-xs leading-relaxed text-brand-text-primary/90">
              "{breakthrough.quote}"
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setBreakthrough(null)}
                className="px-4 py-2 bg-brand-text-primary text-brand-bg-primary hover:bg-white/90 text-[12px] font-semibold border border-white"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default AIPersonasScreen;
