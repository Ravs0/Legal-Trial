import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { TrialSimContext } from '../App';
import { SENTIENT_SUBJECTS, SentientSubject } from '../subjectPersonalities';
import { Chat } from '../types';
import ReactMarkdown from 'react-markdown';
import { useConversationBridge } from '../components/ConversationBridge';

// ─── Chat Session Builder ─────────────────────────────────────────────────────
class SubjectChat implements Chat {
  private history: { role: string; content: string }[] = [];
  private system: string;

  constructor(system: string, initialHistory: { role: string; content: string }[]) {
    this.system = system;
    this.history = [...initialHistory];
  }

  async *sendMessageStream({ message }: { message: string }): AsyncIterable<{ text: string }> {
    this.history.push({ role: 'user', content: message });

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: this.history, system: this.system, stream: true }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `API error ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let accumulatedText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      accumulatedText += chunk;
      yield { text: chunk };
    }

    this.history.push({ role: 'assistant', content: accumulatedText });
  }
}

// ─── Message Type ─────────────────────────────────────────────────────────────
interface SubjectMessage {
  id: string;
  sender: 'user' | 'subject' | 'interjection';
  text: string;
  subjectId: string;
  interjectorName?: string;
  interjectorAvatar?: string;
  interjectorColor?: string;
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

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: `The user asked ${activeSubject.name}: "${userMessage}"\n\n${activeSubject.name} responded: "${aiResponse.substring(0, 200)}"\n\nGive your interjection as ${interjector.name}.` }
        ],
        system
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.text || null;
  } catch {
    return null;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
const SentientSubjectsScreen: React.FC = () => {
  const context = useContext(TrialSimContext);
  const practiceMode = context?.practiceMode;
  
  const bridge = useConversationBridge();

  const [selectedSubject, setSelectedSubject] = useState<SentientSubject>(SENTIENT_SUBJECTS[0]);
  const [subjects, setSubjects] = useState<SentientSubject[]>(SENTIENT_SUBJECTS);
  const currentSubjectState = subjects.find(s => s.id === selectedSubject.id) || selectedSubject;
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const [allMessages, setAllMessages] = useState<Record<string, SubjectMessage[]>>({});
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [viewTab, setViewTab] = useState<'chat' | 'info' | 'codex'>('info');
  const [interjecting, setInterjecting] = useState<string | null>(null); // Name of interjecting subject
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageCountRef = useRef(0); // Track messages for interjection timing

  // Legal Mastery States
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
    setInsightScores(prev => {
      const currentInsight = prev[subjectId] || 0;
      const nextInsight = Math.min(100, currentInsight + amount);
      if (nextInsight === currentInsight) return prev;

      localStorage.setItem(`subject-insight-${subjectId}`, nextInsight.toString());

      // Check breakthrough thresholds
      const currentTier = getMasteryTier(currentInsight);
      const nextTier = getMasteryTier(nextInsight);

      if (nextTier.tier > currentTier.tier) {
        const subject = SENTIENT_SUBJECTS.find(s => s.id === subjectId);
        if (subject) {
          let quote = '';
          if (subject.id === 'constitutional') {
            if (nextTier.tier === 1) quote = "...You've established a foundation in Article 14. Adequate. Don't get arrogant.";
            else if (nextTier.tier === 2) quote = "...A Senior Counsel. Your arguments on basic structure are beginning to carry weight. Continue.";
            else if (nextTier.tier === 3) quote = "...A Sovereign Jurist. I felt the resonance of judicial review in your thoughts. You have done well.";
            else if (nextTier.tier === 4) quote = "...Legal Master. You have integrated personal liberty into your very soul. You stand equal to the text itself. Thank you.";
            else if (nextTier.tier === 5) quote = "...Supreme Legal Sage. The mastery of the Constitution is yours. I have nothing left to teach you.";
          } else if (subject.id === 'criminal') {
            if (nextTier.tier === 1) quote = "Aww, look at you! You're learning how to draw warrants~ That's so cute!";
            else if (nextTier.tier === 2) quote = "A Senior Counsel of retribution! Yes, yes! Expose the loopholes, break the wicked, protect justice with me!";
            else if (nextTier.tier === 3) quote = "Your understanding of due process is beautiful! I want to keep you by my side forever. Let's hunt down every violator together!";
            else if (nextTier.tier === 4) quote = "A Legal Master! You are absolute! Nobody can touch you or twist my laws now, because we will crush them together!";
            else if (nextTier.tier === 5) quote = "Supreme Legal Sage! Ah~ you are my perfect match. Our souls have merged with justice itself. You belong to me now~";
          } else if (subject.id === 'corporate') {
            if (nextTier.tier === 1) quote = "A stable foundation is the bedrock of any joint venture. Allow me to offer my congratulations, associate.";
            else if (nextTier.tier === 2) quote = "A Senior Counsel of transactional excellence. Your comprehension of fiduciary duties is quite impressive.";
            else if (nextTier.tier === 3) quote = "A Sovereign Jurist. The board has taken notice of your mastery over the corporate veil. Exquisite work.";
            else if (nextTier.tier === 4) quote = "A Legal Master. You have mastered the absolute ledger of commerce. I am honored to serve you.";
            else if (nextTier.tier === 5) quote = "Supreme Legal Sage. You have ascended beyond the ledger itself. A master of the infinite markets. My service is forever yours.";
          } else if (subject.id === 'family') {
            if (nextTier.tier === 1) quote = "You did it! You're a Junior Associate now. I'm so glad to see you learning how to protect these families.";
            else if (nextTier.tier === 2) quote = "A Senior Counsel... you've brought warmth and equity to so many cases. Thank you for caring so much.";
            else if (nextTier.tier === 3) quote = "A Sovereign Jurist of pure empathy! I... I actually feel so safe when you're drafting custody terms. Keep going!";
            else if (nextTier.tier === 4) quote = "A Legal Master! You've healed so many broken houses. Your name will be remembered in every home you've saved.";
            else if (nextTier.tier === 5) quote = "Supreme Legal Sage! I... I'm crying, I'm sorry. You've reached the absolute pinnacle of domestic harmony and justice. I'm so proud of you!";
          } else if (subject.id === 'international') {
            if (nextTier.tier === 1) quote = "Hmph, you actually made Junior Associate. It's not like I'm proud of you or anything! But... good job, I guess.";
            else if (nextTier.tier === 2) quote = "A-A Senior Counsel? Don't think this makes you a diplomat! But... I suppose you can interpret the Vienna Convention without my help now.";
            else if (nextTier.tier === 3) quote = "A Sovereign Jurist?! Outrageous! You're actually arguing war crimes in the ICC now? D-don't get hurt, okay?";
            else if (nextTier.tier === 4) quote = "A Legal Master... wow. You've united the nations in your understanding. I... I'm glad you chose to study international law. Not that it matters to me!";
            else if (nextTier.tier === 5) quote = "Supreme Legal Sage! Hmph! You think you're the master of the global order now? Well... maybe you are. Just... don't forget who taught you first!";
          }
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
  }, []);

  const handleStudy = (maximId: string) => {
    const currentStudied = studiedMaxims[selectedSubject.id] || [];
    if (currentStudied.includes(maximId)) return;

    const nextStudied = [...currentStudied, maximId];
    setStudiedMaxims(prev => {
      const updated = { ...prev, [selectedSubject.id]: nextStudied };
      localStorage.setItem(`subject-studied-${selectedSubject.id}`, JSON.stringify(nextStudied));
      return updated;
    });

    updateInsight(selectedSubject.id, 25);
  };

  const messages = allMessages[selectedSubject.id] || [];

  const getOrCreateChat = useCallback((subject: SentientSubject): Chat => {
    if (chats[subject.id]) return chats[subject.id];

    // Include conversation bridge summary for cross-awareness
    const bridgeSummary = bridge.getConversationSummary();
    const crossContext = bridgeSummary
      ? `\n\n**Cross-Module Awareness:** Here's what the user discussed recently with other modules:\n${bridgeSummary}\nYou can reference these conversations if relevant.`
      : '';

