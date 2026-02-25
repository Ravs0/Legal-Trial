
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
  let bubbleColor = 'bg-brand-navy/60 backdrop-blur-md text-brand-text-primary border border-brand-accent/20 shadow-card';
  let avatarIconColor = 'text-brand-accent';
  let avatarBgColor = 'bg-brand-navy border border-brand-accent/30 shadow-inner-subtle';

  if (isUser) {
    bubbleColor = 'bg-brand-accent text-brand-accent-text shadow-glow-gold-sm border border-brand-accent-hover/50';
    avatarIconColor = 'text-brand-accent-text';
    avatarBgColor = 'bg-brand-accent shadow-glow-gold border-transparent';
  } else if (isJudge) {
    bubbleColor = 'bg-brand-bg-tertiary/80 backdrop-blur-md text-brand-text-primary border border-brand-accent/30 shadow-card';
    avatarBgColor = 'bg-brand-navy border border-brand-accent/40 shadow-[0_0_15px_rgba(201,168,76,0.2)]';
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


  return (
    <div className={`flex flex-col ${alignment} mb-6 animate-fadeInUp w-full`}>
      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end max-w-full sm:max-w-[85%] lg:max-w-[75%]`}>
        <div className={`flex-shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center mx-3 sm:mx-4 ${avatarBgColor}`}>
          {isUser && <UserIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${avatarIconColor}`} />}
          {isJudge && <CourtIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${avatarIconColor}`} />}
          {isOpposingCounsel && <BriefcaseIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${avatarIconColor}`} />}
        </div>

        <div className="flex flex-col max-w-[calc(100%-4rem)] sm:max-w-[calc(100%-5rem)]">
          <p className={`text-[10px] sm:text-xs font-mono uppercase tracking-widest text-brand-text-secondary/80 mb-1.5 ${isUser ? 'mr-1 text-right' : 'ml-1 text-left'}`}>
            <span className={isUser ? 'text-brand-accent/80 font-semibold' : ''}>{getSenderName()}</span>
            {' ✦ '}
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className={`${bubbleColor} rounded-2xl ${isUser ? 'rounded-br-sm' : 'rounded-bl-sm'} p-4 sm:p-5 relative`}>
            {isJudge && <div className="absolute top-0 left-0 w-1/2 h-[1px] bg-gradient-to-r from-brand-accent/50 to-transparent"></div>}
            <div className={`text-sm sm:text-base leading-relaxed whitespace-pre-wrap ${textAlign} font-light`}>
              {formatText(message.text)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
