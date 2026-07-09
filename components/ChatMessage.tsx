import React, { useState } from 'react';
import { ChatMessage as ChatMessageType, JudgePersonalityId, OpposingCounselPersonalityId } from '../types';
import { JUDGE_PERSONALITIES, OPPOSING_COUNSEL_PERSONALITIES, INTERNATIONAL_JUDGE_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES } from '../constants';
import { UserIcon } from './icons/UserIcon';
import { CourtIcon } from './icons/CourtIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { getCategoryColorClasses } from '../services/colorUtils';

interface ChatMessageProps {
  message: ChatMessageType;
  judgePersonalityId?: JudgePersonalityId;
  opposingCounselPersonalityId?: OpposingCounselPersonalityId;
  practiceMode?: 'indian' | 'international';
  categoryId?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  judgePersonalityId, 
  opposingCounselPersonalityId, 
  practiceMode,
  categoryId
}) => {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const isUser = message.sender === 'user';
  const isJudge = message.sender === 'judge';
  const isOpposingCounsel = message.sender === 'opposingCounsel';
  const isSystem = message.sender === 'system' || message.meta?.kind === 'system';
  const scoreDelta = message.meta?.scoreDelta;
  const scoreReason = message.meta?.scoreReason;

  const catColors = categoryId ? getCategoryColorClasses(categoryId) : {
    text: 'text-brand-concrete',
    bg: 'bg-brand-concrete',
    border: 'border-brand-concrete',
    bgMuted: 'bg-brand-concrete/10',
    textMuted: 'text-brand-concrete/80',
  };

  const alignment = isUser ? 'items-end' : 'items-start';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
    } catch {
      // Fallback for non-secure contexts
      const textarea = document.createElement('textarea');
      textarea.value = message.text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatText = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*|_.*?_)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className={`${isUser ? 'text-brand-accent' : catColors.text} font-semibold`}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('_') && part.endsWith('_')) {
        return <em key={index} className="font-serif italic opacity-90">{part.slice(1, -1)}</em>;
      }
      return part.split('\n').map((line, i) => (
        <React.Fragment key={`${index}-${i}`}>
          {line}
          {i < part.split('\n').length - 1 && <br />}
        </React.Fragment>
      ));
    });
  };

  const getSenderName = () => {
    if (message.sender === 'user') return 'You';
    if (isSystem) return 'System';

    const judgeList = practiceMode === 'international' ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES;
    const ocList = practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES;

    if (message.sender === 'judge') {
      return judgeList.find(j => j.id === judgePersonalityId)?.name || 'The Court';
    }
    if (message.sender === 'opposingCounsel') {
      const oc = ocList.find(o => o.id === opposingCounselPersonalityId);
      return oc ? `${oc.name} (${oc.specialty})` : 'Opposing Counsel';
    }
    return 'System';
  };

  const handleSpeak = (text: string) => {
    try {
      window.speechSynthesis.cancel(); // Abort active speaking
      const cleanText = text.replace(/\*\*|_/g, ''); // Strip markdown chars
      const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 800));

      let pitch = 1.0;
      let rate = 1.0;

      // Map character voice settings
      if (isJudge) {
        if (judgePersonalityId === 'robert_vance') { pitch = 0.85; rate = 0.95; }
        else if (judgePersonalityId === 'arthur_pendelton') { pitch = 1.05; rate = 1.05; }
        else if (judgePersonalityId === 'paul_vance') { pitch = 0.9; rate = 0.9; }
        else if (judgePersonalityId === 'daniel_sterling') { pitch = 1.0; rate = 1.0; }
        else if (judgePersonalityId === 'john_sterling') { pitch = 0.8; rate = 0.95; }
      } else if (isOpposingCounsel) {
        pitch = 1.1;
        rate = 1.05;
      }

      utterance.pitch = pitch;
      utterance.rate = rate;

      const voices = window.speechSynthesis.getVoices();
      const preferredLang = practiceMode === 'indian' ? 'en-IN' : 'en-US';
      const voice = voices.find(v => v.lang.includes(preferredLang)) || voices.find(v => v.lang.startsWith('en')) || voices[0];
      if (voice) {
        utterance.voice = voice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('Failed native speech synthesis:', err);
    }
  };

  if (isSystem) {
    return (
      <div className="group relative flex flex-col items-center mb-4 px-4 py-2 animate-fadeInUp w-full">
        <div className="max-w-2xl w-full rounded-xl border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-center">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-error/90 mb-1">System</p>
          <p className="text-xs sm:text-sm text-brand-text-primary/90 leading-relaxed whitespace-pre-wrap font-light">
            {formatText(message.text)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`group relative flex flex-col ${alignment} mb-4 sm:mb-5 px-2 sm:px-4 py-2 sm:py-2.5 rounded-xl hover:bg-white/[0.02] transition-colors duration-200 animate-fadeInUp w-full`}>
      {/* Floating actions menu (hover on desktop, tap on mobile) */}
      {!isUser && (
        <>
          {/* Mobile tap trigger */}
          <button
            onClick={() => setShowActions(prev => !prev)}
            className="absolute right-4 top-3 md:hidden z-10 w-7 h-7 flex items-center justify-center rounded-full bg-zinc-900/70 border border-zinc-700/60 text-zinc-400 text-sm font-bold"
            aria-label="Message actions"
          >
            ⋯
          </button>
          {/* Actions dropdown (desktop: hover, mobile: tap) */}
          <div className={`absolute right-4 top-10 transition-opacity duration-200 flex items-center space-x-2 bg-zinc-950/90 border border-zinc-800/80 px-2 py-1 rounded-md shadow-sm z-10 text-[10px] font-mono
            ${showActions ? 'opacity-100' : 'md:opacity-0 md:group-hover:opacity-100 opacity-0 pointer-events-none md:pointer-events-auto'}
          `}>
            <button
              onClick={() => handleSpeak(message.text)}
              className={`${catColors.text} hover:opacity-85 transition-opacity font-semibold`}
              title="Speak this statement"
            >
              Listen
            </button>
            <span className="text-zinc-800">|</span>
            <button
              onClick={handleCopy}
              className="text-zinc-400 hover:text-zinc-200 transition-colors font-semibold"
              title="Copy message to clipboard"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </>
      )}

      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start w-full max-w-4xl mx-auto`}>
        {/* Sleek Rounded Avatar */}
        <div className={`flex-shrink-0 h-9 w-9 sm:h-11 sm:w-11 rounded-full flex items-center justify-center mx-2 sm:mx-3 ${
          isUser 
            ? 'bg-zinc-800/45 border border-zinc-800/30' 
            : isJudge 
              ? 'bg-zinc-900 border border-zinc-800/60' 
              : 'bg-zinc-900 border border-zinc-800/60'
        }`}>
          {isUser && <UserIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-zinc-400" />}
          {isJudge && <CourtIcon className={`h-4.5 w-4.5 sm:h-5 sm:w-5 ${catColors.text}`} />}
          {isOpposingCounsel && <BriefcaseIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-zinc-400" />}
        </div>

        <div className={`flex flex-col flex-grow ${isUser ? 'items-end' : 'items-start'} max-w-[calc(100%-3rem)]`}>
          {/* Header Row */}
          <div className="flex items-center space-x-2 mb-1.5 text-[10px] font-mono uppercase tracking-widest text-brand-text-secondary/70">
            <span className={`font-bold ${isUser ? 'text-brand-text-secondary' : 'text-brand-text-primary'}`}>{getSenderName()}</span>
            <span>✦</span>
            <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
 
          {/* Message Content */}
          <div className={`w-full ${isUser ? 'flex justify-end' : ''}`}>
            {isUser ? (
              <div className="bg-brand-accent/15 text-brand-text-primary border border-brand-accent/30 rounded-xl px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm max-w-[85%] text-left">
                <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-light selection:bg-brand-accent/20">
                  {formatText(message.text)}
                </p>
                {(typeof scoreDelta === 'number' || scoreReason) && (
                  <div className="mt-2 pt-2 border-t border-brand-accent/20 flex flex-wrap items-center gap-2">
                    {typeof scoreDelta === 'number' && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                        scoreDelta > 0
                          ? 'text-brand-success border-brand-success/30 bg-brand-success/10'
                          : scoreDelta < 0
                            ? 'text-brand-error border-brand-error/30 bg-brand-error/10'
                            : 'text-brand-text-secondary border-white/10 bg-white/5'
                      }`}>
                        {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta} pts
                      </span>
                    )}
                    {scoreReason && (
                      <span className="text-[10px] font-mono text-brand-text-secondary/80">{scoreReason}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-brand-bg-secondary border border-brand-border text-brand-text-primary rounded-xl px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm max-w-[85%] text-left">
                <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-light selection:bg-brand-accent/20">
                  {formatText(message.text)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
