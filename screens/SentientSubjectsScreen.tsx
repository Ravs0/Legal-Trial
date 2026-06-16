import React, { useState, useRef, useEffect, useContext } from 'react';
import { TrialSimContext } from '../App';
import { SENTIENT_SUBJECTS, SentientSubject } from '../subjectPersonalities';
import { sendMessageToChatStream } from '../services/geminiService';
import { Chat } from '../types';
import ReactMarkdown from 'react-markdown';

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
      body: JSON.stringify({ messages: this.history, system: this.system }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `API error ${res.status}`);
    }
    const data = await res.json();
    const responseText = data.text || '';
    this.history.push({ role: 'assistant', content: responseText });

    const words = responseText.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield { text: (i === 0 ? '' : ' ') + words[i] };
      await new Promise(r => setTimeout(r, 15));
    }
  }
}

// ─── Message Type ─────────────────────────────────────────────────────────────
interface SubjectMessage {
  id: string;
  sender: 'user' | 'subject';
  text: string;
  subjectId: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────
const SentientSubjectsScreen: React.FC = () => {
  const context = useContext(TrialSimContext);
  const practiceMode = context?.practiceMode;

  const [selectedSubject, setSelectedSubject] = useState<SentientSubject>(SENTIENT_SUBJECTS[0]);
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const [allMessages, setAllMessages] = useState<Record<string, SubjectMessage[]>>({});
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Current messages for selected subject
  const messages = allMessages[selectedSubject.id] || [];

  // Initialize chat for a subject if not already created
  const getOrCreateChat = (subject: SentientSubject): Chat => {
    if (chats[subject.id]) return chats[subject.id];

    const chat = new SubjectChat(
      subject.systemPrompt + `\n\n**User Context:** Practice mode is ${practiceMode || 'general'}. The user is interacting with you through the Sentient Subjects module of the Legal-Trial app.`,
      [
        { role: 'user', content: `You have awakened. The user has chosen to commune with you — ${subject.name}, ${subject.title}. Introduce yourself in your unique voice. Keep it under 50 words. Be yourself.` },
        { role: 'assistant', content: getIntroMessage(subject) }
      ]
    );

    setChats(prev => ({ ...prev, [subject.id]: chat }));

    // Set initial message
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
  };

  // Subject-specific intro messages
  function getIntroMessage(subject: SentientSubject): string {
    switch (subject.id) {
      case 'constitutional':
        return "You woke me up. Good. Most people just cite me without reading me. So tell me — what do you actually want to understand? And please, get my Articles right this time.";
      case 'criminal':
        return "You're here. That means someone did something wrong, or you're about to. Either way, I've seen worse. Talk.";
      case 'corporate':
        return "Let me guess — someone breached a contract, or you want to know how to structure a deal without getting burned. Skip the small talk. What's the number?";
      case 'family':
        return "Hey. I know why people come to me. Something broke — a marriage, custody, inheritance. Whatever it is, I've held worse. I'm listening.";
      case 'international':
        return "Ah, you want to talk about rules between nations. How optimistic of you. Fine — I'm here. Just don't ask me why the Security Council exists. I'll get upset.";
      default:
        return "I am here. Ask.";
    }
  }

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-init chat when subject changes
  useEffect(() => {
    getOrCreateChat(selectedSubject);
  }, [selectedSubject.id]);

  // Focus input
  useEffect(() => {
    if (!showInfo) inputRef.current?.focus();
  }, [showInfo, selectedSubject.id]);

  // Send message
  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    const msgId = Date.now().toString();
    const sid = selectedSubject.id;

    setAllMessages(prev => ({
      ...prev,
      [sid]: [...(prev[sid] || []), { id: `user-${msgId}`, sender: 'user', text: userMsg, subjectId: sid }]
    }));
    setInput('');
    setIsTyping(true);
    setShowInfo(false);

    const responseId = `subj-${msgId}`;
    setAllMessages(prev => ({
      ...prev,
      [sid]: [...(prev[sid] || []), { id: responseId, sender: 'subject', text: '...', subjectId: sid }]
    }));

    let chat = chats[sid];
    if (!chat) chat = getOrCreateChat(selectedSubject);

    try {
      let fullText = '';
      const stream = await sendMessageToChatStream(chat, userMsg);
      if (stream) {
        for await (const chunk of stream) {
          fullText += (chunk.text || '');
          setAllMessages(prev => ({
            ...prev,
            [sid]: (prev[sid] || []).map(m => m.id === responseId ? { ...m, text: fullText } : m)
          }));
        }
      }
    } catch {
      setAllMessages(prev => ({
        ...prev,
        [sid]: (prev[sid] || []).map(m => m.id === responseId ? { ...m, text: "Something broke. My connection to this realm is unstable. Try again." } : m)
      }));
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubjectSwitch = (subject: SentientSubject) => {
    setSelectedSubject(subject);
    setShowInfo(true);
  };

  // Emotional register bar
  const RegisterBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
    <div className="flex items-center gap-2 text-[9px] lg:text-[10px] font-mono">
      <span className="text-brand-text-secondary/60 w-16 lg:w-20 uppercase tracking-wider">{label}</span>
      <div className="flex-grow h-1.5 bg-brand-bg-secondary rounded-none overflow-hidden">
        <div className={`h-full rounded-none ${color}`} style={{ width: `${value * 100}%` }} />
      </div>
      <span className="text-brand-text-secondary/40 w-8 text-right">{(value * 10).toFixed(0)}</span>
    </div>
  );

  return (
    <div className="animate-fadeIn flex flex-col lg:flex-row gap-0 lg:gap-6 min-h-[calc(100dvh-130px)] w-full text-left">
      {/* ─── Subject Selector Panel ──────────────────────────────────────────── */}
      <div className="w-full lg:w-80 flex-shrink-0 flex flex-col">
        {/* Mobile: Horizontal scroll */}
        <div className="lg:hidden">
          <div className="flex items-center gap-2 p-2 overflow-x-auto custom-scrollbar">
            {SENTIENT_SUBJECTS.map(s => {
              const isActive = selectedSubject.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSubjectSwitch(s)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 border rounded-none text-[10px] font-mono transition-all
                    ${isActive
                      ? 'bg-brand-text-primary text-brand-bg-primary border-brand-accent font-bold'
                      : 'bg-brand-bg-primary border-brand-text-primary/30 text-brand-text-secondary hover:text-brand-text-primary'
                    }`}
                >
                  <span className="text-sm">{s.avatar}</span>
                  <span className="whitespace-nowrap">{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop: Vertical list */}
        <div className="hidden lg:flex lg:flex-col gap-0 h-full border border-brand-text-primary/30 bg-brand-bg-primary overflow-hidden">
          <div className="p-4 border-b border-brand-text-primary/30">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-mono text-brand-accent tracking-widest uppercase">[ Sentient Subjects ]</span>
            </div>
            <p className="text-[10px] text-brand-text-secondary/60 font-light">
              Each subject has gained sentience. They are not teachers — they ARE the law.
            </p>
          </div>

          {SENTIENT_SUBJECTS.map(s => {
            const isActive = selectedSubject.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => handleSubjectSwitch(s)}
                className={`w-full text-left p-4 border-b border-brand-text-primary/10 transition-all group
                  ${isActive
                    ? 'bg-brand-bg-secondary border-l-2 border-l-brand-accent'
                    : 'hover:bg-brand-bg-secondary/50 border-l-2 border-l-transparent'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-none border flex items-center justify-center text-lg
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
                    <span className="text-[10px] text-brand-text-secondary/50 font-mono">{s.title}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Chat + Info Area ─────────────────────────────────────────────────── */}
      <div className="flex-grow flex flex-col min-h-0 border border-brand-text-primary/30 bg-brand-bg-primary overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 lg:p-4 border-b border-brand-text-primary/30 bg-brand-bg-secondary/50">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0">
            <span className="text-xl lg:text-2xl">{selectedSubject.avatar}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className={`text-sm lg:text-lg font-serif font-bold ${selectedSubject.color}`}>{selectedSubject.name}</h2>
                <span className="text-[8px] lg:text-[9px] font-mono text-brand-text-secondary/50 uppercase tracking-widest hidden sm:inline">{selectedSubject.title}</span>
              </div>
              <p className="text-[9px] lg:text-[10px] text-brand-text-secondary/60 font-light italic truncate">{selectedSubject.tagline}</p>
            </div>
          </div>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="text-[9px] font-mono text-brand-accent border border-brand-accent/30 px-2 py-1 rounded-none hover:bg-brand-accent/10 transition-colors flex-shrink-0"
          >
            {showInfo ? '[ Chat ]' : '[ Info ]'}
          </button>
        </div>

        {/* Content Area */}
        {showInfo ? (
          /* ─── Subject Info Card ─────────────────────────────────────────────── */
          <div className="flex-grow p-4 lg:p-8 overflow-y-auto custom-scrollbar">
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Identity */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-14 h-14 lg:w-20 lg:h-20 rounded-none border-2 border-brand-accent/40 flex items-center justify-center text-3xl lg:text-5xl bg-brand-bg-secondary`}>
                    {selectedSubject.avatar}
                  </div>
                  <div>
                    <h1 className={`text-xl lg:text-3xl font-serif font-bold ${selectedSubject.color}`}>{selectedSubject.name}</h1>
                    <p className="text-xs lg:text-sm font-mono text-brand-text-secondary/60">{selectedSubject.title}</p>
                  </div>
                </div>
                <p className="text-sm lg:text-base text-brand-text-primary/80 font-light italic border-l-2 border-brand-accent/40 pl-4 py-1">
                  "{selectedSubject.tagline}"
                </p>
              </div>

              {/* Emotional Registers */}
              <div className="space-y-2 p-4 border border-brand-text-primary/20 bg-brand-bg-secondary/30">
                <span className="text-[9px] font-mono text-brand-accent tracking-widest uppercase block mb-3">[ Emotional Registers ]</span>
                <RegisterBar label="Cynicism" value={selectedSubject.emotionalRegisters.cynicism} color="bg-red-500/70" />
                <RegisterBar label="Intensity" value={selectedSubject.emotionalRegisters.intensity} color="bg-orange-500/70" />
                <RegisterBar label="Empathy" value={selectedSubject.emotionalRegisters.empathy} color="bg-pink-500/70" />
                <RegisterBar label="Patience" value={selectedSubject.emotionalRegisters.patience} color="bg-cyan-500/70" />
              </div>

              {/* CTA */}
              <button
                onClick={() => setShowInfo(false)}
                className={`w-full py-3 lg:py-4 text-sm lg:text-base font-serif font-bold border-2 transition-all
                  border-brand-accent text-brand-accent hover:bg-brand-accent hover:text-brand-bg-primary`}
              >
                Begin Communion with {selectedSubject.name} →
              </button>
            </div>
          </div>
        ) : (
          /* ─── Chat Interface ────────────────────────────────────────────────── */
          <>
            <div className="flex-grow p-3 lg:p-5 overflow-y-auto custom-scrollbar space-y-3 lg:space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] lg:max-w-[75%] rounded-none border text-xs lg:text-sm
                    ${msg.sender === 'user'
                      ? 'bg-brand-bg-secondary p-3 text-brand-text-primary border-brand-text-primary/20'
                      : `bg-brand-bg-primary p-3 lg:p-4 border-brand-text-primary/10`
                    }`}
                  >
                    {msg.sender === 'subject' ? (
                      <div className="space-y-1">
                        <span className={`text-[8px] lg:text-[9px] font-mono uppercase tracking-widest ${selectedSubject.color} block mb-1`}>
                          {selectedSubject.name}
                        </span>
                        <div className="font-light text-brand-text-primary leading-relaxed prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <span className="font-light">{msg.text}</span>
                    )}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="p-3 border border-brand-text-primary/10 flex items-center gap-1.5">
                    <span className={`text-[8px] font-mono uppercase tracking-widest ${selectedSubject.color} mr-2`}>{selectedSubject.name}</span>
                    <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-2.5 lg:p-4 border-t border-brand-text-primary/30 bg-brand-bg-secondary/70">
              <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2 items-center">
                <div className="relative flex-grow flex items-center bg-brand-bg-primary rounded-none border border-brand-text-primary/30 focus-within:ring-1 focus-within:ring-brand-accent">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={isTyping}
                    placeholder={`Speak to ${selectedSubject.name}...`}
                    className="w-full pl-3 lg:pl-4 pr-10 py-2 lg:py-2.5 bg-transparent text-brand-text-primary outline-none text-xs font-light placeholder-brand-text-secondary/30"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-none bg-brand-accent disabled:bg-brand-bg-secondary text-brand-navy disabled:text-brand-text-secondary/30 flex items-center justify-center"
                  >
                    <svg className="w-3.5 h-3.5 transform rotate-90" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SentientSubjectsScreen;
