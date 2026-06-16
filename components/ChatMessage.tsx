
import React from 'react';
import { ChatMessage as ChatMessageType, JudgePersonalityId, OpposingCounselPersonalityId } from '../types';
import { JUDGE_PERSONALITIES, OPPOSING_COUNSEL_PERSONALITIES, INTERNATIONAL_JUDGE_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES } from '../constants';
import { UserIcon } from './icons/UserIcon';
import { CourtIcon } from './icons/CourtIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';

interface ChatMessageProps {
  message: ChatMessageType;
  judgePersonalityId?: JudgePersonalityId;
  opposingCounselPersonalityId?: OpposingCounselPersonalityId;
  practiceMode?: 'indian' | 'international';
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, judgePersonalityId, opposingCounselPersonalityId, practiceMode }) => {
  const isUser = message.sender === 'user';
  const isJudge = message.sender === 'judge';
  const isOpposingCounsel = message.sender === 'opposingCounsel';

  const alignment = isUser ? 'items-end' : 'items-start';

  // Luxury Dark Mode Styles
  let bubbleColor = 'bg-brand-bg-primary text-brand-text-primary border border-brand-text-primary/30';
  let avatarIconColor = 'text-brand-accent';
  let avatarBgColor = 'bg-brand-bg-secondary border border-brand-text-primary/30';

  if (isUser) {
    bubbleColor = 'bg-brand-accent text-brand-accent-text border border-brand-accent/55';
    avatarIconColor = 'text-brand-accent-text';
    avatarBgColor = 'bg-brand-accent border-transparent';
  } else if (isJudge) {
    bubbleColor = 'bg-brand-bg-secondary text-brand-text-primary border border-brand-text-primary/30';
    avatarBgColor = 'bg-brand-bg-secondary border border-brand-text-primary/30';
  }

  const textAlign = isUser ? 'text-right' : 'text-left';

  const formatText = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*|_.*?_)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        // Bold text should stand out slightly more
        return <strong key={index} className={isUser ? "text-brand-navy font-bold" : "text-brand-accent font-semibold"}>{part.slice(2, -2)}</strong>;
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

    const judgeList = practiceMode === 'international' ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES;
    const ocList = practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES;

    if (message.sender === 'judge') {
      return judgeList.find(j => j.id === judgePersonalityId)?.name || 'The Court';
    }
    if (message.sender === 'opposingCounsel') {
      const oc = ocList.find(o => o.id === opposingCounselPersonalityId);
      return oc ? `${oc.name} (${oc.specialty})` : 'Opposing Counsel';
    }
    return '';
  }

  const handleSpeak = (text: string) => {
    try {
      window.speechSynthesis.cancel(); // Abort active speaking
      const cleanText = text.replace(/\*\*|_/g, ''); // Strip markdown chars
      const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 800));

      let pitch = 1.0;
      let rate = 1.0;

      // Map character voice settings
      if (isJudge) {
        if (judgePersonalityId === 'hr_khanna') { pitch = 0.85; rate = 0.95; }
        else if (judgePersonalityId === 'vr_krishna_iyer') { pitch = 1.05; rate = 1.05; }
        else if (judgePersonalityId === 'pn_bhagwati') { pitch = 0.9; rate = 0.9; }
        else if (judgePersonalityId === 'dy_chandrachud') { pitch = 1.0; rate = 1.0; }
        else if (judgePersonalityId === 'js_verma') { pitch = 0.8; rate = 0.95; }
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


  return (
    <div className={`flex flex-col ${alignment} mb-4 sm:mb-6 animate-fadeInUp w-full`}>
      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end max-w-full sm:max-w-[85%] lg:max-w-[75%]`}>
        <div className={`flex-shrink-0 h-8 w-8 sm:h-12 sm:w-12 rounded-none flex items-center justify-center mx-2.5 sm:mx-4 ${avatarBgColor}`}>
          {isUser && <UserIcon className={`h-4.5 w-4.5 sm:h-6 sm:w-6 ${avatarIconColor}`} />}
          {isJudge && <CourtIcon className={`h-4.5 w-4.5 sm:h-6 sm:w-6 ${avatarIconColor}`} />}
          {isOpposingCounsel && <BriefcaseIcon className={`h-4.5 w-4.5 sm:h-6 sm:w-6 ${avatarIconColor}`} />}
        </div>

        <div className="flex flex-col max-w-[calc(100%-3rem)] sm:max-w-[calc(100%-5rem)]">
          <p className={`text-[9px] sm:text-xs font-mono uppercase tracking-widest text-brand-text-secondary/80 mb-1 ${isUser ? 'mr-1 text-right' : 'ml-1 text-left'}`}>
            <span className={isUser ? 'text-brand-accent/80 font-semibold' : ''}>{getSenderName()}</span>
            {' ✦ '}
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {!isUser && (
              <>
                {' ✦ '}
                <button
                  onClick={() => handleSpeak(message.text)}
                  className="text-brand-accent hover:text-brand-accent-hover transition-colors font-semibold"
                  title="Speak this statement"
                >
                  [ Listen ]
                </button>
              </>
            )}
          </p>
          <div className={`${bubbleColor} rounded-none p-4 sm:p-5 relative`}>
            <div className={`text-sm sm:text-base leading-relaxed whitespace-pre-wrap ${textAlign} font-light`}>
              {formatText(message.text)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
