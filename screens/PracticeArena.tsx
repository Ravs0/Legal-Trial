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
import { Modal } from '../components/Modal';

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

  // Objection and Drawer state
  const [isObjectionOpen, setIsObjectionOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [objectionGrounds, setObjectionGrounds] = useState('relevance');
  const [objectionExplanation, setObjectionExplanation] = useState('');

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
      setGlobalError("No AI API key found. Please add DEEPSEEK_API_KEY, KIMI_API_KEY, or GROQ_API_KEY in Vercel environment variables.");
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
        const chunkText = typeof chunk.text === 'function' ? chunk.text() : (chunk.text || '');
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

  const handleObjectionSubmit = async () => {
    if (isAiTyping || sessionEnded || !activeChatJudge || !currentSessionSettings || !isTimerRunning) return;

    const groundsText = {
      relevance: 'Irrelevant Arguments',
      facts: 'Mischaracterization of Facts',
      law: 'Misapplication of Precedent/Law',
      speculation: 'Speculation Without Evidence',
    }[objectionGrounds] || 'General Objection';

    const userMessageText = `[OBJECTION] Grounds: ${groundsText}\nBasis: ${objectionExplanation.trim()}`;
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
      const contextForJudge = `Counsel (User) has RAISED AN OBJECTION during their submission.\nGrounds of Objection: ${groundsText}\nUser's Basis: "${savedExplanation}"\n\nOpposing Counsel (${currentSessionSettings.opposingCounselPersonality.name}) previously argued: "${ocStatementText}"\n\nAdjudicate this objection strictly in character as Justice ${currentSessionSettings.judgePersonality.name}. State clearly whether the objection is SUSTAINED or OVERRULED, explain your reasoning based on the Case Brief ("${currentSessionSettings.caseDetail.briefFacts}") and Relevant Law ("${currentSessionSettings.caseDetail.relevantArticlesSections}") in under 100 words, and instruct the counsels how to proceed.`;
      
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

  const renderBenchCompanion = () => {
    if (!currentSessionSettings) return null;

    const lastMessage = messages[messages.length - 1];
    const canObject = messages.length > 0 && lastMessage && lastMessage.sender === 'opposingCounsel' && !isAiTyping && !sessionEnded && isTimerRunning;

    return (
      <div className="space-y-6 text-brand-text-primary text-left">
        {/* Active Case Brief Section */}
        <div className="space-y-3">
          <h4 className="text-xs uppercase font-mono tracking-widest text-brand-accent border-b border-brand-accent/20 pb-1 flex items-center">
            <BriefcaseIcon className="h-4 w-4 mr-1.5 text-brand-accent" /> Active Case Brief
          </h4>
          <div className="bg-brand-navy/35 border border-brand-accent/10 rounded-xl p-3.5 space-y-2">
            <h5 className="text-sm font-semibold text-brand-text-primary font-serif">{currentSessionSettings.caseDetail.title}</h5>
            <div className="text-xs text-brand-text-secondary font-light space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
              <p className="font-semibold text-brand-text-primary/95">Brief Facts:</p>
              <p className="leading-relaxed">{currentSessionSettings.caseDetail.briefFacts}</p>
            </div>
            <div className="text-xs text-brand-text-secondary font-light space-y-1.5 pt-2 border-t border-brand-accent/5">
              <p className="font-semibold text-brand-text-primary/95">Relevant Law / Precedents:</p>
              <p className="font-mono text-[10px] text-brand-accent/90 leading-relaxed">{currentSessionSettings.caseDetail.relevantArticlesSections}</p>
            </div>
          </div>
        </div>

        {/* Bench Profile Section */}
        <div className="space-y-3">
          <h4 className="text-xs uppercase font-mono tracking-widest text-brand-accent border-b border-brand-accent/20 pb-1 flex items-center">
            <CourtIcon className="h-4 w-4 mr-1.5 text-brand-accent" /> Strategic Bench Profile
          </h4>
          <div className="bg-brand-navy/35 border border-brand-accent/10 rounded-xl p-3.5 space-y-3">
            {/* Judge info */}
            <div className="flex items-start space-x-3">
              <div className="h-8 w-8 rounded-full bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center flex-shrink-0 text-brand-accent">
                <GavelIcon className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-brand-text-primary">{currentSessionSettings.judgePersonality.name}</p>
                <p className="text-[10px] text-brand-text-secondary leading-relaxed font-light">{currentSessionSettings.judgePersonality.description}</p>
              </div>
            </div>
            {/* Counsel info */}
            <div className="flex items-start space-x-3 pt-2.5 border-t border-brand-accent/5">
              <div className="h-8 w-8 rounded-full bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center flex-shrink-0 text-brand-accent">
                <BriefcaseIcon className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-brand-text-primary">{currentSessionSettings.opposingCounselPersonality.name} (Opposing)</p>
                <p className="text-[10px] text-brand-text-secondary leading-relaxed font-light">{currentSessionSettings.opposingCounselPersonality.specialty} — {currentSessionSettings.opposingCounselPersonality.description}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Objections Toolkit Section */}
        <div className="space-y-3">
          <h4 className="text-xs uppercase font-mono tracking-widest text-brand-accent border-b border-brand-accent/20 pb-1 flex items-center">
            <GavelIcon className="h-4 w-4 mr-1.5 text-brand-accent" /> Objections Toolkit
          </h4>
          
          {!canObject ? (
            <div className="bg-brand-navy/20 border border-brand-accent/5 rounded-xl p-4 text-center">
              <p className="text-xs text-brand-text-secondary/60 italic leading-relaxed">
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
                        ? 'bg-brand-accent/10 border-brand-accent text-brand-accent shadow-glow-gold-sm'
                        : 'bg-brand-navy/40 border-brand-accent/10 text-brand-text-secondary hover:border-brand-accent/30'
                    }`}
                  >
                    <p className="text-[11px] font-bold tracking-wide uppercase">{g.label}</p>
                    <p className="text-[9px] text-brand-text-secondary/70 truncate mt-0.5">{g.desc}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-brand-text-secondary uppercase tracking-wider">Basis of Objection</label>
                <textarea
                  value={objectionExplanation}
                  onChange={(e) => setObjectionExplanation(e.target.value)}
                  placeholder="Explain why this statement is objectionable in one concise sentence..."
                  className="w-full p-3 bg-brand-navy/60 border border-brand-accent/20 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-accent text-xs text-brand-text-primary placeholder-brand-text-secondary/40 font-light resize-none min-h-[70px]"
                  rows={2}
                />
              </div>

              <button
                onClick={() => {
                  handleObjectionSubmit();
                  setIsMobileDrawerOpen(false);
                }}
                disabled={!objectionExplanation.trim()}
                className="w-full py-2.5 text-xs tracking-wider uppercase font-bold text-brand-navy bg-brand-accent hover:bg-brand-accent-hover disabled:bg-brand-navy/50 disabled:text-brand-text-secondary/50 rounded-xl transition-all shadow-glow-gold flex items-center justify-center"
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
        <LoadingSpinner text="Loading session setup..." spinnerColor="text-brand-accent" textColor="text-brand-text-secondary" />
      </div>
    );
  }

  const judgeId = currentSessionSettings.judgePersonality.id;
  const ocId = currentSessionSettings.opposingCounselPersonality.id;

  return (
    <div className="flex flex-col h-screen bg-brand-bg-primary text-brand-text-primary overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-[30vh] bg-gradient-to-b from-brand-navy/50 to-transparent pointer-events-none z-0"></div>

      <div className="p-4 sm:p-6 glass-card rounded-none border-b border-brand-accent/20 flex flex-row justify-between items-center sticky top-0 z-20 shadow-md flex-shrink-0">
        <div className="text-left flex-grow max-w-3xl">
          <div className="flex items-center space-x-3 mb-1">
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono border border-brand-accent/30 text-brand-accent bg-brand-accent/5 uppercase tracking-wider">{currentSessionSettings.difficulty}</span>
            <span className="text-[10px] font-mono text-brand-text-secondary/70 uppercase tracking-widest">{currentSessionSettings.sessionType}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-shimmer truncate font-serif" title={currentSessionSettings.caseDetail.title}>{currentSessionSettings.caseDetail.title}</h2>
          <div className="flex flex-wrap items-center text-xs sm:text-sm text-brand-text-secondary mt-1">
            <span className="flex items-center mr-4"><GavelIcon className="h-3.5 w-3.5 mr-1" /> {currentSessionSettings.judgePersonality.name}</span>
            <span className="flex items-center"><BriefcaseIcon className="h-3.5 w-3.5 mr-1" /> {currentSessionSettings.opposingCounselPersonality.name}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-3 flex-shrink-0">
          {/* Bench Companion Toggle for Mobile */}
          <button 
            onClick={() => setIsMobileDrawerOpen(true)}
            className="lg:hidden p-2.5 rounded-xl border border-brand-accent/30 bg-brand-navy/40 text-brand-accent hover:bg-brand-accent/10 transition-all flex items-center justify-center animate-pulse"
            title="Open Bench Companion"
          >
            <CourtIcon className="h-5 w-5" />
          </button>
          
          <div className="text-right bg-brand-navy/60 backdrop-blur-md px-4 py-2 sm:px-5 sm:py-3 rounded-2xl border border-brand-accent/20 shadow-inner-subtle">
            <p className={`text-2xl sm:text-4xl font-mono tracking-tight drop-shadow-md ${remainingSeconds < 60 ? 'text-brand-error animate-pulse' : 'text-brand-accent'}`}>{formattedTime}</p>
            <p className="text-[8px] sm:text-[10px] uppercase font-mono tracking-widest mt-0.5 sm:mt-1 text-brand-text-secondary/80">{remainingSeconds <= 0 ? "Session Ended" : (isTimerRunning ? "Time Remaining" : "Timer Paused")}</p>
          </div>
        </div>
      </div>

      {/* Main Body Layout */}
      <div className="flex flex-grow overflow-hidden relative z-10 w-full">
        {/* Left Column: Chat Area */}
        <div className="flex flex-col flex-grow h-full overflow-hidden relative">
          <div ref={chatContainerRef} className="flex-grow p-4 sm:p-6 space-y-2 overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto">
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

          {/* User Input Area */}
          {!sessionEnded && (
            <div className="p-4 sm:p-6 bg-brand-bg-primary/80 backdrop-blur-lg border-t border-brand-accent/20 z-20 relative flex-shrink-0">
              <div className="max-w-4xl mx-auto">
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
                  <div className="flex flex-row w-full sm:w-auto sm:flex-col space-x-2.5 sm:space-x-0 sm:space-y-3 items-stretch justify-end">
                    <button
                      onClick={handleSendMessage}
                      disabled={!!isAiTyping || !userInput.trim() || sessionEnded || !isTimerRunning}
                      className="flex-grow sm:flex-grow-0 py-3.5 sm:py-4 px-6 sm:px-8 text-base sm:text-lg font-semibold bg-brand-accent hover:bg-brand-accent-hover text-brand-navy disabled:bg-brand-navy/50 disabled:text-brand-text-secondary/50 hover:-translate-y-0.5 rounded-xl sm:rounded-2xl transition-all shadow-glow-gold flex items-center justify-center font-bold"
                    >
                      Send
                    </button>
                    {(() => {
                      const lastMessage = messages[messages.length - 1];
                      const canObject = messages.length > 0 && lastMessage && lastMessage.sender === 'opposingCounsel' && !isAiTyping && !sessionEnded && isTimerRunning;
                      return canObject ? (
                        <button
                          onClick={() => {
                            setIsMobileDrawerOpen(true);
                          }}
                          className="flex-grow sm:flex-grow-0 py-3.5 px-4 text-xs tracking-wider uppercase border border-brand-accent/50 text-brand-accent bg-transparent hover:bg-brand-accent/10 focus:ring-brand-accent rounded-xl sm:rounded-2xl font-bold transition-all"
                        >
                          Objection!
                        </button>
                      ) : null;
                    })()}
                    <button
                      onClick={() => { if (currentSessionSettings) handleSessionEnd(true, true); }}
                      className="py-3 px-4 text-xs tracking-wider uppercase border border-brand-error/50 text-brand-error bg-transparent hover:bg-brand-error/10 focus:ring-brand-error rounded-xl sm:rounded-2xl flex-shrink-0 font-bold transition-all"
                      disabled={sessionEnded || !isTimerRunning}
                    >
                      End Early
                    </button>
                  </div>
                </div>
                <p className="text-center mt-3 text-[10px] font-mono text-brand-text-secondary/40 tracking-widest uppercase hidden sm:block">
                  Present your arguments clearly and concisely. The Court is listening.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Bench Companion (Desktop) */}
        <div className="lg:w-[380px] xl:w-[420px] w-full lg:flex hidden flex-col border-l border-brand-accent/20 bg-brand-bg-primary/95 overflow-y-auto custom-scrollbar p-6 space-y-6 flex-shrink-0 h-full relative z-20 shadow-xl">
          {renderBenchCompanion()}
        </div>
      </div>

      {/* Mobile Drawer Backdrop */}
      {isMobileDrawerOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={() => setIsMobileDrawerOpen(false)}
        />
      )}
      
      {/* Mobile Drawer Content */}
      <div className={`lg:hidden fixed bottom-0 left-0 right-0 max-h-[85vh] bg-brand-bg-primary border-t border-brand-accent/30 rounded-t-3xl z-50 transform transition-transform duration-300 overflow-y-auto custom-scrollbar p-6 space-y-6 shadow-2xl ${isMobileDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex justify-between items-center pb-2 border-b border-brand-accent/15">
          <h3 className="text-lg font-bold font-serif text-brand-accent flex items-center"><CourtIcon className="h-5 w-5 mr-2 text-brand-accent" /> Bench Companion</h3>
          <button onClick={() => setIsMobileDrawerOpen(false)} className="text-brand-text-secondary hover:text-brand-accent text-sm font-mono p-1">Close</button>
        </div>
        {renderBenchCompanion()}
      </div>
    </div>
  );
};

export default PracticeArena;