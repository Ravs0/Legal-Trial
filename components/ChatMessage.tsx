import React, { useEffect, useId, useState } from 'react';
import { ChatMessage as ChatMessageType, JudgePersonalityId, OpposingCounselPersonalityId } from '../types';
import { JUDGE_PERSONALITIES, OPPOSING_COUNSEL_PERSONALITIES, INTERNATIONAL_JUDGE_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES } from '../constants';
import { BriefcaseIcon, CourtIcon, UserIcon } from './icons';
import { getCategoryColorClasses } from '../services/colorUtils';

interface ChatMessageProps {
  message: ChatMessageType;
  judgePersonalityId?: JudgePersonalityId;
  opposingCounselPersonalityId?: OpposingCounselPersonalityId;
  practiceMode?: 'indian' | 'international';
  categoryId?: string;
}

const TTS_CHAR_LIMIT = 800;

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  judgePersonalityId,
  opposingCounselPersonalityId,
  practiceMode,
  categoryId,
}) => {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakTruncated, setSpeakTruncated] = useState(false);
  const actionsId = useId();

  const isUser = message.sender === 'user';
  const isJudge = message.sender === 'judge';
  const isOpposingCounsel = message.sender === 'opposingCounsel';
  const isSystem = message.sender === 'system' || message.meta?.kind === 'system';
  const scoreDelta = message.meta?.scoreDelta;
  const scoreReason = message.meta?.scoreReason;

  const catColors = categoryId
    ? getCategoryColorClasses(categoryId)
    : {
        text: 'text-brand-concrete',
        bg: 'bg-brand-concrete',
        border: 'border-brand-concrete',
        bgMuted: 'bg-brand-concrete/10',
        textMuted: 'text-brand-concrete/80',
      };

  const alignment = isUser ? 'items-end' : 'items-start';

  useEffect(() => {
    return () => {
      // Stop speech if this bubble unmounts mid-utterance
      if (isSpeaking && typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSpeaking]);

  const handleCopy = async () => {
    const plain = message.text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/(^|[^A-Za-z0-9])_(.+?)_([^A-Za-z0-9]|$)/g, '$1$2$3');
    try {
      await navigator.clipboard.writeText(plain);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = plain;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Lightweight markdown: **bold** and _italic_.
   * Identifiers like Section_65B stay plain (underscore between word chars is ignored).
   */
  const formatText = (text: string): React.ReactNode => {
    const renderPlain = (chunk: string, keyBase: string): React.ReactNode[] =>
      chunk.split('\n').map((line, i, arr) => (
        <React.Fragment key={`${keyBase}-${i}`}>
          {line}
          {i < arr.length - 1 && <br />}
        </React.Fragment>
      ));

    const renderWithItalic = (chunk: string, keyBase: string): React.ReactNode[] => {
      const out: React.ReactNode[] = [];
      // Space or start/end punct around _phrase_ — avoids Section_65B
      const re = /(^|[\s([{])_([^_\n]+)_(?=[\s)\]}.,;:!?]|$)/g;
      let last = 0;
      let m: RegExpExecArray | null;
      let k = 0;
      while ((m = re.exec(chunk)) !== null) {
        const lead = m[1];
        const body = m[2];
        const start = m.index;
        if (start > last) {
          out.push(...renderPlain(chunk.slice(last, start), `${keyBase}-p${k}`));
        }
        if (lead) out.push(lead);
        out.push(
          <em key={`${keyBase}-i${k}`} className="font-serif italic opacity-90">
            {body}
          </em>,
        );
        last = start + m[0].length;
        k += 1;
      }
      if (last < chunk.length) {
        out.push(...renderPlain(chunk.slice(last), `${keyBase}-end`));
      }
      return out.length > 0 ? out : renderPlain(chunk, keyBase);
    };

    const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={`b-${index}`} className={`${isUser ? 'text-brand-text-primary' : catColors.text} font-semibold`}>
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={`s-${index}`}>{renderWithItalic(part, `s${index}`)}</React.Fragment>;
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
      if (typeof window === 'undefined' || !window.speechSynthesis) return;

      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setSpeakTruncated(false);
        return;
      }

      window.speechSynthesis.cancel();
      const cleanText = text.replace(/\*\*/g, '').replace(/(^|[^A-Za-z0-9])_([^_]+)_([^A-Za-z0-9]|$)/g, '$1$2$3');
      const truncated = cleanText.length > TTS_CHAR_LIMIT;
      setSpeakTruncated(truncated);
      const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, TTS_CHAR_LIMIT));

      let pitch = 1.0;
      let rate = 1.0;

      if (isJudge) {
        if (judgePersonalityId === 'robert_vance') {
          pitch = 0.85;
          rate = 0.95;
        } else if (judgePersonalityId === 'arthur_pendelton') {
          pitch = 1.05;
          rate = 1.05;
        } else if (judgePersonalityId === 'paul_vance') {
          pitch = 0.9;
          rate = 0.9;
        } else if (judgePersonalityId === 'daniel_sterling') {
          pitch = 1.0;
          rate = 1.0;
        } else if (judgePersonalityId === 'john_sterling') {
          pitch = 0.8;
          rate = 0.95;
        }
      } else if (isOpposingCounsel) {
        pitch = 1.1;
        rate = 1.05;
      }

      utterance.pitch = pitch;
      utterance.rate = rate;

      const voices = window.speechSynthesis.getVoices();
      const preferredLang = practiceMode === 'indian' ? 'en-IN' : 'en-US';
      const voice =
        voices.find(v => v.lang.includes(preferredLang))
        || voices.find(v => v.lang.startsWith('en'))
        || voices[0];
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        setIsSpeaking(false);
        setSpeakTruncated(false);
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setSpeakTruncated(false);
      };

      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('Failed native speech synthesis:', err);
      setIsSpeaking(false);
      setSpeakTruncated(false);
    }
  };

  if (isSystem) {
    return (
      <div
        className="group relative mb-4 flex w-full animate-fadeInUp flex-col items-center px-4 py-2"
        role="status"
        aria-live="polite"
      >
        <div className="w-full max-w-2xl rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-center">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-brand-error/90">System</p>
          <p className="whitespace-pre-wrap text-xs font-light leading-relaxed text-brand-text-primary/90 sm:text-sm">
            {formatText(message.text)}
          </p>
        </div>
      </div>
    );
  }

  const timeLabel = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const senderName = getSenderName();

  return (
    <article
      className={`group relative mb-4 flex w-full animate-fadeInUp flex-col rounded-md px-2 py-2 transition-colors duration-200 hover:bg-white/[0.02] sm:mb-5 sm:px-4 sm:py-2.5 ${alignment}`}
      aria-label={`Message from ${senderName} at ${timeLabel}`}
    >
      {/* Floating actions (hover desktop / disclosure mobile) */}
      {!isUser && (
        <>
          <button
            type="button"
            onClick={() => setShowActions(prev => !prev)}
            className="absolute right-4 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-brand-border bg-brand-bg-secondary text-sm font-bold text-brand-text-secondary md:hidden"
            aria-label="Message actions"
            aria-expanded={showActions}
            aria-controls={actionsId}
          >
            ⋯
          </button>
          <div
            id={actionsId}
            className={`absolute right-4 top-10 z-10 flex items-center space-x-2 rounded-md border border-brand-border bg-brand-bg-primary/95 px-2 py-1 font-mono text-[10px] shadow-sm transition-opacity duration-200 ${
              showActions
                ? 'pointer-events-auto opacity-100'
                : 'pointer-events-none opacity-0 md:pointer-events-auto md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 md:focus-within:pointer-events-auto'
            }`}
          >
            <button
              type="button"
              onClick={() => handleSpeak(message.text)}
              className="font-semibold text-brand-text-primary/85 transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/40"
              aria-label={isSpeaking ? 'Stop speaking this statement' : 'Speak this statement'}
              title={isSpeaking ? 'Stop' : 'Listen'}
            >
              {isSpeaking ? 'Stop' : 'Listen'}
            </button>
            <span className="text-brand-text-primary/20" aria-hidden="true">
              |
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="font-semibold text-brand-text-secondary transition-colors hover:text-brand-text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/40"
              aria-label={copied ? 'Message copied' : 'Copy message to clipboard'}
              title={copied ? 'Copied' : 'Copy'}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {speakTruncated && isSpeaking && (
            <p className="sr-only" role="status">
              Speaking first {TTS_CHAR_LIMIT} characters of a longer statement.
            </p>
          )}
        </>
      )}

      <div className={`flex w-full max-w-4xl mx-auto ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start`}>
        <div
          className={`mx-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border sm:mx-3 sm:h-11 sm:w-11 ${
            isUser
              ? 'border-brand-border bg-brand-bg-tertiary'
              : 'border-brand-border bg-brand-bg-secondary'
          }`}
          aria-hidden="true"
        >
          {isUser && <UserIcon className="h-4 w-4 text-brand-text-secondary sm:h-5 sm:w-5" />}
          {isJudge && <CourtIcon className={`h-4 w-4 sm:h-5 sm:w-5 ${catColors.text}`} />}
          {isOpposingCounsel && <BriefcaseIcon className="h-4 w-4 text-brand-text-secondary sm:h-5 sm:w-5" />}
        </div>

        <div className={`flex max-w-[calc(100%-3rem)] flex-grow flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          <div className="mb-1.5 flex items-center space-x-2 font-mono text-[10px] uppercase tracking-widest text-brand-text-secondary/70">
            <span className={`font-bold ${isUser ? 'text-brand-text-secondary' : 'text-brand-text-primary'}`}>
              {senderName}
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime={new Date(message.timestamp).toISOString()}>{timeLabel}</time>
          </div>

          <div className={`w-full ${isUser ? 'flex justify-end' : ''}`}>
            {isUser ? (
              <div className="max-w-[85%] rounded-md border border-brand-border bg-[#1c1914]/[0.08] px-4 py-3 text-left text-brand-text-primary shadow-sm sm:px-5 sm:py-3.5">
                <p className="whitespace-pre-wrap text-xs font-light leading-relaxed selection:bg-[#1c1914]/[0.08] sm:text-sm">
                  {formatText(message.text)}
                </p>
                {(typeof scoreDelta === 'number' || scoreReason) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-brand-border pt-2">
                    {typeof scoreDelta === 'number' && (
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                          scoreDelta > 0
                            ? 'border-brand-success/40 bg-brand-success/10 text-brand-success'
                            : scoreDelta < 0
                              ? 'border-brand-error/40 bg-brand-error/10 text-brand-error'
                              : 'border-brand-border bg-[#1c1914]/[0.04] text-brand-text-secondary'
                        }`}
                      >
                        {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta} pts
                      </span>
                    )}
                    {scoreReason && (
                      <span className="font-mono text-[10px] text-brand-text-secondary/80">{scoreReason}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="max-w-[85%] rounded-md border border-brand-border bg-brand-bg-secondary px-4 py-3 text-left text-brand-text-primary shadow-sm sm:px-5 sm:py-3.5"
                aria-live="polite"
              >
                <p className="whitespace-pre-wrap text-xs font-light leading-relaxed selection:bg-[#1c1914]/[0.08] sm:text-sm">
                  {formatText(message.text)}
                </p>
                {speakTruncated && isSpeaking && (
                  <p className="mt-2 font-mono text-[10px] text-brand-text-secondary/70">
                    Reading first {TTS_CHAR_LIMIT} characters
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};
