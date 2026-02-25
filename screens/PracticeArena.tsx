import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChatMessage as ChatMessageComponent } from '../components/ChatMessage';
import { Button } from '../components/Button';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { TrialSimContext } from '../App';
import { ChatMessage, SessionRecord, SessionSettings, PerformanceMetrics } from '../types';
import { getApiConfig, startJudgeChatSession, startOpposingCounselChatSession, sendMessageToChatStream, analyzeSessionPerformance } from '../services/geminiService';
import { ROUTES, SESSION_DURATIONS_MINUTES } from '../constants';
import { useTimer } from '../hooks/useTimer';
import { Chat } from '../types';
import { CourtIcon } from '../components/icons/CourtIcon';
import { BriefcaseIcon } from '../components/icons/BriefcaseIcon';
import { GavelIcon } from '../components/icons/GavelIcon';

const PracticeArena: React.FC = () => {
  const navigate = useNavigate();
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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState<'judge' | 'opposingCounsel' | false>(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const currentSessionRecordRef = useRef<SessionRecord | null>(null);

  const sessionDurationSeconds = currentSessionSettings ? SESSION_DURATIONS_MINUTES[currentSessionSettings.sessionType] * 60 : 900;

  const onTimerEnd = useCallback(async () => {
    if (!sessionEnded) {
      await handleSessionEnd(true, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEnded]);


  const { remainingSeconds, isRunning: isTimerRunning, pause: pauseTimer, reset: resetTimer, start: startTimer, formattedTime } = useTimer({
    durationSeconds: sessionDurationSeconds,
    onEnd: () => { if (!sessionEnded && currentSessionSettings) handleSessionEnd(true, true); },
    autoStart: false,
  });


  const handleSessionEnd = useCallback(async (navigateToAnalysis = true, triggerAnalysis = false) => {
    if (sessionEnded && navigateToAnalysis && currentSessionRecordRef.current?.performance && !triggerAnalysis) {
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
        const analysis = await analyzeSessionPerformance(finalRecord);
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
  }, [sessionEnded, messages, currentSessionSettings, remainingSeconds, navigate, setCurrentSessionSettings, setActiveChatJudge, setActiveChatOpposingCounsel, pauseTimer, setGlobalLoading, setGlobalError]);


  useEffect(() => {
    if (!currentSessionSettings || !practiceMode) {
      navigate(practiceMode ? ROUTES.SETUP : ROUTES.LANDING);
      return;
    }

    if (!getApiConfig()) {
      setGlobalError("Gemini API client is not initialized. Ensure API_KEY is set.");
      navigate(ROUTES.LANDING);
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
        const chunkText = chunk.text;
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
      const currentTranscript = messages;
      currentSessionRecordRef.current.transcript = currentTranscript.map(msg =>
        msg.id === messageId ? { ...msg, text: aiResponseText } : msg
      );
    }
    return aiResponseText;
  };


  const handleSendMessage = async () => {
    if (!userInput.trim() || isAiTyping || !activeChatJudge || !activeChatOpposingCounsel || sessionEnded || !currentSessionSettings || !isTimerRunning) return;

    const userMessageText = userInput.trim();
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

      // Introduce a delay before the judge responds
      if (!sessionEnded && isTimerRunning) {
        setIsAiTyping(false);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      if (sessionEnded || !isTimerRunning) return;

      setIsAiTyping('judge');
      const contextForJudge = `Counsel (User) stated: "${userMessageText}"\n\nOpposing Counsel (${currentSessionSettings.opposingCounselPersonality.name} - ${currentSessionSettings.opposingCounselPersonality.specialty}) responded: "${ocResponseText}"\n\nYour Honor, your critical examination and questions?`;
      await streamAiResponse(activeChatJudge, contextForJudge, 'judge');

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
    } finally {
      setIsAiTyping(false);
      if (currentSessionRecordRef.current) {
        setMessages(prevFinalMessages => {
          if (currentSessionRecordRef.current) {
            currentSessionRecordRef.current.transcript = prevFinalMessages;
          }
          return prevFinalMessages;
        });
      }
    }
  };

  if (!currentSessionSettings || !practiceMode) {
    return <div className="flex justify-center items-center h-full bg-brand-bg-primary"><LoadingSpinner text="Loading session setup..." spinnerColor="text-brand-accent" textColor="text-brand-text-secondary" /></div>;
  }

  const judgeId = currentSessionSettings.judgePersonality.id;
  const ocId = currentSessionSettings.opposingCounselPersonality.id;

  return (
    <div className="flex flex-col h-screen bg-brand-bg-primary text-brand-text-primary overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-[30vh] bg-gradient-to-b from-brand-navy/50 to-transparent pointer-events-none z-0"></div>

      <div className="p-4 sm:p-6 glass-card rounded-none border-b border-brand-accent/20 flex flex-col sm:flex-row justify-between items-center sticky top-0 z-20 shadow-md">
        <div className="mb-3 sm:mb-0 text-center sm:text-left flex-grow max-w-3xl">
          <div className="flex items-center justify-center sm:justify-start space-x-3 mb-1">
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono border border-brand-accent/30 text-brand-accent bg-brand-accent/5 uppercase tracking-wider">{currentSessionSettings.difficulty}</span>
            <span className="text-[10px] font-mono text-brand-text-secondary/70 uppercase tracking-widest">{currentSessionSettings.sessionType}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-shimmer truncate font-serif" title={currentSessionSettings.caseDetail.title}>{currentSessionSettings.caseDetail.title}</h2>
          <div className="flex flex-wrap items-center justify-center sm:justify-start text-xs sm:text-sm text-brand-text-secondary mt-1">
            <span className="flex items-center mr-4"><GavelIcon className="h-3.5 w-3.5 mr-1" /> {currentSessionSettings.judgePersonality.name}</span>
            <span className="flex items-center"><BriefcaseIcon className="h-3.5 w-3.5 mr-1" /> {currentSessionSettings.opposingCounselPersonality.name}</span>
          </div>
        </div>
        <div className="text-center sm:text-right flex-shrink-0 bg-brand-navy/60 backdrop-blur-md px-5 py-3 rounded-2xl border border-brand-accent/20 shadow-inner-subtle">
          <p className={`text-3xl sm:text-4xl font-mono tracking-tight drop-shadow-md ${remainingSeconds < 60 ? 'text-brand-error animate-pulse' : 'text-brand-accent'}`}>{formattedTime}</p>
          <p className="text-[10px] uppercase font-mono tracking-widest mt-1 text-brand-text-secondary/80">{remainingSeconds <= 0 ? "Session Ended" : (isTimerRunning ? "Time Remaining" : "Timer Paused")}</p>
        </div>
      </div>

      <div ref={chatContainerRef} className="flex-grow p-4 sm:p-6 space-y-2 overflow-y-auto custom-scrollbar relative z-10">
        <div className="max-w-5xl mx-auto">
          {messages.map(msg => (
            <ChatMessageComponent key={msg.id} message={msg} judgePersonalityId={judgeId} opposingCounselPersonalityId={ocId} practiceMode={practiceMode} />
          ))}
          {isAiTyping && (
            <div className="flex items-start mb-6 w-full animate-fadeInUp">
              <div className={`flex-shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-brand-navy border border-brand-accent/30 shadow-inner-subtle flex items-center justify-center mx-3 sm:mx-4`}>
                {isAiTyping === 'judge' && <CourtIcon className="h-5 w-5 sm:h-6 sm:w-6 text-brand-accent" />}
                {isAiTyping === 'opposingCounsel' && <BriefcaseIcon className="h-5 w-5 sm:h-6 sm:w-6 text-brand-accent" />}
              </div>
              <div className="bg-brand-navy/60 backdrop-blur-md text-brand-text-primary rounded-2xl rounded-bl-sm p-4 sm:p-5 border border-brand-accent/10 shadow-card flex items-center space-x-2">
                <span className="text-sm font-light italic opacity-80">{isAiTyping === 'judge' ? "The Court is considering your argument" : "Opposing Counsel is formulating a response"}</span>
                <span className="flex space-x-1">
                  <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </span>
              </div>
            </div>
          )}
          {sessionEnded && !isTimerRunning && (
            <div className="text-center p-8 glass-card border-brand-accent/20 rounded-3xl my-8 mx-auto max-w-lg shadow-card">
              <div className="w-16 h-16 bg-brand-accent/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-brand-accent/30 shadow-glow-gold-sm">
                <GavelIcon className="w-8 h-8 text-brand-accent" />
              </div>
              <p className="text-2xl font-serif font-semibold text-shimmer mb-6">Session Concluded</p>
              <Button onClick={() => handleSessionEnd(true, !currentSessionRecordRef.current?.performance)} size="lg" variant="primary" className="shadow-glow-gold w-full text-lg">
                {currentSessionRecordRef.current?.performance ? 'View Detailed Analysis' : 'Analyze Performance'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {!sessionEnded && (
        <div className="p-4 sm:p-6 bg-brand-bg-primary/80 backdrop-blur-lg border-t border-brand-accent/20 z-20 relative">
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end space-y-3 sm:space-y-0 sm:space-x-4">
              <div className="relative flex-grow">
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Address the Court... (Shift+Enter for new line)"
                  className="w-full p-4 pl-5 pr-12 bg-brand-navy/50 backdrop-blur-sm text-brand-text-primary rounded-2xl border border-brand-accent/20 focus:ring-2 focus:ring-brand-accent focus:border-brand-accent/50 focus:outline-none resize-none min-h-[70px] max-h-[180px] placeholder-brand-text-secondary/50 font-light text-base sm:text-lg shadow-inner-subtle custom-scrollbar transition-all duration-300 group"
                  rows={2}
                  disabled={!!isAiTyping || sessionEnded || !isTimerRunning}
                />
                <div className="absolute top-2 right-2 p-1.5 hidden sm:block opacity-40">
                  <span className="text-[10px] font-mono tracking-widest uppercase">Drafting</span>
                </div>
              </div>
              <div className="flex flex-row sm:flex-col space-x-3 sm:space-x-0 sm:space-y-3">
                <Button
                  onClick={handleSendMessage}
                  disabled={!!isAiTyping || !userInput.trim() || sessionEnded || !isTimerRunning}
                  className="flex-grow sm:flex-grow-0 py-3.5 sm:py-4 px-8 text-lg font-medium shadow-glow-gold hover:-translate-y-0.5 rounded-xl sm:rounded-2xl"
                  variant="primary"
                >
                  Send
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { if (currentSessionSettings) handleSessionEnd(true, true); }}
                  className="py-3 px-4 text-xs tracking-wider uppercase border-brand-error/50 text-brand-error hover:bg-brand-error/10 hover:text-brand-error focus:ring-brand-error rounded-xl sm:rounded-2xl flex-shrink-0"
                  disabled={sessionEnded || !isTimerRunning}
                >
                  End Early
                </Button>
              </div>
            </div>
            <p className="text-center mt-3 text-[10px] font-mono text-brand-text-secondary/40 tracking-widest uppercase hidden sm:block">
              Present your arguments clearly and concisely. The Court is listening.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeArena;