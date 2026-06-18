import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChatMessage as ChatMessageComponent } from '../components/ChatMessage';
import { Button } from '../components/Button';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { TrialSimContext } from '../App';
import { ChatMessage, SessionRecord, SessionSettings, PerformanceMetrics } from '../types';
import { startJudgeChatSession, startOpposingCounselChatSession, sendMessageToChatStream, analyzeSessionPerformance } from '../services/geminiService';
import { ROUTES, SESSION_DURATIONS_MINUTES } from '../constants';
import { useTimer } from '../hooks/useTimer';
import { Chat } from '../types';
import { CourtIcon } from '../components/icons/CourtIcon';
import { BriefcaseIcon } from '../components/icons/BriefcaseIcon';
import { GavelIcon } from '../components/icons/GavelIcon';
import { Modal } from '../components/Modal';
import { getCategoryColorClasses } from '../services/colorUtils';

const useVisualViewport = () => {
  const [vpHeight, setVpHeight] = useState(
    () => typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : 800
  );
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
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
  // On mobile, subtract Layout's top bar (56px) + padding (24px total)
  const adjustedHeight = isMobile ? vpHeight - 80 : vpHeight;
  return { vpHeight: adjustedHeight, isMobile };
};

const PracticeArena: React.FC = () => {
  const navigate = useNavigate();
  const { vpHeight, isMobile } = useVisualViewport();
  const location = useLocation();
  const context = useContext(TrialSimContext);

  if (!context) throw new Error("TrialSimContext not found");
  const {
    currentSessionSettings, setCurrentSessionSettings,
    activeChatJudge, setActiveChatJudge,
    activeChatOpposingCounsel, setActiveChatOpposingCounsel,
    setIsLoading: setGlobalLoading, setError: setGlobalError,
    practiceMode
  } = context;

  const categoryId = currentSessionSettings?.caseDetail?.categoryId;
  const catColors = getCategoryColorClasses(categoryId || 'default');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(null);
  const [userInput, setUserInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState<'judge' | 'opposingCounsel' | false>(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const currentSessionRecordRef = useRef<SessionRecord | null>(null);

  // Objection and Drawer state
  const [isObjectionOpen, setIsObjectionOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [objectionGrounds, setObjectionGrounds] = useState('relevance');
  const [objectionExplanation, setObjectionExplanation] = useState('');
  const [isInlineObjectionActive, setIsInlineObjectionActive] = useState(false);

  const [objectionWindowActive, setObjectionWindowActive] = useState(false);
  const [objectionWindowSecondsLeft, setObjectionWindowSecondsLeft] = useState(4.0);
  const [quickObjectionsCount, setQuickObjectionsCount] = useState(0);
  const [runningScore, setRunningScore] = useState(100);

  const lastUserMessageRef = useRef('');
  const lastOcMessageRef = useRef('');


  // Voice recording states for STT
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Refs to avoid stale closures (B3: live transcript, B7: judge double-fire)
  const latestMessagesRef = useRef<ChatMessage[]>(messages);
  const judgeStreamInFlightRef = useRef<boolean>(false);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  const startRecording = async () => {
    setAudioError(null);
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        await handleSTT(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
      setAudioError('Microphone access is required for voice input.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleSTT = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const res = await fetch('/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'stt',
            audio: base64Audio,
            language: 'en-IN',
          }),
        });

        if (!res.ok) throw new Error('STT call failed');
        const data = await res.json();
        if (data.status === 'success' && data.text) {
          setUserInput(prev => prev ? `${prev} ${data.text}` : data.text);
          setAudioError(null);
        }
        setIsTranscribing(false);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('Transcription error:', err);
      setAudioError('Failed to transcribe voice.');
      setIsTranscribing(false);
    }
  };

  const sessionDurationSeconds = currentSessionSettings ? SESSION_DURATIONS_MINUTES[currentSessionSettings.sessionType] * 60 : 900;

  const { remainingSeconds, isRunning: isTimerRunning, pause: pauseTimer, reset: resetTimer, start: startTimer, formattedTime } = useTimer({
    durationSeconds: sessionDurationSeconds,
    onEnd: () => { if (!sessionEnded && currentSessionSettings) handleSessionEnd(true, true); },
    autoStart: false,
  });


  const handleSessionEnd = useCallback(async (navigateToAnalysis = true, triggerAnalysis = false) => {
    if (sessionEnded) {
      // Session already ended — only re-navigate to analysis if asked.
      if (navigateToAnalysis && currentSessionRecordRef.current) {
        navigate(ROUTES.ANALYSIS, { state: { sessionRecord: currentSessionRecordRef.current } });
      }
      return;
    }

    setSessionEnded(true);
    setIsAiTyping(false);
    pauseTimer();

    if (currentSessionRecordRef.current && currentSessionSettings) {
      let finalRecord: SessionRecord = {
        ...currentSessionRecordRef.current,
        transcript: messages,
        endTime: new Date(),
        durationMinutes: SESSION_DURATIONS_MINUTES[currentSessionSettings.sessionType] - Math.floor(remainingSeconds / 60),
      };

      if (triggerAnalysis && !finalRecord.performance) {
        setGlobalLoading(true);
        const analysis = await analyzeSessionPerformance(finalRecord, Math.min(runningScore, 200));
        if (analysis) {
          finalRecord.performance = analysis;
        } else {
          finalRecord.performance = {
            argumentStrength: 0, precedentUsage: 0, constitutionalBasis: 0, responseQuality: 0, overallScore: 0,
            feedback: "Performance analysis could not be generated at this time.",
            improvementAreas: ["Retry analysis later or review session manually."]
          };
          setGlobalError("Failed to generate performance analysis automatically.");
        }
        setGlobalLoading(false);
      }

      currentSessionRecordRef.current = finalRecord;

      if (navigateToAnalysis) {
        navigate(ROUTES.ANALYSIS, { state: { sessionRecord: finalRecord } });
        setCurrentSessionSettings(null);
        setActiveChatJudge(null);
        setActiveChatOpposingCounsel(null);
      }
    } else if (navigateToAnalysis) {
      navigate(ROUTES.HOME);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEnded, messages, currentSessionSettings, remainingSeconds, runningScore, navigate, setCurrentSessionSettings, setActiveChatJudge, setActiveChatOpposingCounsel, pauseTimer, setGlobalLoading, setGlobalError]);


  useEffect(() => {
    if (!currentSessionSettings || !practiceMode) {
      navigate(practiceMode ? ROUTES.SETUP : ROUTES.LANDING);
      return;
    }

    setGlobalLoading(true);
    const settingsWithMode = { ...currentSessionSettings, practiceMode };

    const judgeChat = startJudgeChatSession(settingsWithMode);
    const ocChat = startOpposingCounselChatSession(settingsWithMode);

    if (judgeChat && ocChat) {
      setActiveChatJudge(judgeChat);
      setActiveChatOpposingCounsel(ocChat);

      const initialMessagesList: ChatMessage[] = [];

      initialMessagesList.push({
        id: `oc-init-${Date.now()}`,
        sender: 'opposingCounsel',
        text: `Advocate ${currentSessionSettings.opposingCounselPersonality.name} (${currentSessionSettings.opposingCounselPersonality.specialty}). I am prepared to rigorously examine your arguments, Counsel, under the scrutiny of ${currentSessionSettings.judgePersonality.name}. Expect no easy concessions.`,
        timestamp: new Date(),
      });

      initialMessagesList.push({
        id: `judge-init-${Date.now()}`,
        sender: 'judge',
        text: `This Court is prepared to hear arguments in the matter of **${currentSessionSettings.caseDetail.title}**. Counsel (User), you may proceed. Be advised, both your arguments and those of Advocate ${currentSessionSettings.opposingCounselPersonality.name} will be subject to thorough examination. You have ${SESSION_DURATIONS_MINUTES[currentSessionSettings.sessionType]} minutes. The clock is running.`,
        timestamp: new Date(),
      });
      setMessages(initialMessagesList);

      currentSessionRecordRef.current = {
        id: `session-${Date.now()}`,
        settings: settingsWithMode,
        transcript: initialMessagesList,
        startTime: new Date(),
      };

      resetTimer();
      startTimer();

    } else {
      setGlobalError("Failed to initialize chat sessions with AI. Check console.");
      navigate(ROUTES.SETUP);
    }
    setGlobalLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isAiTyping]);

  const triggerAutoJudgeResponse = useCallback(async () => {
    if (sessionEnded || !isTimerRunning || !activeChatJudge || !currentSessionSettings) return;
    if (judgeStreamInFlightRef.current) return; // B7: prevent double-fire
    judgeStreamInFlightRef.current = true;
    setIsAiTyping('judge');
    const contextForJudge = `Counsel (User) stated: "${lastUserMessageRef.current}"\n\nOpposing Counsel (${currentSessionSettings.opposingCounselPersonality.name} - ${currentSessionSettings.opposingCounselPersonality.specialty}) responded: "${lastOcMessageRef.current}"\n\nYour Honor, your critical examination and questions?`;
    try {
      await streamAiResponse(activeChatJudge, contextForJudge, 'judge');
    } catch (e) {
      console.error("Error triggerAutoJudgeResponse:", e);
    } finally {
      setIsAiTyping(false);
      judgeStreamInFlightRef.current = false;
      if (currentSessionRecordRef.current) {
        setMessages(prevFinalMessages => {
          if (currentSessionRecordRef.current) {
            currentSessionRecordRef.current.transcript = prevFinalMessages;
          }
          return prevFinalMessages;
        });
      }
    }
  }, [sessionEnded, isTimerRunning, activeChatJudge, currentSessionSettings]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (objectionWindowActive) {
      interval = setInterval(() => {
        setObjectionWindowSecondsLeft(prev => {
          if (prev <= 0.1) {
            setObjectionWindowActive(false);
            // Trigger the auto judge response since window expired!
            triggerAutoJudgeResponse();
            return 0;
          }
          return Number((prev - 0.1).toFixed(1));
        });
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [objectionWindowActive, triggerAutoJudgeResponse]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key.toLowerCase() === 'o') {
        const lastMessage = messages[messages.length - 1];
        const canObject = messages.length > 0 && lastMessage && lastMessage.sender === 'opposingCounsel' && !isAiTyping && !sessionEnded && isTimerRunning;
        if (canObject && !isInlineObjectionActive) {
          e.preventDefault();
          setIsInlineObjectionActive(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [messages, isAiTyping, sessionEnded, isTimerRunning, isInlineObjectionActive]);

  useEffect(() => {
    const handlePaletteObjection = () => {
      const lastMessage = messages[messages.length - 1];
      const canObject = messages.length > 0 && lastMessage && lastMessage.sender === 'opposingCounsel' && !isAiTyping && !sessionEnded && isTimerRunning;
      if (canObject && !isInlineObjectionActive) {
        setIsInlineObjectionActive(true);
      }
    };

    window.addEventListener('cmd-palette-raise-objection', handlePaletteObjection);
    return () => window.removeEventListener('cmd-palette-raise-objection', handlePaletteObjection);
  }, [messages, isAiTyping, sessionEnded, isTimerRunning, isInlineObjectionActive]);

  useEffect(() => {
    const handlePaletteEndEarly = () => {
      if (!sessionEnded && isTimerRunning && currentSessionSettings) {
        handleSessionEnd(true, true);
      }
    };

    window.addEventListener('cmd-palette-end-early', handlePaletteEndEarly);
    return () => window.removeEventListener('cmd-palette-end-early', handlePaletteEndEarly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEnded, isTimerRunning, currentSessionSettings]);


  const streamAiResponse = async (
    chatInstance: Chat,
    textForAi: string,
    senderType: 'judge' | 'opposingCounsel',
    currentMessageId?: string
  ): Promise<string> => {

    let aiResponseText = '';
    const messageId = currentMessageId || `${senderType}-${Date.now()}`;

    if (!currentMessageId) {
      const placeholderMessage: ChatMessage = {
        id: messageId,
        sender: senderType,
        text: '...',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, placeholderMessage]);
    }

    const stream = await sendMessageToChatStream(chatInstance, textForAi);
    if (stream) {
      for await (const chunk of stream) {
        const chunkText = chunk.text || '';
        aiResponseText += chunkText;
        setMessages(prev => prev.map(msg =>
          msg.id === messageId ? { ...msg, text: aiResponseText } : msg
        ));
      }
      setMessages(prev => prev.map(msg =>
        msg.id === messageId ? { ...msg, text: aiResponseText || "No substantive response received.", timestamp: new Date() } : msg
      ));
    } else {
      aiResponseText = "Error: No response stream from AI.";
      setMessages(prev => prev.map(msg =>
        msg.id === messageId ? { ...msg, text: aiResponseText, timestamp: new Date() } : msg
      ));
    }
    if (currentSessionRecordRef.current) {
      currentSessionRecordRef.current.transcript = latestMessagesRef.current.map(msg =>
        msg.id === messageId ? { ...msg, text: aiResponseText } : msg
      );
    }
    return aiResponseText;
  };

  const handleObjectionSubmit = async () => {
    if (isAiTyping || sessionEnded || !activeChatJudge || !currentSessionSettings || !isTimerRunning) return;

    const isQuick = objectionWindowActive && objectionWindowSecondsLeft > 0;
    if (isQuick) {
      setQuickObjectionsCount(prev => prev + 1);
      setRunningScore(prev => prev + 25); // Award +25 points for quick objection
      setObjectionWindowActive(false);
    }

    const groundsText = {
      relevance: 'Irrelevant Arguments',
      facts: 'Mischaracterization of Facts',
      law: 'Misapplication of Precedent/Law',
      speculation: 'Speculation Without Evidence',
    }[objectionGrounds] || 'General Objection';

    const userMessageText = `[OBJECTION] Grounds: ${groundsText}\nBasis: ${objectionExplanation.trim()}${isQuick ? ' (Quick Objection Reflex - Speed Bonus Granted)' : ''}`;
    const userMessage: ChatMessage = {
      id: `user-objection-${Date.now()}`,
      sender: 'user',
      text: userMessageText,
      timestamp: new Date(),
    };

    // Temporarily save explanation to use in prompt
    const savedExplanation = objectionExplanation.trim();

    // Clear state early for clean UI
    setIsObjectionOpen(false);
    setIsInlineObjectionActive(false);
    setObjectionExplanation('');

    // Find the last opposing counsel statement to send to the Judge
    const lastOcMessage = [...messages].reverse().find(m => m.sender === 'opposingCounsel');
    const ocStatementText = lastOcMessage ? lastOcMessage.text : '';

    setMessages(prevMessages => {
      const updated = [...prevMessages, userMessage];
      if (currentSessionRecordRef.current) {
        currentSessionRecordRef.current.transcript = updated;
      }
      return updated;
    });

    try {
      setIsAiTyping('judge');
      const contextForJudge = `Counsel (User) has RAISED AN OBJECTION during their submission.\nGrounds of Objection: ${groundsText}\nUser's Basis: "${savedExplanation}"\n\nOpposing Counsel (${currentSessionSettings.opposingCounselPersonality.name}) previously argued: "${ocStatementText}"\n\nAdjudicate this objection strictly in character as Justice ${currentSessionSettings.judgePersonality.name}. State clearly whether the objection is SUSTAINED or OVERRULED, explain your reasoning based on the Case Brief ("${currentSessionSettings.caseDetail.briefFacts}") and Relevant Law ("${currentSessionSettings.caseDetail.relevantArticlesSections}") in under 100 words, and instruct the counsels how to proceed. ${isQuick ? "Note and praise counsel's excellent courtroom reflexes in objecting within the immediate timed objection window." : ''}`;
      
      await streamAiResponse(activeChatJudge, contextForJudge, 'judge');
    } catch (error) {
      console.error("Error during Judge Objection ruling:", error);
      setGlobalError("Failed to stream Judge ruling on objection.");
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isAiTyping || !activeChatJudge || !activeChatOpposingCounsel || sessionEnded || !currentSessionSettings || !isTimerRunning) return;

    // Reset objection window if active
    if (objectionWindowActive) {
      setObjectionWindowActive(false);
    }

    const userMessageText = userInput.trim();
    // Simple score tracking: award points for standard submission
    setRunningScore(prev => prev + 10);
    lastUserMessageRef.current = userMessageText;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userMessageText,
      timestamp: new Date(),
    };

    setMessages(prevMessages => {
      const updated = [...prevMessages, userMessage];
      if (currentSessionRecordRef.current) {
        currentSessionRecordRef.current.transcript = updated;
      }
      return updated;
    });
    setUserInput('');

    let ocResponseText = '';

    try {
      setIsAiTyping('opposingCounsel');
      ocResponseText = await streamAiResponse(activeChatOpposingCounsel, userMessageText, 'opposingCounsel');
      if (sessionEnded || !isTimerRunning) return;

      lastOcMessageRef.current = ocResponseText;

      // Opposing Counsel response is completed!
      // Trigger the 4-second timed objection window before the Judge response
      setIsAiTyping(false);
      setObjectionWindowActive(true);
      setObjectionWindowSecondsLeft(4.0);

    } catch (error) {
      console.error("Error during AI interaction:", error);
      const errorText = `An error occurred: ${error instanceof Error ? error.message : String(error)}. Please try again or end the session.`;
      const errorMessageContent: ChatMessage = {
        id: `error-${Date.now()}`,
        sender: 'judge',
        text: errorText,
        timestamp: new Date(),
      };
      setMessages(prev => {
        const updated = [...prev, errorMessageContent];
        if (currentSessionRecordRef.current) {
          currentSessionRecordRef.current.transcript = updated;
        }
        return updated;
      });
      setGlobalError(errorText);
      setIsAiTyping(false);
    }
  };


  const lastMessage = messages[messages.length - 1];
  const canObject = messages.length > 0 && lastMessage && lastMessage.sender === 'opposingCounsel' && !isAiTyping && !sessionEnded && isTimerRunning;

  const renderBenchCompanion = () => {
    if (!currentSessionSettings) return null;

    return (
      <div className="space-y-6 text-brand-text-secondary text-left">
        {/* Active Case Brief Section */}
        <div className="space-y-3">
          <h4 className={`text-xs uppercase font-mono tracking-widest ${catColors.text} border-b border-brand-text-primary/15 pb-1 flex items-center`}>
            <BriefcaseIcon className={`h-4 w-4 mr-1.5 ${catColors.text}`} /> Active Case Brief
          </h4>
          <div className="bg-brand-bg-secondary/60 border border-brand-text-primary/15 rounded-xl p-4 space-y-3 shadow-card">
            <h5 className="text-sm font-semibold text-brand-text-primary font-serif">{currentSessionSettings.caseDetail.title}</h5>
            <div className="text-xs text-brand-text-secondary font-light space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
              <p className="font-semibold text-brand-text-primary">Brief Facts:</p>
              <p className="leading-relaxed font-light">{currentSessionSettings.caseDetail.briefFacts}</p>
            </div>
            <div className="text-xs text-brand-text-secondary font-light space-y-1.5 pt-2.5 border-t border-brand-text-primary/15">
              <p className="font-semibold text-brand-text-primary">Relevant Law / Precedents:</p>
              <p className={`font-mono text-[10px] ${catColors.text} leading-relaxed`}>{currentSessionSettings.caseDetail.relevantArticlesSections}</p>
            </div>
          </div>
        </div>

        {/* Real-time score details */}
        <div className="space-y-3">
          <h4 className={`text-xs uppercase font-mono tracking-widest ${catColors.text} border-b border-brand-text-primary/15 pb-1 flex items-center`}>
            <svg className={`h-4 w-4 mr-1.5 ${catColors.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Live Trial Standing
          </h4>
          <div className="bg-brand-bg-secondary/60 border border-brand-text-primary/15 rounded-xl p-4 grid grid-cols-2 gap-4 shadow-card">
            <div>
              <p className="text-[9px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">Court Score</p>
              <p className={`text-2xl font-mono ${catColors.text} font-bold mt-1`}>{runningScore}</p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">Quick Reflexes</p>
              <p className={`text-2xl font-mono ${catColors.text} font-bold mt-1`}>{quickObjectionsCount}</p>
            </div>
          </div>
        </div>

        {/* Bench Profile Section */}
        <div className="space-y-3">
          <h4 className={`text-xs uppercase font-mono tracking-widest ${catColors.text} border-b border-brand-text-primary/15 pb-1 flex items-center`}>
            <CourtIcon className={`h-4 w-4 mr-1.5 ${catColors.text}`} /> Strategic Bench Profile
          </h4>
          <div className="bg-brand-bg-secondary/60 border border-brand-text-primary/15 rounded-xl p-4 space-y-4 shadow-card">
            {/* Judge info */}
            <div className="flex items-start space-x-3">
              <div className={`h-8 w-8 rounded-lg bg-brand-bg-tertiary border border-brand-text-primary/15 flex items-center justify-center flex-shrink-0 ${catColors.text} font-bold text-xs`}>
                J
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-brand-text-primary">{currentSessionSettings.judgePersonality.name}</p>
                <p className="text-[10px] text-brand-text-secondary leading-relaxed font-light">{currentSessionSettings.judgePersonality.description}</p>
              </div>
            </div>
            {/* Counsel info */}
            <div className="flex items-start space-x-3 pt-3 border-t border-brand-text-primary/15">
              <div className={`h-8 w-8 rounded-lg bg-brand-bg-tertiary border border-brand-text-primary/15 flex items-center justify-center flex-shrink-0 ${catColors.text} font-bold text-xs`}>
                OC
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-brand-text-primary">{currentSessionSettings.opposingCounselPersonality.name}</p>
                <p className="text-[10px] text-brand-text-secondary leading-relaxed font-light">{currentSessionSettings.opposingCounselPersonality.specialty} — {currentSessionSettings.opposingCounselPersonality.description}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Objections Toolkit Section */}
        <div className="space-y-3">
          <h4 className={`text-xs uppercase font-mono tracking-widest ${catColors.text} border-b border-brand-text-primary/15 pb-1 flex items-center`}>
            <GavelIcon className={`h-4 w-4 mr-1.5 ${catColors.text}`} /> Objections Toolkit
          </h4>

          {!canObject ? (
            <div className="bg-brand-bg-secondary/60 border border-brand-text-primary/15 rounded-xl p-4 text-center">
              <p className="text-xs text-brand-text-secondary/80 italic leading-relaxed font-light">
                Objections are currently locked. You can raise a formal objection only when Opposing Counsel has completed a submission.
              </p>
            </div>
          ) : (
            <div className="space-y-4 animate-fadeIn">
              <p className="text-xs text-brand-text-secondary font-light leading-relaxed">
                Select grounds and enter a concise basis to object to the Opposing Counsel's statement.
              </p>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'relevance', label: 'Relevance', desc: 'Irrelevant arguments' },
                  { value: 'facts', label: 'Facts', desc: 'Mischaracterizing facts' },
                  { value: 'law', label: 'Law', desc: 'Misapplying precedent' },
                  { value: 'speculation', label: 'Speculation', desc: 'Speculative assertions' },
                ].map(g => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setObjectionGrounds(g.value)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      objectionGrounds === g.value
                        ? `bg-brand-bg-tertiary text-brand-text-primary ${catColors.border} font-semibold`
                        : 'bg-brand-bg-secondary/40 border-brand-text-primary/15 text-brand-text-secondary hover:border-brand-text-primary/30 hover:text-brand-text-primary'
                    }`}
                  >
                    <p className="text-[11px] font-bold tracking-wide uppercase">{g.label}</p>
                    <p className="text-[9px] text-brand-text-secondary/70 truncate mt-0.5">{g.desc}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">Basis of Objection</label>
                <textarea
                  value={objectionExplanation}
                  onChange={(e) => setObjectionExplanation(e.target.value)}
                  placeholder="Explain why this statement is objectionable in one concise sentence..."
                  className="w-full p-3 bg-brand-bg-secondary/30 border border-brand-text-primary/15 rounded-lg focus:outline-none focus:border-brand-accent text-xs text-brand-text-primary placeholder-brand-text-secondary/50 resize-none min-h-[70px]"
                  rows={2}
                />
              </div>

              <button
                onClick={() => {
                  handleObjectionSubmit();
                  setIsMobileDrawerOpen(false);
                }}
                disabled={!objectionExplanation.trim()}
                className={`w-full py-2.5 rounded-lg text-xs tracking-wider uppercase font-semibold text-brand-accent-text ${catColors.bg} hover:brightness-110 disabled:bg-brand-bg-tertiary disabled:text-brand-text-secondary/50 border-none transition-all flex items-center justify-center`}
              >
                Raise Formal Objection
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!currentSessionSettings || !practiceMode) {
    return (
      <div className="flex justify-center items-center h-full bg-brand-bg-primary">
        <LoadingSpinner text="Loading session setup..." spinnerColor={catColors.text} textColor="text-brand-text-secondary" />
      </div>
    );
  }

  const judgeId = currentSessionSettings.judgePersonality.id;
  const ocId = currentSessionSettings.opposingCounselPersonality.id;

  return (
    <div 
      className="flex flex-col bg-brand-bg-primary text-brand-text-primary overflow-hidden relative"
      style={{ height: `${vpHeight}px` }}
    >

      <div className="p-4 sm:p-6 bg-brand-bg-secondary/80 backdrop-blur-md border-b border-brand-text-primary/15 flex flex-row justify-between items-center sticky top-0 z-20 flex-shrink-0">
        <div className="text-left flex-grow max-w-3xl mr-2">
          <div className="flex items-center space-x-3 mb-1">
            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-mono border border-brand-text-primary/20 bg-brand-bg-tertiary/60 text-brand-text-secondary uppercase tracking-wider">{currentSessionSettings.difficulty}</span>
            <span className="text-[10px] font-mono text-brand-text-secondary/70 uppercase tracking-widest">{currentSessionSettings.sessionType}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-shimmer truncate font-serif text-brand-text-primary" title={currentSessionSettings.caseDetail.title}>{currentSessionSettings.caseDetail.title}</h2>
          <div className="flex flex-wrap items-center text-xs sm:text-sm text-brand-text-secondary mt-1">
            <span className="flex items-center mr-4"><GavelIcon className="h-3.5 w-3.5 mr-1" /> {currentSessionSettings.judgePersonality.name}</span>
            <span className="flex items-center"><BriefcaseIcon className="h-3.5 w-3.5 mr-1" /> {currentSessionSettings.opposingCounselPersonality.name}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
          {/* End Early */}
          {!sessionEnded && isTimerRunning && (
            <button
              onClick={() => { if (currentSessionSettings) handleSessionEnd(true, true); }}
              className="p-2 sm:px-3 sm:py-1.5 rounded-lg border border-brand-error/30 bg-brand-bg-tertiary/40 hover:bg-brand-error/10 text-brand-error transition-all flex items-center justify-center gap-1.5 text-xs font-mono uppercase tracking-wider"
              title="End Trial Early"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="hidden sm:inline">End Early</span>
            </button>
          )}

          {/* Bench Companion Toggle for Mobile */}
          <button
            onClick={() => setIsMobileDrawerOpen(true)}
            className="lg:hidden p-2 rounded-lg border border-brand-text-primary/15 bg-brand-bg-tertiary/40 text-brand-text-secondary hover:bg-brand-text-primary/10 transition-all flex items-center justify-center"
            title="Open Bench Companion"
          >
            <CourtIcon className="h-5 w-5" />
          </button>

          <div className="text-right bg-brand-bg-tertiary/40 px-3 py-1 sm:px-4 sm:py-2 rounded-lg border border-brand-text-primary/15 hidden sm:block">
            <p className={`text-xl sm:text-2xl font-mono tracking-tight ${catColors.text} font-bold`}>{runningScore}</p>
            <p className="text-[8px] sm:text-[9px] uppercase font-mono tracking-widest mt-0.5 text-brand-text-secondary/70">Court Score</p>
          </div>

          <div className="text-right bg-brand-bg-tertiary/40 px-3 py-1 sm:px-4 sm:py-2 rounded-lg border border-brand-text-primary/15">
            <p className={`text-xl sm:text-2xl font-mono tracking-tight font-bold ${remainingSeconds < 60 ? 'text-brand-error animate-pulse' : catColors.text}`}>{formattedTime}</p>
            <p className="text-[8px] sm:text-[9px] uppercase font-mono tracking-widest mt-0.5 text-brand-text-secondary/70">{remainingSeconds <= 0 ? "Ended" : (isTimerRunning ? "Remaining" : "Paused")}</p>
          </div>
        </div>
      </div>

      {/* Main Body Layout */}
      <div className="flex flex-grow overflow-hidden relative z-10 w-full">
        {/* Left Column: Chat Area */}
        <div className="flex flex-col flex-grow h-full overflow-hidden relative">
          <div ref={chatContainerRef} className="flex-grow p-4 sm:p-6 space-y-2 overflow-y-auto custom-scrollbar bg-brand-bg-primary">
            <div className="max-w-4xl mx-auto">
              {messages.map((msg, index) => {
                const isLastMessage = index === messages.length - 1;
                const showObjectionTimer = isLastMessage && msg.sender === 'opposingCounsel' && objectionWindowActive;

                return (
                  <div key={msg.id} className="relative">
                    <ChatMessageComponent message={msg} judgePersonalityId={judgeId} opposingCounselPersonalityId={ocId} practiceMode={practiceMode} categoryId={categoryId || undefined} />
                    {showObjectionTimer && (
                      <div className="max-w-[85%] ml-[3.5rem] sm:ml-[5.5rem] mb-6 -mt-3 animate-fadeIn text-left">
                        <div className="bg-brand-bg-secondary/70 border border-brand-text-primary/15 rounded-xl p-4 flex flex-col space-y-2 shadow-card">
                          <div className={`flex justify-between items-center text-[10px] font-mono uppercase tracking-wider ${catColors.text}`}>
                            <span className="font-semibold flex items-center">
                              <svg className={`w-3.5 h-3.5 mr-1 ${catColors.text} animate-pulse`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                              Objection Reflex Window
                            </span>
                            <span className="font-bold">{objectionWindowSecondsLeft}s remaining</span>
                          </div>
                          {/* Shrinking progress bar */}
                          <div className="w-full bg-brand-bg-tertiary h-1.5 rounded-full overflow-hidden border border-brand-text-primary/15">
                            <div
                              className={`${catColors.bg} h-full transition-all duration-100 ease-linear rounded-full`}
                              style={{ width: `${(objectionWindowSecondsLeft / 4.0) * 100}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between items-center text-[9px] font-mono text-brand-text-secondary/70">
                            <span>Press [ O ] or click Objection below</span>
                            <span className={`${catColors.text} font-semibold`}>[ SPEED BONUS +25 PTS ]</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {(isAiTyping || isTranscribing) && (
                <div className="flex items-start mb-6 px-4 py-3 w-full animate-fadeInUp">
                  <div className="flex-shrink-0 h-9 w-9 sm:h-11 sm:w-11 rounded-full bg-brand-bg-secondary border border-brand-text-primary/15 flex items-center justify-center mx-2 sm:mx-3">
                    {isTranscribing || isAiTyping === 'judge' ? (
                      <CourtIcon className={`h-4.5 w-4.5 sm:h-5 sm:w-5 ${catColors.text}`} />
                    ) : (
                      <BriefcaseIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-brand-text-secondary" />
                    )}
                  </div>
                  <div className="flex flex-col flex-grow items-start max-w-[calc(100%-3rem)] pl-1">
                    <div className="flex items-center space-x-2 mb-1.5 text-[10px] font-mono uppercase tracking-widest text-brand-text-secondary/70">
                      <span className="font-bold text-brand-text-primary">
                        {isTranscribing ? 'Transcribing' : (isAiTyping === 'judge' ? 'The Court' : 'Opposing Counsel')}
                      </span>
                      <span>✦</span>
                      <span className="text-brand-text-secondary/70">{isTranscribing ? 'Voice' : 'Typing'}</span>
                    </div>
                    <div className="flex items-center space-x-2.5 py-1">
                      <span className="text-xs sm:text-sm font-light text-brand-text-secondary italic">
                        {isTranscribing ? "Listening and transcribing your voice" : (isAiTyping === 'judge' ? "The Court is considering your argument" : "Opposing Counsel is formulating a response")}
                      </span>
                      <span className="flex space-x-1 items-center h-2.5">
                        <span className={`w-1.5 h-1.5 ${catColors.bg} rounded-full animate-bounce`} style={{ animationDelay: '0ms' }}></span>
                        <span className={`w-1.5 h-1.5 ${catColors.bg} rounded-full animate-bounce`} style={{ animationDelay: '150ms' }}></span>
                        <span className={`w-1.5 h-1.5 ${catColors.bg} rounded-full animate-bounce`} style={{ animationDelay: '300ms' }}></span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {sessionEnded && !isTimerRunning && (
                <div className="text-center p-8 bg-brand-bg-secondary/70 border border-brand-text-primary/15 rounded-xl my-8 mx-auto max-w-lg shadow-card">
                  <div className="w-14 h-14 bg-brand-bg-tertiary rounded-full flex items-center justify-center mx-auto mb-4 border border-brand-text-primary/15">
                    <GavelIcon className={`w-6 h-6 ${catColors.text}`} />
                  </div>
                  <p className="text-2xl font-serif font-semibold text-brand-text-primary mb-6">Session Concluded</p>
                  <Button onClick={() => handleSessionEnd(true, !currentSessionRecordRef.current?.performance)} size="lg" variant="primary" className="w-full text-lg rounded-lg">
                    {currentSessionRecordRef.current?.performance ? 'View Detailed Analysis' : 'Analyze Performance'}
                  </Button>
                </div>
              )}
            </div>
          </div>
          {/* User Input Area */}
          {!sessionEnded && (
            <div className="p-3 sm:p-6 bg-brand-bg-primary border-t border-brand-text-primary/15 z-20 relative flex-shrink-0">
              <div className="max-w-4xl mx-auto">
                {audioError && (
                  <div className="p-2.5 mb-3 bg-brand-error/10 border border-brand-error/20 text-brand-error text-[11px] rounded-lg text-left animate-fadeIn">
                    [ Error ] {audioError}
                  </div>
                )}

                {/* Objection prompt pill */}
                {canObject && !isInlineObjectionActive && (
                  <div className="flex justify-center mb-3 animate-fadeInUp">
                    <button
                      type="button"
                      onClick={() => setIsInlineObjectionActive(true)}
                      className={`px-4 py-2 rounded-full border border-brand-text-primary/15 bg-brand-bg-secondary/60 hover:${catColors.bg} hover:text-brand-accent-text hover:border-transparent ${catColors.text} text-[10px] font-bold font-mono uppercase tracking-widest transition-all duration-300 flex items-center gap-2 shadow-card`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Objection! Raise Objection</span>
                      <span className="bg-brand-bg-tertiary text-brand-text-secondary px-1.5 py-0.5 rounded text-[8px] font-mono">Press [ O ]</span>
                    </button>
                  </div>
                )}

                {/* Objection formulation panel */}
                {isInlineObjectionActive && (
                  <div className="flex flex-col space-y-2.5 p-3.5 bg-brand-bg-secondary/70 border border-brand-text-primary/15 rounded-xl mb-3 text-left animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold ${catColors.text} uppercase tracking-wider flex items-center gap-1.5`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>
                        Drafting Formal Objection
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsInlineObjectionActive(false);
                          setObjectionExplanation('');
                        }}
                        className="text-[10px] font-mono uppercase text-brand-text-secondary/70 hover:text-brand-text-primary transition-colors"
                      >
                        [ Cancel ]
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { value: 'relevance', label: 'Relevance', desc: 'Irrelevant' },
                        { value: 'facts', label: 'Facts', desc: 'Mischaracterizing' },
                        { value: 'law', label: 'Law', desc: 'Misapplying' },
                        { value: 'speculation', label: 'Speculation', desc: 'Speculative' },
                      ].map(g => (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() => setObjectionGrounds(g.value)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all text-center flex flex-col items-center justify-center
                            ${objectionGrounds === g.value
                              ? `${catColors.bgMuted} ${catColors.border} text-brand-text-primary font-semibold`
                              : 'bg-brand-bg-secondary/40 border-brand-text-primary/15 text-brand-text-secondary hover:border-brand-text-primary/30 hover:text-brand-text-primary'
                            }`}
                        >
                          <span className="font-semibold text-[11px] sm:text-xs">{g.label}</span>
                          <span className="text-[8px] opacity-60 hidden sm:inline">{g.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sleek Input Composer Capsule */}
                <div className="relative flex items-end gap-2.5 max-w-3xl mx-auto rounded-xl border border-brand-text-primary/20 bg-brand-bg-secondary/50 focus-within:border-brand-accent focus-within:shadow-glow-accent-sm transition-all px-3 py-2 sm:py-2.5 shadow-card">
                  {/* Microphone Record Button */}
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={!!isAiTyping || sessionEnded || !isTimerRunning}
                    className={`w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 rounded-lg flex items-center justify-center transition-all focus:outline-none disabled:opacity-40
                      ${isRecording
                        ? 'bg-brand-error/15 border border-brand-error/30 text-brand-error animate-pulse'
                        : 'bg-brand-bg-tertiary border border-brand-text-primary/15 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-text-primary/10'
                      }`}
                    title={isRecording ? 'Stop Recording' : 'Speak to Transcribe'}
                  >
                    {isRecording ? (
                      <span className="w-2.5 h-2.5 bg-brand-error rounded-sm animate-ping"></span>
                    ) : (
                      <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/>
                      </svg>
                    )}
                  </button>

                  {/* Textarea */}
                  <textarea
                    value={isInlineObjectionActive ? objectionExplanation : userInput}
                    onChange={(e) => isInlineObjectionActive ? setObjectionExplanation(e.target.value) : setUserInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        isInlineObjectionActive ? handleObjectionSubmit() : handleSendMessage();
                      }
                    }}
                    placeholder={isInlineObjectionActive ? "Explain objection basis..." : "Address the Court..."}
                    className="flex-grow bg-transparent text-brand-text-primary placeholder-brand-text-secondary/50 text-xs sm:text-sm resize-none focus:outline-none min-h-[36px] max-h-[140px] py-2 custom-scrollbar font-light"
                    rows={1}
                    disabled={!!isAiTyping || sessionEnded || !isTimerRunning}
                  />

                  {/* Send Button */}
                  <button
                    type="button"
                    onClick={isInlineObjectionActive ? handleObjectionSubmit : handleSendMessage}
                    disabled={!!isAiTyping || (isInlineObjectionActive ? !objectionExplanation.trim() : !userInput.trim()) || sessionEnded || !isTimerRunning}
                    className={`w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 rounded-full flex items-center justify-center transition-all focus:outline-none
                      ${(isInlineObjectionActive ? objectionExplanation.trim() : userInput.trim()) && !isAiTyping && isTimerRunning
                        ? `${catColors.bg} text-brand-accent-text hover:brightness-110`
                        : 'bg-brand-bg-tertiary text-brand-text-secondary/50 border border-brand-text-primary/15 cursor-not-allowed'
                      }`}
                    title={isInlineObjectionActive ? "Submit Objection" : "Send Statement"}
                  >
                    <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5 transform rotate-90" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                </div>
                
                <p className="text-center mt-3 text-[10px] font-mono text-zinc-500 tracking-widest uppercase hidden sm:block select-none">
                  Present your arguments clearly and concisely. The Court is listening.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Bench Companion (Desktop) */}
        <div className="lg:w-[380px] xl:w-[420px] w-full lg:flex hidden flex-col border-l border-zinc-900/60 bg-[#0a0a0a] overflow-y-auto custom-scrollbar p-6 space-y-6 flex-shrink-0 h-full relative z-20">
          {renderBenchCompanion()}
        </div>
      </div>

      {/* Mobile Drawer Backdrop */}
      {isMobileDrawerOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-[#000000]/80 z-40 transition-opacity duration-300"
          onClick={() => setIsMobileDrawerOpen(false)}
        />
      )}
      
      {/* Mobile Drawer Content */}
      <div className={`lg:hidden fixed bottom-0 left-0 right-0 max-h-[85vh] bg-[#0d0d0d] border-t border-zinc-800/80 rounded-t-xl z-50 transform transition-transform duration-300 overflow-y-auto custom-scrollbar p-6 space-y-6 shadow-none ${isMobileDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex justify-between items-center pb-2 border-b border-zinc-900/60">
          <h3 className={`text-lg font-bold font-serif ${catColors.text} flex items-center`}><CourtIcon className={`h-5 w-5 mr-2 ${catColors.text}`} /> Bench Companion</h3>
          <button onClick={() => setIsMobileDrawerOpen(false)} className="text-zinc-500 hover:text-zinc-400 text-sm font-mono p-1">Close</button>
        </div>
        {renderBenchCompanion()}
      </div>
    </div>
  );
};

export default PracticeArena;