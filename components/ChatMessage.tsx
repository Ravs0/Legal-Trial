
import React from 'react';
import { ChatMessage as ChatMessageType, JudgePersonalityId, OpposingCounselPersonalityId } from '../types';
// Fix: Import separate international personality arrays
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
  
  // Updated color scheme
  let bubbleColor = 'bg-neutral-800 text-brand-text-primary shadow-neumorphic-flat'; // Darker neutral for AI, flat neumorphic look
  let avatarIconColor = 'text-brand-accent'; // Red icon for Judge/OC by default
  let avatarBgColor = 'bg-brand-bg-primary shadow-neumorphic-raised'; // Avatar BG matches app BG, raised

  if (isUser) {
    bubbleColor = 'bg-brand-accent text-brand-accent-text shadow-neumorphic-flat'; // Red bg, white text for User, flat neumorphic
    avatarIconColor = 'text-brand-accent-text'; // White icon on red bg for User
    avatarBgColor = 'bg-brand-accent shadow-neumorphic-raised'; // Red BG for user avatar, raised
  } else if (isJudge) {
    // Judge can have a slightly different neutral if needed, or same as OC.
    // For now, same as OC's bubbleColor base but can differentiate.
    // avatarIconColor remains 'text-brand-accent' (red)
  }
  // Opposing counsel uses the default AI bubbleColor and avatarIconColor

  const textAlign = isUser ? 'text-right' : 'text-left';

  const formatText = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*|_.*?_)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('_') && part.endsWith('_')) {
        return <em key={index}>{part.slice(1, -1)}</em>;
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
      return judgeList.find(j => j.id === judgePersonalityId)?.name || 'Judge';
    }
    if (message.sender === 'opposingCounsel') {
      const oc = ocList.find(o => o.id === opposingCounselPersonalityId);
      return oc ? `${oc.name} (${oc.specialty})` : 'Opposing Counsel';
    }
    return '';
   }


  return (
    <div className={`flex flex-col ${alignment} mb-4 animate-fadeIn`}>
      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end max-w-xl lg:max-w-2xl`}>
        <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center mx-2 ${avatarBgColor} border border-brand-border`}>
          {isUser && <UserIcon className={`h-5 w-5 ${avatarIconColor}`} />}
          {isJudge && <CourtIcon className={`h-5 w-5 ${avatarIconColor}`} />}
          {isOpposingCounsel && <BriefcaseIcon className={`h-5 w-5 ${avatarIconColor}`} />}
        </div>
        <div className={`${bubbleColor} rounded-lg p-3`}>
          <p className={`text-sm whitespace-pre-wrap ${textAlign}`}>{formatText(message.text)}</p>
        </div>
      </div>
      <p className={`text-xs text-brand-text-secondary mt-1 ${isUser ? 'mr-10 self-end' : 'ml-10 self-start'}`}>
        {getSenderName()}
        {' at '}
        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
};
