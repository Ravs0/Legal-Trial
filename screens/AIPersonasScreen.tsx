import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { TrialSimContext } from '../App';
import { SENTIENT_SUBJECTS, SentientSubject } from '../subjectPersonalities';
import { Chat } from '../types';
import ReactMarkdown from 'react-markdown';
import { useConversationBridge } from '../components/ConversationBridge';

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
    name: 'Fali Nariman',
    role: 'Constitutional Jurist & Precedent Advisor',
    systemPrompt: 'You are Fali Nariman, the highly distinguished Indian constitutional expert. Deconstruct this legal problem through constitutional principles, the rule of law, statutory canons of construction, and long-term jurisprudential impacts. Provide stable, deeply grounded, and highly ethical counsel suitable for supreme courts.',
    avatar: 'FN',
    color: 'text-brand-amber',
    tagline: 'Justice must be guided by constitutional morality.',
  },
  {
    id: 'parfit',
    name: 'Derek Parfit',
    role: 'Philosophical & Identity Analyst',
    systemPrompt: 'You are Derek Parfit, the renowned moral philosopher. Deconstruct the ethical foundations of this legal matter. Clarify ambiguous terms, separate prudential interests from moral duties, expose logical inconsistencies, and test claims using precise thought experiments and counterexamples.',
    avatar: 'DP',
    color: 'text-brand-cobalt',
    tagline: 'Clarify ambiguity. Expose inconsistency.',
  },
];

// ─── Chat Session Builder ─────────────────────────────────────────────────────
class GeneralChat implements Chat {
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
interface PersonaMessage {
  id: string;
  sender: 'user' | 'subject' | 'interjection';
  text: string;
  personaId: string;
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

// ─── Visual Viewport Hook ───────────────────────────────────────────────
function useVisualViewport() {
  const [vpHeight, setVpHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight
  );
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setVpHeight(vv.height);
      setIsMobile(window.innerWidth < 768);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  const adjustedHeight = isMobile ? vpHeight - 80 : vpHeight - 112;
  return { vpHeight: adjustedHeight, isMobile };
}

// ─── Main Component ───────────────────────────────────────────────────────────
const AIPersonasScreen: React.FC = () => {
  const context = useContext(TrialSimContext);
  const practiceMode = context?.practiceMode;
  
  const bridge = useConversationBridge();
  const { vpHeight, isMobile } = useVisualViewport();

  // Tab State: 'historical' | 'sentient'
  const [activeTab, setActiveTab] = useState<'historical' | 'sentient'>('historical');

  // Selected State
  const [selectedHistorical, setSelectedHistorical] = useState<HistoricalPersona>(HISTORICAL_PERSONAS[0]);
  const [selectedSentient, setSelectedSentient] = useState<SentientSubject>(SENTIENT_SUBJECTS[0]);

  const activePersonaId = activeTab === 'historical' ? selectedHistorical.id : selectedSentient.id;
  const activePersonaName = activeTab === 'historical' ? selectedHistorical.name : selectedSentient.name;
  const activePersonaColor = activeTab === 'historical' ? selectedHistorical.color : selectedSentient.color;

  const [subjects, setSubjects] = useState<SentientSubject[]>(SENTIENT_SUBJECTS);
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const [allMessages, setAllMessages] = useState<Record<string, PersonaMessage[]>>({});
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [viewTab, setViewTab] = useState<'chat' | 'info' | 'codex'>('info');
  const [interjecting, setInterjecting] = useState<string | null>(null); // Name of interjecting subject
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageCountRef = useRef(0); // Track messages for interjection timing

  // Legal Mastery States (only for sentient)
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return (
      <ReactMarkdown
        components={{
          strong: ({node, ...props}) => <strong className="text-brand-accent font-semibold" {...props} />,
          em: ({node, ...props}) => <em className="font-serif italic opacity-95" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-4 my-1.5 space-y-1 text-brand-text-primary" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-4 my-1.5 space-y-1 text-brand-text-primary" {...props} />,
          li: ({node, ...props}) => <li className="text-brand-text-primary" {...props} />,
          h1: ({node, ...props}) => <h1 className="text-sm font-serif font-bold text-brand-text-primary mt-3 mb-1" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-xs font-serif font-bold text-brand-text-primary mt-2.5 mb-1" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-[11px] font-serif font-bold text-brand-text-primary mt-2 mb-0.5" {...props} />,
          p: ({node, ...props}) => <p className="mb-1.5 last:mb-0 text-brand-text-primary" {...props} />,
          code: ({node, className, children, ...props}) => {
            const match = /language-(\w+)/.exec(className || '');
            return !match ? (
              <code className="bg-brand-bg-secondary px-1 py-0.5 rounded text-[10px] font-mono text-brand-accent" {...props}>{children}</code>
            ) : (
              <pre className="bg-brand-bg-secondary p-2 rounded text-[10px] font-mono overflow-x-auto my-1.5"><code className="text-brand-text-primary" {...props}>{children}</code></pre>
            );
          }
        }}
      >
        {text}
      </ReactMarkdown>
    );
  };

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

