import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChatMessage as ChatMessageComponent } from '../components/ChatMessage';
import { Button } from '../components/Button';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { TrialSimContext } from '../App';
import { ChatMessage, SessionRecord, SessionSettings, PerformanceMetrics } from '../types';
import { getAiClient, startJudgeChatSession, startOpposingCounselChatSession, sendMessageToChatStream, analyzeSessionPerformance } from '../services/geminiService';
import { ROUTES, SESSION_DURATIONS_MINUTES } from '../constants';
import { useTimer } from '../hooks/useTimer';
import { Chat, GenerateContentResponse } from '@google/genai';
import { CourtIcon } from '../components/icons/CourtIcon'; 
import { BriefcaseIcon } from '../components/icons/BriefcaseIcon'; 

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
        if(navigateToAnalysis && currentSessionRecordRef.current) {
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

    if (!getAiClient()) {
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
  }, [messages]);

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
        setIsAiTyping(false); // Briefly turn off typing indicator
        await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay
      }
      
      if (sessionEnded || !isTimerRunning) return; // Check again after delay

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
        // Ensure the latest messages state is captured in the ref after all operations.
        // This is tricky because setMessages is async. A more robust way might be to update ref.current.transcript directly
        // whenever a message is finalized, rather than relying on the messages state variable here.
        // For now, this is a best effort to capture it.
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
    return <div className="flex justify-center items-center h-full bg-brand-bg-primary"><LoadingSpinner text="Loading session setup..." spinnerColor="text-brand-accent" textColor="text-brand-text-secondary"/></div>;
  }
  
  const judgeId = currentSessionSettings.judgePersonality.id;
  const ocId = currentSessionSettings.opposingCounselPersonality.id;

  return (
    <div className="flex flex-col h-screen bg-brand-bg-primary text-brand-text-primary overflow-hidden">
      {/* Header updated with neumorphic flat shadow and red accents */}
      <div className="p-4 bg-brand-bg-primary shadow-neumorphic-flat flex flex-col sm:flex-row justify-between items-center sticky top-0 z-10 border-b border-[var(--neumorphic-shadow-dark-var)] opacity-90">
        <div className="mb-2 sm:mb-0 text-center sm:text-left">
          <h2 className="text-lg sm:text-xl font-semibold text-brand-accent truncate max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl" title={currentSessionSettings.caseDetail.title}>{currentSessionSettings.caseDetail.title}</h2>
          <p className="text-xs sm:text-sm text-brand-text-secondary">
            Judge: {currentSessionSettings.judgePersonality.name} | OC: {currentSessionSettings.opposingCounselPersonality.name} ({currentSessionSettings.opposingCounselPersonality.specialty})
          </p>
        </div>
        <div className="text-center sm:text-right">
          {/* Timer text color red */}
          <p className="text-2xl sm:text-3xl font-mono text-brand-accent">{formattedTime}</p>
          <p className="text-xs text-brand-text-secondary">{remainingSeconds <=0 ? "Session Ended" : (isTimerRunning ? "Time Remaining" : "Timer Paused")}</p>
        </div>
      </div>

      <div ref={chatContainerRef} className="flex-grow p-4 space-y-4 overflow-y-auto bg-brand-bg-primary custom-scrollbar">
        {messages.map(msg => (
          <ChatMessageComponent key={msg.id} message={msg} judgePersonalityId={judgeId} opposingCounselPersonalityId={ocId} practiceMode={practiceMode} />
        ))}
        {isAiTyping && (
          <div className={`flex items-start mb-4`}> 
             <div className={`flex-shrink-0 h-8 w-8 rounded-full ${isAiTyping === 'judge' ? 'bg-brand-bg-secondary' : 'bg-brand-bg-secondary'} flex items-center justify-center mx-2 border border-brand-border shadow-neumorphic-raised`}>
                {isAiTyping === 'judge' && <CourtIcon className="h-5 w-5 text-brand-accent" />}
                {isAiTyping === 'opposingCounsel' && <BriefcaseIcon className="h-5 w-5 text-brand-accent" />}
            </div>
            <div className={`bg-brand-bg-secondary text-brand-text-primary rounded-lg p-3 shadow-neumorphic-flat`}>
              <p className="text-sm italic">{isAiTyping === 'judge' ? currentSessionSettings.judgePersonality.name : `${currentSessionSettings.opposingCounselPersonality.name} (${currentSessionSettings.opposingCounselPersonality.specialty})`} is typing<span className="animate-pulse">...</span></p>
            </div>
          </div>
        )}
        {sessionEnded && !isTimerRunning && ( 
           <div className="text-center p-4 bg-brand-bg-primary rounded-lg my-4 shadow-neumorphic-raised">
             <p className="text-xl font-semibold text-brand-accent">Session Ended</p>
             <Button onClick={() => handleSessionEnd(true, !currentSessionRecordRef.current?.performance)} className="mt-3" variant="primary">
                {currentSessionRecordRef.current?.performance ? 'View Performance Analysis' : 'Analyze & View Performance'}
             </Button>
           </div>
        )}
      </div>

      {!sessionEnded && (
        // Footer with neumorphic textarea and buttons
        <div className="p-4 bg-brand-bg-primary border-t border-[var(--neumorphic-shadow-dark-var)] opacity-95 sticky bottom-0 shadow-top">
          <div className="flex items-stretch space-x-3">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type your argument here... (Shift+Enter for new line)"
              className="flex-grow p-3 bg-brand-bg-primary text-brand-text-primary rounded-md shadow-neumorphic-pressed focus:ring-2 focus:ring-brand-accent focus:outline-none resize-none min-h-[60px] max-h-[150px] placeholder-brand-text-secondary custom-scrollbar"
              rows={3}
              disabled={!!isAiTyping || sessionEnded || !isTimerRunning}
            />
            {/* Send button is primary (solid red) */}
            <Button onClick={handleSendMessage} disabled={!!isAiTyping || !userInput.trim() || sessionEnded || !isTimerRunning} className="h-auto px-6 py-3" variant="primary">
              Send
            </Button>
          </div>
           {/* End Session button is danger (solid darker red) */}
          <Button 
            variant="danger" 
            size="sm" 
            onClick={() => { if (currentSessionSettings) handleSessionEnd(true, true);}} 
            className="mt-3 w-full sm:w-auto"
            disabled={sessionEnded || !isTimerRunning} 
          >
            End Session & Get Analysis
          </Button>
        </div>
      )}
    </div>
  );
};

export default PracticeArena;