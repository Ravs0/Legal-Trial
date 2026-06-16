import React, { useState, useEffect, useRef, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { TrialSimContext } from '../App';
import { startOversightChatSession, sendMessageToChatStream } from '../services/geminiService';
import { Chat } from '../types';

export const OversightSpirit: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<{ id: string, sender: 'user' | 'koku', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const location = useLocation();
  const context = useContext(TrialSimContext);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize chat when opened or context changes heavily (maybe keep chat persistent)
  useEffect(() => {
    if (!chat) {
      const appContext = {
        pathname: location.pathname,
        caseTitle: context?.currentSessionSettings?.caseDetail?.title,
        practiceMode: context?.practiceMode
      };
      setChat(startOversightChatSession(appContext));
      setMessages([{ id: 'init', sender: 'koku', text: "Finally. Let's see what you're up to. Try not to embarrass yourself too much while I'm watching." }]);
    }
  }, [chat, location.pathname, context]);

  // Update context periodically if needed, or simply pass it in system prompt on every new chat init
  
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || !chat || isTyping) return;
    
    const userMsg = input.trim();
    const msgId = Date.now().toString();
    setMessages(prev => [...prev, { id: `user-${msgId}`, sender: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    let kokuResponse = '';
    const responseId = `koku-${msgId}`;
    
    // add a placeholder for koku
    setMessages(prev => [...prev, { id: responseId, sender: 'koku', text: '...' }]);

    try {
      // Append current context to user message invisibly to keep her aware
      const contextualMsg = `[App Context: User is on ${location.pathname}, Case: ${context?.currentSessionSettings?.caseDetail?.title || 'None'}, Mode: ${context?.practiceMode || 'None'}] \nUser says: ${userMsg}`;
      const stream = await sendMessageToChatStream(chat, contextualMsg);
      if (stream) {
        for await (const chunk of stream) {
          kokuResponse += (chunk.text || '');
          setMessages(prev => prev.map(m => m.id === responseId ? { ...m, text: kokuResponse } : m));
        }
      } else {
        setMessages(prev => prev.map(m => m.id === responseId ? { ...m, text: "Ugh, my connection dropped. Give me a second." } : m));
      }
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === responseId ? { ...m, text: "Wait, WHAT? Something broke. Fix your internet, bestie." } : m));
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      {isOpen && (
        <div className="bg-brand-bg-primary border border-brand-accent shadow-[0_0_15px_rgba(212,175,55,0.3)] rounded-none w-80 h-96 flex flex-col mb-4 overflow-hidden animate-fadeInUp">
          <div className="bg-brand-bg-secondary border-b border-brand-accent px-4 py-2 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <span className="text-brand-accent font-serif font-bold text-lg">Koku</span>
              <span className="text-[10px] text-brand-text-secondary tracking-widest uppercase border border-brand-text-primary/30 px-1">Oversight Spirit</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-brand-text-secondary hover:text-brand-accent transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-grow p-4 overflow-y-auto custom-scrollbar space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 text-sm ${msg.sender === 'user' ? 'bg-brand-bg-secondary text-brand-text-primary border border-brand-text-primary/30' : 'bg-brand-accent/10 text-brand-text-primary border border-brand-accent/40'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                 <div className="max-w-[85%] p-3 text-sm bg-brand-accent/10 text-brand-text-primary border border-brand-accent/40 flex space-x-1 items-center">
                    <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 border-t border-brand-text-primary/30 bg-brand-bg-secondary flex">
            <input 
              type="text" 
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask Koku..."
              className="flex-grow bg-transparent text-sm text-brand-text-primary focus:outline-none placeholder-brand-text-secondary/50 font-light"
            />
            <button 
              onClick={handleSend}
              disabled={isTyping || !input.trim()}
              className="text-brand-accent hover:text-brand-accent-hover disabled:opacity-50 transition-colors ml-2"
            >
              <svg className="w-5 h-5 transform rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </div>
      )}
      
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-brand-bg-secondary border-2 border-brand-accent rounded-full shadow-[0_0_20px_rgba(212,175,55,0.4)] hover:shadow-[0_0_30px_rgba(212,175,55,0.6)] hover:scale-105 transition-all flex items-center justify-center relative group"
        >
          <span className="text-xl font-bold text-brand-accent font-serif">K</span>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-brand-error rounded-full border border-brand-bg-primary animate-pulse"></span>
          <div className="absolute right-16 bg-brand-bg-secondary border border-brand-accent text-brand-text-primary text-[10px] px-2 py-1 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Oversight Active
          </div>
        </button>
      )}
    </div>
  );
};