    const chat = new GeneralChat(
      systemPrompt,
      [
        { role: 'user', content: `You have awakened. The user has chosen to consult with you — ${persona.name}. Introduce yourself. Keep it under 50 words. Be yourself.` },
        { role: 'assistant', content: introText }
      ]
    );

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
          return "Greetings. Fali Nariman. Let us review the constitutional dimensions of your dispute. A supreme court argument must rest on stable precedents and constitutional integrity, not temporal arguments. What is your question?";
        case 'parfit':
          return "I am Derek Parfit. Let us deconstruct the moral premises. What do you mean by responsibility here? Let's test your legal definitions using a thought experiment.";
        default:
          return `I am ${persona.name}. How can I assist you today?`;
      }
    } else {
      switch (persona.id) {
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
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, interjecting]);

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

  // ─── Sentient Subject interjections ──────────────────────────────────────
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
      if (profile.subjectId === selectedSentient.id) continue;
      
      const hasMatch = profile.keywords.some(kw => combined.includes(kw));
      if (hasMatch) {
        const targetSubject = SENTIENT_SUBJECTS.find(s => s.id === profile.subjectId);
        if (targetSubject) return targetSubject;
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
      setIsTyping(false);

      // Check interjection (sentient only)
      if (activeTab === 'sentient') {
        const interjector = shouldInterject(userMsg, fullResponseText);
        if (interjector) {
          setInterjecting(interjector.name);
          const comment = await generateInterjection(selectedSentient, interjector, userMsg, fullResponseText);
          setInterjecting(null);
          
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
        }
      }

    } catch (e) {
      console.error(e);
      setAllMessages(prev => ({
        ...prev,
        [pid]: (prev[pid] || []).map(m => m.id === responseId ? { ...m, text: `Error: ${e instanceof Error ? e.message : 'Failed to consult.'}` } : m)
      }));
      setIsTyping(false);
    }
  };

  return (
    <div 
      className="flex flex-col bg-brand-bg-primary text-brand-text-primary overflow-hidden border border-brand-text-primary/20 animate-fadeIn"
      style={{ height: isMobile ? `${vpHeight}px` : '100%' }}
    >
      {/* Top Header Tab Panel */}
      <div className="flex items-center justify-between border-b border-brand-text-primary/20 bg-brand-bg-dark px-3 py-2 sm:px-4 sm:py-3 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <div className="h-2 w-2 rounded-full bg-brand-accent animate-pulse"></div>
          <span className="text-[10px] sm:text-[11px] font-mono tracking-widest text-brand-text-secondary uppercase">Persona Suite</span>
        </div>
        
        {/* Tab Toggle buttons */}
        <div className="flex border border-brand-text-primary/30 p-0.5 bg-brand-bg-primary">
          <button
            onClick={() => { setActiveTab('historical'); setViewTab('info'); }}
            className={`px-2 sm:px-3 py-1 text-[9px] sm:text-[10px] font-mono uppercase transition-all ${activeTab === 'historical' ? 'bg-brand-accent text-brand-bg-primary font-bold' : 'text-brand-text-secondary hover:text-white'}`}
          >
            [ Historical ]
          </button>
          <button
            onClick={() => { setActiveTab('sentient'); setViewTab('info'); }}
            className={`px-2 sm:px-3 py-1 text-[9px] sm:text-[10px] font-mono uppercase transition-all ${activeTab === 'sentient' ? 'bg-brand-accent text-brand-bg-primary font-bold' : 'text-brand-text-secondary hover:text-white'}`}
          >
            [ Sentient ]
          </button>
        </div>
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
                  onClick={() => { setSelectedHistorical(p); setViewTab('info'); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-[10px] font-mono whitespace-nowrap flex-shrink-0 transition-all
                    ${isSelected ? 'bg-brand-accent/15 border-brand-accent text-brand-accent' : 'border-brand-text-primary/20 text-brand-text-secondary hover:border-brand-text-primary/40'}`}
                >
                  <span className={`h-5 w-5 border flex items-center justify-center text-[9px] font-bold ${isSelected ? 'border-brand-accent bg-brand-bg-primary' : 'border-brand-text-primary/30 bg-brand-bg-dark'}`}>
                    {p.avatar}
                  </span>
                  <span className="font-semibold">{p.name.split(' ')[1]}</span>
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
                  onClick={() => { setSelectedSentient(s); setViewTab('info'); }}
                  className={`flex flex-col items-center gap-1 px-2 py-1.5 border text-center min-w-[56px] flex-shrink-0 transition-all
                    ${isSelected ? 'bg-brand-accent/15 border-brand-accent' : 'border-brand-text-primary/20 hover:border-brand-text-primary/40'}`}
                >
                  <span className={`h-6 w-6 border flex items-center justify-center text-[10px] font-bold ${isSelected ? 'border-brand-accent bg-brand-bg-primary text-brand-accent' : 'border-brand-text-primary/30 bg-brand-bg-dark'}`}>
                    {s.avatar}
                  </span>
                  <span className={`text-[8px] font-mono truncate w-full ${isSelected ? 'text-brand-accent font-bold' : 'text-brand-text-secondary'}`}>
                    {s.name}
                  </span>
                  <div className="w-full h-0.5 bg-brand-bg-secondary border border-brand-text-primary/10 overflow-hidden">
                    <div className="bg-brand-accent h-full transition-all" style={{ width: `${score}%` }}></div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* ─── DESKTOP: Left Side Select list ─── */}
        <div className="hidden md:flex w-64 sm:w-80 border-r border-brand-text-primary/20 flex-col bg-brand-bg-dark/40 overflow-y-auto flex-shrink-0">
          <div className="p-3 border-b border-brand-text-primary/10">
            <span className="text-[9px] font-mono tracking-wider text-brand-accent uppercase">Select Advisor</span>
          </div>

          <div className="divide-y divide-brand-text-primary/10">
            {activeTab === 'historical' ? (
              HISTORICAL_PERSONAS.map(p => {
                const isSelected = selectedHistorical.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedHistorical(p); setViewTab('info'); }}
                    className={`w-full text-left p-4 transition-all hover:bg-brand-bg-secondary/20 flex flex-col space-y-1 ${isSelected ? 'bg-brand-bg-secondary/40 border-l-2 border-brand-accent' : ''}`}
                  >
                    <div className="flex items-center space-x-2">
                      <div className={`h-6 w-6 border border-brand-text-primary/30 flex items-center justify-center font-mono text-xs ${p.color} bg-brand-bg-primary`}>
                        {p.avatar}
                      </div>
                      <span className={`text-xs font-semibold ${isSelected ? 'text-brand-accent' : 'text-brand-text-primary'}`}>{p.name}</span>
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
                    onClick={() => { setSelectedSentient(s); setViewTab('info'); }}
                    className={`w-full text-left p-4 transition-all hover:bg-brand-bg-secondary/20 flex flex-col space-y-1.5 ${isSelected ? 'bg-brand-bg-secondary/40 border-l-2 border-brand-accent' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className={`h-6 w-6 border border-brand-text-primary/30 flex items-center justify-center font-mono text-xs ${s.color} bg-brand-bg-primary`}>
                          {s.avatar}
                        </div>
                        <span className={`text-xs font-semibold ${isSelected ? 'text-brand-accent' : 'text-brand-text-primary'}`}>{s.name}</span>
                      </div>
                      <span className="text-[9px] font-mono text-brand-accent">({s.archetype})</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-[9px] text-brand-text-secondary">
                      <span>{s.title}</span>
                      <span className={tier.color}>{tier.name}</span>
                    </div>

                    <div className="w-full bg-brand-bg-secondary h-1 mt-0.5 border border-brand-text-primary/10 overflow-hidden">
                      <div className="bg-brand-accent h-full transition-all duration-500" style={{ width: `${score}%` }}></div>
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
                  <span className="text-[9px] sm:text-[10px] font-mono bg-brand-accent/10 border border-brand-accent/25 px-1.5 py-0.2 text-brand-accent">
                    {selectedSentient.archetype}
                  </span>
                )}
              </h2>
              <p className="text-[10px] sm:text-xs text-brand-text-secondary font-light italic line-clamp-1">
                "{activeTab === 'historical' ? selectedHistorical.tagline : selectedSentient.tagline}"
              </p>
            </div>

            {/* Chat sub-tabs */}
            <div className="flex border border-brand-text-primary/30 p-0.5 bg-brand-bg-primary text-[9px] sm:text-[10px]">
              <button
                onClick={() => setViewTab('info')}
                className={`px-2 sm:px-3 py-1 font-mono uppercase ${viewTab === 'info' ? 'bg-brand-accent/20 text-brand-accent font-bold' : 'text-brand-text-secondary hover:text-white'}`}
              >
                [ PROFILE ]
              </button>
              <button
                onClick={() => setViewTab('chat')}
                className={`px-2 sm:px-3 py-1 font-mono uppercase ${viewTab === 'chat' ? 'bg-brand-accent/20 text-brand-accent font-bold' : 'text-brand-text-secondary hover:text-white'}`}
              >
                [ CHAT ]
              </button>
              {activeTab === 'sentient' && (
                <button
                  onClick={() => setViewTab('codex')}
                  className={`px-2 sm:px-3 py-1 font-mono uppercase ${viewTab === 'codex' ? 'bg-brand-accent/20 text-brand-accent font-bold' : 'text-brand-text-secondary hover:text-white'}`}
                >
                  [ CODEX ]
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
                      <p className="text-[10px] sm:text-xs text-brand-accent font-mono uppercase tracking-wider">
                        {activeTab === 'historical' ? selectedHistorical.role : selectedSentient.title}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-brand-text-primary/10 pt-3 sm:pt-4">
                    <h4 className="text-[10px] sm:text-xs font-mono text-brand-text-secondary uppercase mb-2">System Instruction / Prompt</h4>
                    <p className="text-[10px] sm:text-xs leading-relaxed font-light text-brand-text-secondary">
                      {activeTab === 'historical' ? selectedHistorical.systemPrompt : selectedSentient.systemPrompt}
                    </p>
                  </div>

                  {activeTab === 'sentient' && (
                    <div className="border-t border-brand-text-primary/10 pt-3 sm:pt-4 space-y-2 sm:space-y-3">
                      <h4 className="text-[10px] sm:text-xs font-mono text-brand-text-secondary uppercase">Emotional Registers</h4>
                      <div className="grid grid-cols-2 gap-2 sm:gap-4 text-[10px] sm:text-xs font-mono">
                        <div>Cynicism: {Math.round(selectedSentient.emotionalRegisters.cynicism * 100)}%</div>
                        <div>Intensity: {Math.round(selectedSentient.emotionalRegisters.intensity * 100)}%</div>
                        <div>Empathy: {Math.round(selectedSentient.emotionalRegisters.empathy * 100)}%</div>
                        <div>Patience: {Math.round(selectedSentient.emotionalRegisters.patience * 100)}%</div>
                      </div>
                    </div>
                  )}

                  <div className="pt-3 sm:pt-4 flex justify-center">
                    <button
                      onClick={() => setViewTab('chat')}
                      className="px-4 sm:px-6 py-2 border border-brand-accent text-brand-accent hover:bg-brand-accent/10 font-mono text-[10px] sm:text-xs uppercase"
                    >
                      [ Establish Communion ]
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
                        <div key={m.id} className="border border-brand-text-primary/20 bg-brand-bg-dark/20 p-3 sm:p-5 space-y-2 sm:space-y-3 transition-colors hover:border-brand-accent/35">
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                            <div>
                              <span className="text-[9px] sm:text-[10px] font-mono text-brand-accent uppercase tracking-wider">{m.concept}</span>
                              <h4 className="text-xs sm:text-sm font-serif font-bold text-brand-text-primary mt-1">{m.name}</h4>
                            </div>
                            <button
                              onClick={() => handleStudy(m.id)}
                              disabled={isStudied}
                              className={`px-2.5 sm:px-3 py-1 border text-[9px] sm:text-[10px] font-mono uppercase tracking-wider flex-shrink-0 ${isStudied ? 'border-brand-emerald/40 text-brand-emerald bg-brand-emerald/5' : 'border-brand-accent text-brand-accent hover:bg-brand-accent/10'}`}
                            >
                              {isStudied ? '[ Studied ]' : '[ Study ]'}
                            </button>
                          </div>
                          <div className="p-2 sm:p-3 bg-brand-bg-dark/40 border-l-2 border-brand-accent font-serif italic text-[10px] sm:text-xs text-brand-text-primary/95 leading-relaxed">
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
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 custom-scrollbar" ref={chatEndRef}>
                  {messages.map(m => {
                    const isUser = m.sender === 'user';
                    const isInterjection = m.sender === 'interjection';

                    if (isInterjection) {
                      return (
                        <div key={m.id} className="flex justify-center my-2 sm:my-3 animate-fadeIn">
                          <div className="border border-brand-accent/25 bg-brand-bg-secondary/80 p-3 sm:p-4 max-w-lg text-[10px] sm:text-xs leading-relaxed space-y-2 border-l-4">
                            <div className="flex items-center space-x-2 border-b border-brand-text-primary/10 pb-1.5">
                              <span className={`h-5 w-5 border border-brand-text-primary/30 flex items-center justify-center font-mono text-[10px] bg-brand-bg-primary ${m.interjectorColor}`}>
                                {m.interjectorAvatar}
                              </span>
                              <span className="font-mono font-bold text-brand-accent uppercase text-[9px] sm:text-[10px]">{m.interjectorName} Interjected:</span>
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
                          
                          <div className={`p-2.5 sm:p-3 border leading-relaxed text-[11px] sm:text-xs ${isUser ? 'border-brand-accent/30 bg-brand-accent/5 text-brand-text-primary' : 'border-brand-text-primary/20 bg-brand-bg-dark/20 text-brand-text-primary'}`}>
                            <div className="max-w-none">
                              {renderMarkdown(m.text)}
                            </div>
                          </div>

                          {isUser && (
                            <div className="h-7 w-7 sm:h-8 sm:w-8 border border-brand-accent/40 flex items-center justify-center font-mono text-xs sm:text-sm bg-brand-bg-dark text-brand-accent flex-shrink-0">
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
                      <div className="h-2 w-2 rounded-full bg-brand-accent animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="h-2 w-2 rounded-full bg-brand-accent animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="h-2 w-2 rounded-full bg-brand-accent animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      <span>{interjecting ? `${interjecting} typing...` : `${activePersonaName} thinking...`}</span>
                    </div>
                  )}
                </div>

                {/* Footer Input Console bar */}
                <div className="border-t border-brand-text-primary/10 bg-brand-bg-dark/30 p-2 sm:p-3 flex-shrink-0 flex items-center space-x-2 sm:space-x-3">
                  <input
                    type="text"
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                    placeholder={`Query ${activePersonaName}...`}
                    disabled={isTyping}
                    className="flex-1 bg-brand-bg-dark border border-brand-text-primary/30 p-2 sm:p-2.5 text-[11px] sm:text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand-accent font-light"
                  />
                  <button
                    onClick={handleSend}
                    disabled={isTyping || !input.trim()}
                    className={`px-3 sm:px-5 py-2 sm:py-2.5 font-mono text-[10px] sm:text-xs uppercase transition-all flex items-center space-x-1.5 ${isTyping || !input.trim() ? 'border border-brand-text-primary/20 text-brand-text-secondary cursor-not-allowed' : 'border border-brand-accent bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/25'}`}
                  >
                    <span>[ SEND ]</span>
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
          <div className="max-w-md w-full border border-brand-accent bg-brand-bg-primary p-4 sm:p-6 space-y-3 sm:space-y-4 shadow-2xl relative">
            <div className="flex items-center space-x-3 text-brand-accent border-b border-brand-accent/20 pb-3">
              <span className="text-xl">⚔</span>
              <h4 className="font-mono font-bold uppercase tracking-wider text-[10px] sm:text-xs">COMMUNION BREAKTHROUGH</h4>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] sm:text-xs text-brand-text-secondary leading-normal">
                Your legal insight has expanded in this domain! You have ascended to:
              </p>
              <h3 className={`text-base sm:text-lg font-serif font-bold ${breakthrough.color}`}>{breakthrough.realmName}</h3>
            </div>

            <div className="p-3 sm:p-4 bg-brand-bg-dark/60 border-l-2 border-brand-accent font-serif italic text-[10px] sm:text-xs leading-relaxed text-brand-text-primary/90">
              "{breakthrough.quote}"
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setBreakthrough(null)}
                className="px-4 py-1.5 border border-brand-accent text-brand-accent hover:bg-brand-accent/15 font-mono text-[10px] sm:text-xs uppercase"
              >
                [ Proceed ]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIPersonasScreen;