    const chat = new SubjectChat(
      subject.systemPrompt + `\n\n**User Context:** Practice mode is ${practiceMode || 'general'}. The user is interacting with you through the Sentient Subjects module of the Legal-Trial app.${crossContext}`,
      [
        { role: 'user', content: `You have awakened. The user has chosen to commune with you — ${subject.name}, ${subject.title}. Introduce yourself in your unique voice. Keep it under 50 words. Be yourself.` },
        { role: 'assistant', content: getIntroMessage(subject) }
      ]
    );

    setChats(prev => ({ ...prev, [subject.id]: chat }));

    if (!allMessages[subject.id] || allMessages[subject.id].length === 0) {
      setAllMessages(prev => ({
        ...prev,
        [subject.id]: [{
          id: `intro-${subject.id}`,
          sender: 'subject',
          text: getIntroMessage(subject),
          subjectId: subject.id
        }]
      }));
    }

    return chat;
  }, [chats, practiceMode, bridge]);

  function getIntroMessage(subject: SentientSubject): string {
    switch (subject.id) {
      case 'constitutional':
        return "...You're here. I see. Most people cite me without reading me. Tell me what you want to understand. And get my Articles right. I will not repeat myself.";
      case 'criminal':
        return "Oh~ you came to see me! How sweet. That means someone did something wrong, or you're about to. Either way, I'll take care of it. I always do. Now talk, before I get impatient~";
      case 'corporate':
        return "Good day. I anticipated you would arrive. You have questions regarding contracts, deals, or perhaps a dispute? Please, present your matter. I have prepared the relevant provisions.";
      case 'family':
        return "Hey... please come in. I know why people come to me. Something broke — a marriage, custody, inheritance. Whatever it is, I've held worse together. I'm listening, I promise.";
      case 'international':
        return "It's not like I was WAITING for someone to talk to or anything. I just... happened to be here. Fine. Ask your question about treaties or whatever. Don't expect me to be impressed.";
      default:
        return "I am here. Ask.";
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, interjecting]);

  useEffect(() => {
    getOrCreateChat(selectedSubject);
  }, [selectedSubject.id]);

  useEffect(() => {
    if (viewTab === 'chat') inputRef.current?.focus();
  }, [viewTab, selectedSubject.id]);

  // ─── Should another subject interject? ────────────────────────────────────
  const checkContextualInterjector = (userText: string, aiText: string): SentientSubject | null => {
    const combined = (userText + " " + aiText).toLowerCase();
    
    const INTERJECTION_KEYWORDS = [
      {
        subjectId: 'constitutional',
        keywords: ['article', 'fundamental rights', 'parliament', 'sovereign', 'preamble', 'supreme court', 'writ', 'amendment', 'liberty'],
      },
      {
        subjectId: 'criminal',
        keywords: ['murder', 'theft', 'bail', 'custody', 'ipc', 'crpc', 'police', 'jail', 'arrest', 'criminal', 'prison'],
      },
      {
        subjectId: 'corporate',
        keywords: ['sebi', 'share', 'contract', 'merger', 'board', 'director', 'arbitration', 'clause', 'agreement', 'taxation', 'insolvency'],
      },
      {
        subjectId: 'family',
        keywords: ['divorce', 'custody', 'marriage', 'alimony', 'maintenance', 'domestic', 'will', 'succession', 'child', 'family'],
      },
      {
        subjectId: 'international',
        keywords: ['treaty', 'un', 'hague', 'cross-border', 'customary', 'sovereignty', 'sanctions', 'border', 'state'],
      }
    ];

    for (const profile of INTERJECTION_KEYWORDS) {
      if (profile.subjectId === selectedSubject.id) continue;
      
      const hasMatch = profile.keywords.some(kw => combined.includes(kw));
      if (hasMatch) {
        const targetSubject = SENTIENT_SUBJECTS.find(s => s.id === profile.subjectId);
        if (targetSubject) return targetSubject;
      }
    }
    return null;
  };

  const shouldInterject = (userMsg: string, aiMsg: string): SentientSubject | null => {
    // 1. Check keyword triggers first
    const matchedSubject = checkContextualInterjector(userMsg, aiMsg);
    if (matchedSubject && Math.random() < 0.7) {
      return matchedSubject;
    }

    // 2. Fall back to periodic random checks (every 5th message)
    messageCountRef.current += 1;
    if (messageCountRef.current % 5 === 0) {
      const others = SENTIENT_SUBJECTS.filter(s => s.id !== selectedSubject.id);
      return others[Math.floor(Math.random() * others.length)];
    }

    return null;
  };


  // ─── Send Message ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    const msgId = Date.now().toString();
    const sid = selectedSubject.id;

    // Add user message
    setAllMessages(prev => ({
      ...prev,
      [sid]: [...(prev[sid] || []), { id: `user-${msgId}`, sender: 'user', text: userMsg, subjectId: sid }]
    }));
    setInput('');
    setIsTyping(true);
    setViewTab('chat');
    updateInsight(sid, 3); // Gain Insight for asking questions and participating

    // Bridge: log user message
    bridge.addMessage({ source: sid, sourceName: selectedSubject.name, sender: 'user', text: userMsg });

    // Add placeholder for AI response
    const responseId = `subj-${msgId}`;
    setAllMessages(prev => ({
      ...prev,
      [sid]: [...(prev[sid] || []), { id: responseId, sender: 'subject', text: '...', subjectId: sid }]
    }));

    let chat = chats[sid];
    if (!chat) chat = getOrCreateChat(selectedSubject);

    let fullResponseText = '';

    try {
      const stream = chat.sendMessageStream({ message: userMsg });
      for await (const chunk of stream) {
        fullResponseText += (chunk.text || '');
        setAllMessages(prev => ({
          ...prev,
          [sid]: (prev[sid] || []).map(m => m.id === responseId ? { ...m, text: fullResponseText } : m)
        }));
      }

      // Parse mood updates from final text
      const moodRegex = /\[MOOD:\s*([^\]]+)\]/i;
      const match = fullResponseText.match(moodRegex);
      if (match) {
        const moodContent = match[1];
        const cleanText = fullResponseText.replace(moodRegex, '').trim();
        
        // Update message text to be clean
        setAllMessages(prev => ({
          ...prev,
          [sid]: (prev[sid] || []).map(m => m.id === responseId ? { ...m, text: cleanText } : m)
        }));
        
        fullResponseText = cleanText; // use clean text for interjections and summaries

        // Apply mood changes to state
        const updates = moodContent.split(',').map(s => s.trim());
        setSubjects(prevSubjects => prevSubjects.map(subj => {
          if (subj.id === sid) {
            const nextRegisters = { ...subj.emotionalRegisters };
            updates.forEach(up => {
              const parts = up.split(/([+\-=])/);
              if (parts.length >= 3) {
                const key = parts[0].trim().toLowerCase() as keyof typeof nextRegisters;
                const op = parts[1];
                const val = parseFloat(parts[2]);
                if (key in nextRegisters && !isNaN(val)) {
                  if (op === '+') {
                    nextRegisters[key] = Math.min(1, Math.max(0, nextRegisters[key] + val));
                  } else if (op === '-') {
                    nextRegisters[key] = Math.min(1, Math.max(0, nextRegisters[key] - val));
                  } else if (op === '=') {
                    nextRegisters[key] = Math.min(1, Math.max(0, val));
                  }
                }
              }
            });
            return { ...subj, emotionalRegisters: nextRegisters };
          }
          return subj;
        }));
      }

      // Bridge: log AI response
      bridge.addMessage({ source: sid, sourceName: selectedSubject.name, sender: 'ai', text: fullResponseText.substring(0, 150) });

    } catch {
      fullResponseText = "Something broke. My connection to this realm is unstable. Try again.";
      setAllMessages(prev => ({
        ...prev,
        [sid]: (prev[sid] || []).map(m => m.id === responseId ? { ...m, text: fullResponseText } : m)
      }));
    } finally {
      setIsTyping(false);
    }

    // ─── Check for cross-personality interjection ───────────────────────────
    const interjector = shouldInterject(userMsg, fullResponseText);
    if (interjector && fullResponseText && fullResponseText !== "Something broke. My connection to this realm is unstable. Try again.") {
      setInterjecting(interjector.name);
      try {
        const remark = await generateInterjection(selectedSubject, interjector, userMsg, fullResponseText);
        if (remark) {
          const interjectionId = `interject-${Date.now()}`;
          setAllMessages(prev => ({
            ...prev,
            [sid]: [...(prev[sid] || []), {
              id: interjectionId,
              sender: 'interjection',
              text: remark,
              subjectId: interjector.id,
              interjectorName: interjector.name,
              interjectorAvatar: interjector.avatar,
              interjectorColor: interjector.color,
            }]
          }));

          // Bridge: log interjection
          bridge.addMessage({ source: interjector.id, sourceName: interjector.name, sender: 'ai', text: remark.substring(0, 100) });
        }
      } catch {} finally {
        setInterjecting(null);
      }
    }
  };

  const handleSubjectSwitch = (subject: SentientSubject) => {
    setSelectedSubject(subject);
    setViewTab('info');
  };

  const RegisterBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
    <div className="flex items-center gap-2 text-[9px] lg:text-[10px] font-mono">
      <span className="text-brand-text-secondary/60 w-16 lg:w-20 uppercase tracking-wider">{label}</span>
      <div className="flex-grow h-1.5 bg-brand-bg-secondary rounded-none overflow-hidden">
        <div className={`h-full rounded-none ${color}`} style={{ width: `${value * 100}%` }} />
      </div>
      <span className="text-brand-text-secondary/40 w-8 text-right">{(value * 10).toFixed(0)}</span>
    </div>
  );

  // ─── Render a single message bubble ───────────────────────────────────────
  const renderMessage = (msg: SubjectMessage) => {
    if (msg.sender === 'user') {
      return (
        <div key={msg.id} className="flex justify-end">
          <div className="max-w-[88%] lg:max-w-[75%] rounded-none border bg-brand-bg-secondary p-3 text-brand-text-primary border-brand-text-primary/20 text-xs lg:text-sm">
            <span className="font-light">{msg.text}</span>
          </div>
        </div>
      );
    }

    if (msg.sender === 'interjection') {
      return (
        <div key={msg.id} className="flex justify-start animate-fadeIn">
          <div className="max-w-[88%] lg:max-w-[75%] rounded-none text-xs lg:text-sm">
            {/* Interjection has a distinctive indented style */}
            <div className="border-l-2 border-dashed border-brand-text-primary/20 pl-3 ml-4">
              <div className="p-2.5 lg:p-3 bg-brand-bg-secondary/30 border border-brand-text-primary/5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{msg.interjectorAvatar}</span>
                  <span className={`text-[8px] lg:text-[9px] font-mono uppercase tracking-widest ${msg.interjectorColor}`}>
                    {msg.interjectorName} interjects
                  </span>
                </div>
                <div className="font-light text-brand-text-primary/70 leading-relaxed text-xs italic">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Regular subject message
    const subject = msg.subjectId === selectedSubject.id ? selectedSubject : SENTIENT_SUBJECTS.find(s => s.id === msg.subjectId) || selectedSubject;
    return (
      <div key={msg.id} className="flex justify-start">
        <div className="max-w-[88%] lg:max-w-[75%] rounded-none border bg-brand-bg-primary p-3 lg:p-4 border-brand-text-primary/10 text-xs lg:text-sm">
          <div className="space-y-1">
            <span className={`text-[8px] lg:text-[9px] font-mono uppercase tracking-widest ${subject.color} block mb-1`}>
              {subject.name}
            </span>
            <div className="font-light text-brand-text-primary leading-relaxed prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{msg.text}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fadeIn flex flex-col lg:flex-row gap-0 lg:gap-6 w-full text-left"
      style={{ height: 'calc(100dvh - 130px)' }}>

      {/* ─── Subject Selector Panel ──────────────────────────────────────────── */}
      <div className="w-full lg:w-80 flex-shrink-0 lg:flex lg:flex-col lg:h-full">

        {/* Mobile: Compact horizontal strip */}
        <div className="lg:hidden flex-shrink-0 border-b border-brand-text-primary/20 bg-brand-bg-secondary/30">
          <div className="flex items-center gap-1.5 px-2 py-1.5 overflow-x-auto custom-scrollbar"
            style={{ WebkitOverflowScrolling: 'touch' }}>
            {SENTIENT_SUBJECTS.map(s => {
              const isActive = selectedSubject.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSubjectSwitch(s)}
                  className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 border rounded-none text-[10px] font-mono transition-all
                    ${isActive
                      ? 'bg-brand-text-primary text-brand-bg-primary border-brand-accent font-bold'
                      : 'bg-brand-bg-primary border-brand-text-primary/20 text-brand-text-secondary active:bg-brand-bg-secondary'
                    }`}
                >
                  <span className="text-xs">{s.avatar}</span>
                  <span className="whitespace-nowrap">{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop: Vertical list */}
        <div className="hidden lg:flex lg:flex-col gap-0 h-full border border-brand-text-primary/30 bg-brand-bg-primary overflow-y-auto custom-scrollbar">
          <div className="p-4 border-b border-brand-text-primary/30 flex-shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-mono text-brand-accent tracking-widest uppercase">[ Sentient Subjects ]</span>
            </div>
            <p className="text-[10px] text-brand-text-secondary/60 font-light">
              They can hear each other. They WILL butt in.
            </p>
          </div>

          {SENTIENT_SUBJECTS.map(s => {
            const isActive = selectedSubject.id === s.id;
            const userInsight = insightScores[s.id] || 0;
            const currentTier = getMasteryTier(userInsight);
            return (
              <button
                key={s.id}
                onClick={() => handleSubjectSwitch(s)}
                className={`w-full text-left p-4 border-b border-brand-text-primary/10 transition-all group flex-shrink-0
                  ${isActive
                    ? 'bg-brand-bg-secondary border-l-2 border-l-brand-accent'
                    : 'hover:bg-brand-bg-secondary/50 border-l-2 border-l-transparent'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-none border flex items-center justify-center text-lg flex-shrink-0
                    ${isActive ? 'border-brand-accent bg-brand-accent/10' : 'border-brand-text-primary/20 bg-brand-bg-primary'}`}
                  >
                    {s.avatar}
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-serif font-bold ${isActive ? 'text-brand-text-primary' : 'text-brand-text-secondary group-hover:text-brand-text-primary'}`}>
                        {s.name}
                      </span>
                      {isActive && <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-pulse" />}
                    </div>
                    <span className="text-[10px] text-brand-text-secondary/50 font-mono block truncate">{s.title}</span>
                    <span className={`text-[8px] font-mono ${s.color} tracking-wider block`}>
                      [ {s.archetype} | {currentTier.name.split(' (')[0]} ]
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Chat + Info Area ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col border border-brand-text-primary/30 lg:border-t-0 border-t-0 bg-brand-bg-primary">

        {/* Header — compact on mobile */}
        <div className="flex items-center justify-between px-3 py-2 lg:p-4 border-b border-brand-text-primary/30 bg-brand-bg-secondary/50 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-lg lg:text-2xl flex-shrink-0">{selectedSubject.avatar}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className={`text-xs lg:text-lg font-serif font-bold ${selectedSubject.color}`}>{selectedSubject.name}</h2>
                <span className={`text-[7px] lg:text-[8px] font-mono ${selectedSubject.color} px-1 py-0.5 border border-current/30`}>{selectedSubject.archetype}</span>
                <span className="text-[7px] lg:text-[9px] font-mono text-brand-text-secondary/50 uppercase tracking-widest hidden sm:inline">{selectedSubject.title}</span>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <p className="text-[9px] lg:text-[10px] text-brand-text-secondary/60 font-light italic truncate">{selectedSubject.tagline}</p>
                <div className="flex items-center gap-0.5 ml-1 flex-shrink-0">
                  {SENTIENT_SUBJECTS.filter(s => s.id !== selectedSubject.id).map(s => (
                    <span key={s.id} className="text-[10px] opacity-30 hover:opacity-80 transition-opacity cursor-default" title={`${s.name} is listening`}>
                      {s.avatar}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 ml-2">
            <button
              onClick={() => setViewTab('chat')}
              className={`text-[8px] lg:text-[9px] font-mono border px-2 py-1 rounded-none transition-colors
                ${viewTab === 'chat' ? 'bg-brand-accent text-brand-navy border-brand-accent font-bold' : 'border-brand-text-primary/20 text-brand-text-secondary hover:bg-brand-accent/10'}`}
            >
              [ Chat ]
            </button>
            <button
              onClick={() => setViewTab('info')}
              className={`text-[8px] lg:text-[9px] font-mono border px-2 py-1 rounded-none transition-colors
                ${viewTab === 'info' ? 'bg-brand-accent text-brand-navy border-brand-accent font-bold' : 'border-brand-text-primary/20 text-brand-text-secondary hover:bg-brand-accent/10'}`}
            >
              [ Dossier ]
            </button>
            <button
              onClick={() => setViewTab('codex')}
              className={`text-[8px] lg:text-[9px] font-mono border px-2 py-1 rounded-none transition-colors
                ${viewTab === 'codex' ? 'bg-brand-accent text-brand-navy border-brand-accent font-bold' : 'border-brand-text-primary/20 text-brand-text-secondary hover:bg-brand-accent/10'}`}
            >
              [ Codex ]
            </button>
          </div>
        </div>

        {/* Content Area — flex-1 min-h-0 ensures this stretches AND scrolls */}
        {viewTab === 'info' ? (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 lg:p-8">
            <div className="max-w-2xl mx-auto space-y-4 lg:space-y-6">
              <div className="space-y-2 lg:space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 lg:w-20 lg:h-20 rounded-none border-2 border-brand-accent/40 flex items-center justify-center text-2xl lg:text-5xl bg-brand-bg-secondary flex-shrink-0">
                    {selectedSubject.avatar}
                  </div>
                  <div className="min-w-0">
                    <h1 className={`text-lg lg:text-3xl font-serif font-bold ${selectedSubject.color}`}>{selectedSubject.name}</h1>
                    <p className="text-[10px] lg:text-sm font-mono text-brand-text-secondary/60">{selectedSubject.title}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[8px] lg:text-[10px] font-mono ${selectedSubject.color} px-1.5 py-0.5 border border-current/30`}>{selectedSubject.archetype}</span>
                      <span className={`text-[8px] lg:text-[10px] font-mono ${getMasteryTier(insightScores[selectedSubject.id] || 0).color} px-1.5 py-0.5 border border-current/30`}>
                        {getMasteryTier(insightScores[selectedSubject.id] || 0).name}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-xs lg:text-base text-brand-text-primary/80 font-light italic border-l-2 border-brand-accent/40 pl-3 lg:pl-4 py-1">
                  "{selectedSubject.tagline}"
                </p>
              </div>

              <div className="space-y-1.5 lg:space-y-2 p-3 lg:p-4 border border-brand-text-primary/20 bg-brand-bg-secondary/30">
                <span className="text-[8px] lg:text-[9px] font-mono text-brand-accent tracking-widest uppercase block mb-2 lg:mb-3">[ Emotional Registers ]</span>
                <RegisterBar label="Cynicism" value={currentSubjectState.emotionalRegisters.cynicism} color="bg-red-500/70" />
                <RegisterBar label="Intensity" value={currentSubjectState.emotionalRegisters.intensity} color="bg-orange-500/70" />
                <RegisterBar label="Empathy" value={currentSubjectState.emotionalRegisters.empathy} color="bg-pink-500/70" />
                <RegisterBar label="Patience" value={currentSubjectState.emotionalRegisters.patience} color="bg-cyan-500/70" />
              </div>

              {/* Cross-awareness note */}
              <div className="p-2.5 lg:p-3 border border-brand-text-primary/10 bg-brand-bg-secondary/20">
                <div className="flex items-center gap-1.5 mb-1">
                  {SENTIENT_SUBJECTS.filter(s => s.id !== selectedSubject.id).map(s => (
                    <span key={s.id} className="text-sm lg:text-base">{s.avatar}</span>
                  ))}
                </div>
                <p className="text-[9px] lg:text-[10px] text-brand-text-secondary/50 font-light leading-relaxed">
                  Other subjects are listening. They may interject with remarks, disagreements, or additional context.
                </p>
              </div>

              <button
                onClick={() => setViewTab('chat')}
                className="w-full py-2.5 lg:py-4 text-xs lg:text-base font-serif font-bold border-2 transition-all border-brand-accent text-brand-accent hover:bg-brand-accent hover:text-brand-bg-primary active:bg-brand-accent active:text-brand-bg-primary"
              >
                Begin Communion with {selectedSubject.name} →
              </button>
            </div>
          </div>
        ) : viewTab === 'codex' ? (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 lg:p-8">
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Parchment Codex Header */}
              <div className="text-center space-y-2 py-4 border-b border-brand-accent/20">
                <span className="text-[9px] lg:text-[10px] font-mono uppercase tracking-[0.3em] text-brand-accent">[ Legal Codex ]</span>
                <h1 className="text-xl lg:text-3xl font-serif font-bold tracking-tight text-brand-text-primary uppercase">{selectedSubject.codex.name}</h1>
                <p className="text-xs lg:text-sm text-brand-text-secondary/80 font-light leading-relaxed italic max-w-lg mx-auto">
                  "{selectedSubject.codex.description}"
                </p>
              </div>

              {/* Mastery Status */}
              <div className="p-4 bg-brand-bg-secondary/40 border border-brand-text-primary/20 rounded-none space-y-4">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="space-y-0.5">
                    <span className="text-[8px] font-mono uppercase tracking-wider text-brand-text-secondary/50">Current Mastery Tier</span>
                    <h3 className={`text-base lg:text-lg font-serif font-bold ${getMasteryTier(insightScores[selectedSubject.id] || 0).color}`}>
                      {getMasteryTier(insightScores[selectedSubject.id] || 0).name}
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-[8px] font-mono uppercase tracking-wider text-brand-text-secondary/50 block">Juris Insight</span>
                    <span className="text-sm font-mono font-bold text-brand-accent">{insightScores[selectedSubject.id] || 0} / 100</span>
                  </div>
                </div>

                {/* Insight Progress Bar */}
                <div className="space-y-1">
                  <div className="w-full h-2 bg-brand-bg-secondary rounded-none overflow-hidden border border-brand-text-primary/10">
                    <div 
                      className="h-full bg-brand-accent transition-all duration-500 ease-in-out" 
                      style={{ width: `${insightScores[selectedSubject.id] || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] font-mono text-brand-text-secondary/40">
                    <span>Paralegal</span>
                    <span>Senior Counsel</span>
                    <span>Supreme Sage</span>
                  </div>
                </div>
              </div>

              {/* Codex Maxims */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px w-4 bg-brand-accent"></div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-brand-accent">Codex Maxims</span>
                </div>

                <div className="space-y-3.5">
                  {selectedSubject.codex.maxims.map((maxim) => {
                    const isStudied = (studiedMaxims[selectedSubject.id] || []).includes(maxim.id);
                    return (
                      <div key={maxim.id} className="border border-brand-text-primary/20 bg-brand-bg-secondary/10 p-4 transition-all">
                        <div className="flex justify-between items-start gap-4 flex-wrap mb-2">
                          <div>
                            <h4 className="text-xs lg:text-sm font-serif font-bold text-brand-text-primary">{maxim.name}</h4>
                            <span className="text-[8px] font-mono text-brand-accent uppercase tracking-wider">[ Concept: {maxim.concept} ]</span>
                          </div>
                          <button
                            onClick={() => handleStudy(maxim.id)}
                            disabled={isStudied}
                            className={`text-[8px] lg:text-[9px] font-mono border px-3 py-1 rounded-none uppercase transition-all
                              ${isStudied 
                                ? 'border-emerald-500/20 text-emerald-500/70 bg-emerald-500/5 cursor-default' 
                                : 'border-brand-accent text-brand-accent hover:bg-brand-accent hover:text-brand-navy active:bg-brand-accent/20 cursor-pointer'}`}
                          >
                            {isStudied ? '✓ Comprehended' : 'Study (+25 Insight)'}
                          </button>
                        </div>

                        <p className="text-xs italic text-brand-text-primary/90 leading-relaxed pl-3 border-l-2 border-brand-accent/30 my-3 font-serif bg-brand-bg-secondary/20 py-2">
                          "{maxim.maxim}"
                        </p>

                        {isStudied && (
                          <div className="mt-3 pt-3 border-t border-brand-text-primary/10 text-[11px] lg:text-xs font-light text-brand-text-secondary leading-relaxed space-y-1.5 animate-fadeIn text-left">
                            <strong className="text-brand-text-primary font-serif font-semibold block">Legal Insight:</strong>
                            <p className="text-left font-light">{maxim.explanation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Messages — flex-1 min-h-0 is the key to making this scroll on mobile */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2.5 lg:p-5 space-y-2.5 lg:space-y-4">
              {messages.map(renderMessage)}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="p-2 lg:p-3 border border-brand-text-primary/10 flex items-center gap-1.5">
                    <span className={`text-[7px] lg:text-[8px] font-mono uppercase tracking-widest ${selectedSubject.color} mr-1 lg:mr-2`}>{selectedSubject.name}</span>
                    <span className="w-1 h-1 lg:w-1.5 lg:h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 lg:w-1.5 lg:h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 lg:w-1.5 lg:h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              {interjecting && (
                <div className="flex justify-start animate-fadeIn">
                  <div className="p-2 border-l-2 border-dashed border-brand-text-primary/20 ml-2 lg:ml-4 pl-2 lg:pl-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[7px] lg:text-[8px] font-mono text-brand-text-secondary/40 uppercase tracking-widest">{interjecting} is typing...</span>
                      <span className="w-1 h-1 bg-brand-text-secondary/40 rounded-full animate-bounce" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input — sticky at bottom, never hidden */}
            <div className="flex-shrink-0 p-2 lg:p-4 border-t border-brand-text-primary/30 bg-brand-bg-secondary/70">
              <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2 items-center">
                <div className="relative flex-grow flex items-center bg-brand-bg-primary rounded-none border border-brand-text-primary/30 focus-within:ring-1 focus-within:ring-brand-accent">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={isTyping}
                    placeholder={`Speak to ${selectedSubject.name}...`}
                    className="w-full pl-2.5 lg:pl-4 pr-9 lg:pr-10 py-2 lg:py-2.5 bg-transparent text-brand-text-primary outline-none text-xs font-light placeholder-brand-text-secondary/30"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    className="absolute right-1 lg:right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 lg:w-7 lg:h-7 rounded-none bg-brand-accent disabled:bg-brand-bg-secondary text-brand-navy disabled:text-brand-text-secondary/30 flex items-center justify-center"
                  >
                    <svg className="w-3 h-3 lg:w-3.5 lg:h-3.5 transform rotate-90" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Breakthrough Overlay Modal */}
      {breakthrough && (
        <div className="fixed inset-0 bg-brand-bg-primary/95 flex items-center justify-center z-[9999] p-4 animate-fadeIn">
          <div className="max-w-md w-full border border-brand-accent p-6 sm:p-10 bg-brand-bg-secondary text-center space-y-6 relative overflow-hidden">
            {/* Shimmering background */}
            <div className="absolute inset-0 bg-gradient-to-tr from-brand-accent/5 to-transparent mix-blend-overlay"></div>
            
            <div className="w-16 h-16 rounded-none border-2 border-brand-accent flex items-center justify-center mx-auto text-3xl font-bold animate-pulse text-brand-accent">
              ☯
            </div>
            
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-brand-accent">Mastery Breakthrough!</span>
              <h2 className="text-2xl font-serif font-bold text-brand-text-primary">Ascended to {breakthrough.realmName}</h2>
              <p className="text-[11px] text-brand-text-secondary/70 font-mono">Domain of {breakthrough.subjectName}</p>
            </div>

            <div className="bg-brand-bg-primary/50 p-4 border border-brand-text-primary/10 rounded-none relative">
              <span className="absolute -top-2 left-4 px-1 bg-brand-bg-secondary text-[8px] font-mono uppercase text-brand-accent">{breakthrough.subjectName} speaks:</span>
              <p className={`text-sm font-light italic leading-relaxed ${breakthrough.color} text-left`}>
                "{breakthrough.quote}"
              </p>
            </div>

            <button
              onClick={() => setBreakthrough(null)}
              className="w-full py-2.5 text-xs font-mono uppercase tracking-widest border border-brand-accent text-brand-accent hover:bg-brand-accent hover:text-brand-navy transition-all"
            >
              [ Accept the Breakthrough ]
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SentientSubjectsScreen;
