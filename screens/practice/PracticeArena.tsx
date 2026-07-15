import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatMessage as ChatMessageComponent } from '../../components/ChatMessage';
import { Button } from '../../components/Button';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { TrialSimContext } from '../../App';
import { AnalysisStatus, Chat, ChatMessage, SessionRecord, TrialPhase, TrialScoreBreakdown } from '../../types';
import {
  startJudgeChatSession,
  startOpposingCounselChatSession,
  sendMessageToChatStream,
  analyzeSessionPerformance,
  buildJudgePrompt,
  buildOpposingCounselPrompt,
} from '../../services/aiService';
import { clearActiveSession, loadActiveSession, saveActiveSession, saveCompletedSession } from '../../services/storageService';
import { speak, cancelSpeech, isTTSAvailable } from '../../services/voiceService';
import { ROUTES, SESSION_DURATIONS_MINUTES } from '../../constants';
import { useTimer } from '../../hooks/useTimer';
import { CourtIcon } from '../../components/icons/CourtIcon';
import { BriefcaseIcon } from '../../components/icons/BriefcaseIcon';
import { GavelIcon } from '../../components/icons/GavelIcon';
import { getCategoryColorClasses } from '../../services/colorUtils';
import { BackgroundGeometry } from '../../components/BackgroundGeometry';
import { useVisualViewport } from '../../hooks/useVisualViewport';
import { trackEvent } from '../../services/analyticsService';
import {
  DEFAULT_SCORE_BREAKDOWN,
  detectObjectionOutcome,
  inferNextPhase,
  phaseLabel,
  scoreObjection,
  scoreSubmission,
} from '../../services/trialScoring';
import { SessionChipRow } from '../../components/SessionChip';

const PHASE_SEQUENCE: TrialPhase[] = ['opening', 'issue_framing', 'rebuttal', 'judicial_questions', 'closing'];
const formatCounselName = (name: string) => /^(adv\.?|advocate)\s/i.test(name.trim()) ? name : `Advocate ${name}`;

const PracticeArena: React.FC = () => {
  const navigate = useNavigate();
  const { vpHeight, viewportHeight } = useVisualViewport({ breakpoint: 768, mobileOffset: 0, desktopOffset: 0 });
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
  const [userInput, setUserInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState<'judge' | 'opposingCounsel' | false>(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [activePhase, setActivePhase] = useState<TrialPhase>('opening');
  const [scoreBreakdown, setScoreBreakdown] = useState<TrialScoreBreakdown>(DEFAULT_SCORE_BREAKDOWN);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const currentSessionRecordRef = useRef<SessionRecord | null>(null);

  // Objection and Drawer state
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [objectionGrounds, setObjectionGrounds] = useState('relevance');
  const [objectionExplanation, setObjectionExplanation] = useState('');
  const [isInlineObjectionActive, setIsInlineObjectionActive] = useState(false);

  const [objectionWindowActive, setObjectionWindowActive] = useState(false);
  const [objectionWindowSecondsLeft, setObjectionWindowSecondsLeft] = useState(6.0);
  const [quickObjectionsCount, setQuickObjectionsCount] = useState(0);

  const lastUserMessageRef = useRef('');
  const lastOcMessageRef = useRef('');
  const firstArgumentTrackedRef = useRef(false);

  // Voice recording states for STT
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Text-to-speech toggle — the bench speaks its replies aloud.
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('lexforge.voiceEnabled') === 'true'; } catch { return false; }
  });
  const voiceEnabledRef = useRef(voiceEnabled);
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
    try { localStorage.setItem('lexforge.voiceEnabled', voiceEnabled ? 'true' : 'false'); } catch { /* ignore */ }
  }, [voiceEnabled]);

  // Refs to avoid stale closures (B3: live transcript, B7: judge double-fire)
  const latestMessagesRef = useRef<ChatMessage[]>(messages);
  const judgeStreamInFlightRef = useRef<boolean>(false);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  const sessionDurationSeconds = currentSessionSettings ? SESSION_DURATIONS_MINUTES[currentSessionSettings.sessionType] * 60 : 900;

  const { remainingSeconds, isRunning: isTimerRunning, pause: pauseTimer, reset: resetTimer, start: startTimer, formattedTime } = useTimer({
    durationSeconds: sessionDurationSeconds,
    onEnd: () => { if (!sessionEnded && currentSessionSettings) handleSessionEnd(true, true); },
    autoStart: false,
  });

  const syncSessionRecord = useCallback((nextMessages: ChatMessage[], nextScore: TrialScoreBreakdown, nextPhase: TrialPhase) => {
    latestMessagesRef.current = nextMessages;
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setScoreBreakdown(nextScore);
    setActivePhase(nextPhase);

    if (!currentSessionRecordRef.current) return;

    const nextRecord: SessionRecord = {
      ...currentSessionRecordRef.current,
      transcript: nextMessages,
      scoreBreakdown: nextScore,
      activePhase: nextPhase,
      elapsedSeconds: Math.max(0, sessionDurationSeconds - remainingSeconds),
      durationMinutes: Math.max(0, Math.round((sessionDurationSeconds - remainingSeconds) / 60)),
    };

    currentSessionRecordRef.current = nextRecord;
    saveActiveSession(nextRecord);
  }, [remainingSeconds, sessionDurationSeconds]);

  const finalizeSessionRecord = useCallback((record: SessionRecord, analysisStatus: AnalysisStatus, performance?: SessionRecord['performance']) => {
    const nextRecord: SessionRecord = {
      ...record,
      performance,
      analysisStatus,
      endTime: new Date(),
      elapsedSeconds: Math.max(0, sessionDurationSeconds - remainingSeconds),
      durationMinutes: Math.max(0, Math.round((sessionDurationSeconds - remainingSeconds) / 60)),
      activePhase,
      scoreBreakdown,
      transcript: latestMessagesRef.current,
    };

    currentSessionRecordRef.current = nextRecord;
    saveCompletedSession(nextRecord);
    clearActiveSession();
    return nextRecord;
  }, [activePhase, remainingSeconds, scoreBreakdown, sessionDurationSeconds]);

  const startRecording = async () => {
    setAudioError(null);
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const mediaRecorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const mimeType = mediaRecorder.mimeType || preferredMime || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
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
    setAudioError(null);
    try {
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const result = reader.result as string;
            const payload = result?.includes(',') ? result.split(',')[1] : '';
            if (!payload) reject(new Error('Could not read audio data.'));
            else resolve(payload);
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read audio recording.'));
        reader.readAsDataURL(blob);
      });

      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stt',
          audio: base64Audio,
          mimeType: blob.type || 'audio/webm',
          language: practiceMode === 'international' ? 'en-US' : 'en-IN',
        }),
      });

      const data = await res.json().catch(() => ({} as { status?: string; text?: string; error?: string }));
      if (!res.ok) {
        if (res.status === 503 || /key|sarvam|config/i.test(String(data.error || ''))) {
          throw new Error('Voice transcription is unavailable (server voice key not configured).');
        }
        throw new Error(data.error || `Transcription failed (${res.status}).`);
      }
      if (data.status === 'success' && data.text) {
        setUserInput(prev => (prev ? `${prev} ${data.text}` : data.text));
      } else {
        throw new Error(data.error || 'No speech detected. Try again.');
      }
    } catch (err) {
      console.error('Transcription error:', err);
      setAudioError(err instanceof Error ? err.message : 'Failed to transcribe voice.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSessionEnd = useCallback(async (navigateToAnalysis = true, triggerAnalysis = false) => {
    if (sessionEnded) {
      if (navigateToAnalysis && currentSessionRecordRef.current) {
        navigate(ROUTES.ANALYSIS, { state: { sessionRecord: currentSessionRecordRef.current } });
      }
      return;
    }

    setSessionEnded(true);
    setIsAiTyping(false);
    pauseTimer();
    cancelSpeech();

    if (currentSessionSettings) {
      trackEvent('session_completed', {
        mode: currentSessionSettings.practiceMode,
        caseId: currentSessionSettings.caseDetail.id,
        sessionType: currentSessionSettings.sessionType,
        durationMinutes: Math.max(0, Math.round((sessionDurationSeconds - remainingSeconds) / 60)),
        overallScore: scoreBreakdown?.total ?? null,
      });
    }

    if (!currentSessionRecordRef.current || !currentSessionSettings) {
      if (navigateToAnalysis) navigate(ROUTES.HOME);
      return;
    }

    let finalRecord: SessionRecord = {
      ...currentSessionRecordRef.current,
      transcript: latestMessagesRef.current,
      endTime: new Date(),
      elapsedSeconds: Math.max(0, sessionDurationSeconds - remainingSeconds),
      durationMinutes: Math.max(0, Math.round((sessionDurationSeconds - remainingSeconds) / 60)),
      activePhase,
      scoreBreakdown,
      analysisStatus: triggerAnalysis ? { state: 'pending' } : currentSessionRecordRef.current.analysisStatus,
    };

    if (triggerAnalysis && !finalRecord.performance) {
      setGlobalLoading(true);
      const analysis = await analyzeSessionPerformance(finalRecord, scoreBreakdown);
      if (analysis) {
        finalRecord = finalizeSessionRecord(finalRecord, { state: 'ready' }, analysis);
      } else {
        setGlobalError('Performance analysis could not be generated automatically.');
        finalRecord = finalizeSessionRecord(finalRecord, { state: 'unavailable', error: 'analysis_unavailable' });
      }
      setGlobalLoading(false);
    } else {
      finalRecord = finalizeSessionRecord(
        finalRecord,
        finalRecord.analysisStatus || (finalRecord.performance ? { state: 'ready' } : { state: 'idle' }),
        finalRecord.performance,
      );
    }

    if (navigateToAnalysis) {
      navigate(`${ROUTES.ANALYSIS}?sessionId=${encodeURIComponent(finalRecord.id)}`, { state: { sessionRecord: finalRecord } });
      setCurrentSessionSettings(null);
      setActiveChatJudge(null);
      setActiveChatOpposingCounsel(null);
    }
  }, [sessionEnded, currentSessionSettings, remainingSeconds, activePhase, scoreBreakdown, navigate, setCurrentSessionSettings, setActiveChatJudge, setActiveChatOpposingCounsel, pauseTimer, setGlobalLoading, setGlobalError, finalizeSessionRecord, sessionDurationSeconds]);

  useEffect(() => {
    if (!currentSessionSettings || !practiceMode) {
      navigate(practiceMode ? ROUTES.SETUP : ROUTES.LANDING);
      return;
    }

    setGlobalLoading(true);
    const savedSession = loadActiveSession();
    const settingsWithMode = { ...currentSessionSettings, practiceMode };

    // Resume only when the active session matches this case (not merely mode).
    const canResume = Boolean(
      savedSession
      && savedSession.settings.practiceMode === practiceMode
      && savedSession.settings.caseDetail?.id === currentSessionSettings.caseDetail?.id
      && Array.isArray(savedSession.transcript)
      && savedSession.transcript.length > 0,
    );
    const priorTranscript = canResume ? savedSession!.transcript : undefined;

    const judgeChat = startJudgeChatSession(settingsWithMode, priorTranscript);
    const ocChat = startOpposingCounselChatSession(settingsWithMode, priorTranscript);

    if (!judgeChat || !ocChat) {
      setGlobalError('Failed to initialize chat sessions with AI. Check console.');
      setGlobalLoading(false);
      navigate(ROUTES.SETUP);
      return;
    }

    setActiveChatJudge(judgeChat);
    setActiveChatOpposingCounsel(ocChat);

    if (canResume && savedSession) {
      currentSessionRecordRef.current = {
        ...savedSession,
        settings: settingsWithMode,
      };
      setMessages(savedSession.transcript);
      setScoreBreakdown(savedSession.scoreBreakdown || DEFAULT_SCORE_BREAKDOWN);
      setActivePhase(savedSession.activePhase || inferNextPhase(savedSession.transcript));
      setSessionStarted(true);
      const lastUser = [...savedSession.transcript].reverse().find(m => m.sender === 'user');
      const lastOc = [...savedSession.transcript].reverse().find(m => m.sender === 'opposingCounsel');
      lastUserMessageRef.current = lastUser?.text || '';
      lastOcMessageRef.current = lastOc?.text || '';
      resetTimer();
      startTimer(savedSession.elapsedSeconds || 0);
      setGlobalLoading(false);
      return;
    }

    const initialMessagesList: ChatMessage[] = [
      {
        id: `oc-init-${Date.now()}`,
        sender: 'opposingCounsel',
        text: `${formatCounselName(currentSessionSettings.opposingCounselPersonality.name)} (${currentSessionSettings.opposingCounselPersonality.specialty}). I am prepared to rigorously examine your arguments, Counsel, under the scrutiny of ${currentSessionSettings.judgePersonality.name}. Expect no easy concessions.`,
        timestamp: new Date(),
        meta: { kind: 'system' },
      },
      {
        id: `judge-init-${Date.now()}`,
        sender: 'judge',
        text: `This Court is prepared to hear arguments in the matter of **${currentSessionSettings.caseDetail.title}**. Counsel (User), review the brief and begin when ready. Both your arguments and those of ${formatCounselName(currentSessionSettings.opposingCounselPersonality.name)} will be subject to thorough examination. You will have ${SESSION_DURATIONS_MINUTES[currentSessionSettings.sessionType]} minutes once the session begins.`,
        timestamp: new Date(),
        meta: { kind: 'system' },
      },
    ];

    const nextRecord: SessionRecord = {
      id: `session-${Date.now()}`,
      settings: settingsWithMode,
      transcript: initialMessagesList,
      startTime: new Date(),
      elapsedSeconds: 0,
      durationMinutes: 0,
      activePhase: 'opening',
      scoreBreakdown: DEFAULT_SCORE_BREAKDOWN,
      analysisStatus: { state: 'idle' },
    };

    currentSessionRecordRef.current = nextRecord;
    syncSessionRecord(initialMessagesList, DEFAULT_SCORE_BREAKDOWN, 'opening');

    if (voiceEnabledRef.current) {
      // Enqueue both opening statements so they play in sequence.
      initialMessagesList.forEach(m => speak(m.text, { queue: true }));
    }

    resetTimer();
    setSessionStarted(false);
    setGlobalLoading(false);
  }, [currentSessionSettings, practiceMode, navigate, setGlobalLoading, setGlobalError, setActiveChatJudge, setActiveChatOpposingCounsel, resetTimer, startTimer, syncSessionRecord]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isAiTyping]);

  const triggerAutoJudgeResponse = useCallback(async () => {
    if (sessionEnded || !isTimerRunning || !activeChatJudge || !currentSessionSettings) return;
    if (judgeStreamInFlightRef.current) return;
    judgeStreamInFlightRef.current = true;
    setIsAiTyping('judge');

    try {
      const contextForJudge = buildJudgePrompt(
        currentSessionSettings,
        latestMessagesRef.current,
        activePhase,
        lastUserMessageRef.current || 'The user is awaiting the Court\'s next direction.',
        lastOcMessageRef.current || 'Opposing counsel has not yet responded in this phase.',
        scoreBreakdown,
      );
      await streamAiResponse(activeChatJudge, contextForJudge, 'judge', { kind: 'question', phase: activePhase });
    } catch (e) {
      console.error('Error triggerAutoJudgeResponse:', e);
      setGlobalError(e instanceof Error ? e.message : 'The Court could not respond. Please try again.');
    } finally {
      setIsAiTyping(false);
      judgeStreamInFlightRef.current = false;
    }
  }, [sessionEnded, isTimerRunning, activeChatJudge, currentSessionSettings, activePhase, scoreBreakdown]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (objectionWindowActive) {
      interval = setInterval(() => {
        setObjectionWindowSecondsLeft(prev => {
          if (prev <= 0.1) {
            setObjectionWindowActive(false);
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
        const canObjectNow = messages.length > 0 && lastMessage && lastMessage.sender === 'opposingCounsel' && !isAiTyping && !sessionEnded && isTimerRunning;
        if (canObjectNow && !isInlineObjectionActive) {
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
      const canObjectNow = messages.length > 0 && lastMessage && lastMessage.sender === 'opposingCounsel' && !isAiTyping && !sessionEnded && isTimerRunning;
      if (canObjectNow && !isInlineObjectionActive) {
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
  }, [sessionEnded, isTimerRunning, currentSessionSettings, handleSessionEnd]);

  const streamAiResponse = async (
    chatInstance: Chat,
    textForAi: string,
    senderType: 'judge' | 'opposingCounsel',
    meta?: ChatMessage['meta'],
  ): Promise<string> => {
    let aiResponseText = '';
    const messageId = `${senderType}-${Date.now()}`;
    const placeholderMessage: ChatMessage = {
      id: messageId,
      sender: senderType,
      text: '...',
      timestamp: new Date(),
      meta,
    };

    const nextMessages = [...latestMessagesRef.current, placeholderMessage];
    syncSessionRecord(nextMessages, scoreBreakdown, activePhase);

    try {
      const stream = await sendMessageToChatStream(chatInstance, textForAi);
      if (!stream) {
        throw new Error('The AI service did not return a response stream.');
      }
      for await (const chunk of stream) {
        const chunkText = chunk.text || '';
        aiResponseText += chunkText;
        const updatedMessages = latestMessagesRef.current.map(msg =>
          msg.id === messageId ? { ...msg, text: aiResponseText } : msg,
        );
        syncSessionRecord(updatedMessages, scoreBreakdown, activePhase);
      }
      if (!aiResponseText.trim()) throw new Error('The AI service returned an empty response.');
    } catch (error) {
      console.error('streamAiResponse failed:', error);
      syncSessionRecord(
        latestMessagesRef.current.filter(message => message.id !== messageId),
        scoreBreakdown,
        activePhase,
      );
      throw new Error(error instanceof Error ? error.message : 'AI service unavailable.');
    }

    const finalizedMessages = latestMessagesRef.current.map(msg =>
      msg.id === messageId
        ? {
            ...msg,
            text: aiResponseText || 'No substantive response received.',
            timestamp: new Date(),
            meta,
          }
        : msg,
    );
    syncSessionRecord(finalizedMessages, scoreBreakdown, activePhase);

    if (voiceEnabledRef.current && (senderType === 'judge' || senderType === 'opposingCounsel')) {
      speak(aiResponseText, { rate: 1, pitch: senderType === 'judge' ? 0.9 : 1.05 });
    }
    return aiResponseText;
  };

  const handleObjectionSubmit = async () => {
    if (isAiTyping || sessionEnded || !activeChatJudge || !currentSessionSettings || !isTimerRunning) return;

    const isQuick = objectionWindowActive && objectionWindowSecondsLeft > 0;
    if (isQuick) {
      setQuickObjectionsCount(prev => prev + 1);
      setObjectionWindowActive(false);
    }

    const groundsText = {
      relevance: 'Irrelevant Arguments',
      facts: 'Mischaracterization of Facts',
      law: 'Misapplication of Precedent/Law',
      speculation: 'Speculation Without Evidence',
    }[objectionGrounds] || 'General Objection';

    const objectionId = `user-objection-${Date.now()}`;
    const objectionMeta: ChatMessage['meta'] = {
      kind: 'objection',
      phase: activePhase,
      objection: {
        grounds: groundsText,
        basis: objectionExplanation.trim(),
        outcome: 'reserved',
        wasQuick: isQuick,
      },
    };
    const userMessageText = `[OBJECTION] Grounds: ${groundsText}\nBasis: ${objectionExplanation.trim()}${isQuick ? ' (Quick Objection Reflex)' : ''}`;
    const userMessage: ChatMessage = {
      id: objectionId,
      sender: 'user',
      text: userMessageText,
      timestamp: new Date(),
      meta: objectionMeta,
    };

    const savedExplanation = objectionExplanation.trim();
    setIsInlineObjectionActive(false);
    setObjectionExplanation('');

    const objectionMessages = [...latestMessagesRef.current, userMessage];
    syncSessionRecord(objectionMessages, scoreBreakdown, activePhase);

    try {
      setIsAiTyping('judge');
      const contextForJudge = buildJudgePrompt(
        currentSessionSettings,
        objectionMessages,
        activePhase,
        savedExplanation ? `[OBJECTION] ${groundsText}: ${savedExplanation}` : `[OBJECTION] ${groundsText}`,
        lastOcMessageRef.current || 'Opposing counsel has not yet responded in this phase.',
        scoreBreakdown,
      ) + `\n\nRule specifically on the objection raised by counsel. State clearly whether it is sustained, overruled, or reserved, and explain why in under 100 words.`;

      const rulingText = await streamAiResponse(activeChatJudge, contextForJudge, 'judge', { kind: 'ruling', phase: activePhase });
      const outcome = detectObjectionOutcome(rulingText);
      const scored = scoreObjection(scoreBreakdown, outcome, isQuick);
      const finalMessages = latestMessagesRef.current.map(message =>
        message.id === objectionId
          ? {
              ...message,
              meta: {
                ...message.meta,
                scoreDelta: scored.scoreDelta,
                scoreReason: scored.scoreReason,
                objection: {
                  grounds: groundsText,
                  basis: savedExplanation,
                  outcome,
                  wasQuick: isQuick,
                },
              },
            }
          : message,
      );
      syncSessionRecord(finalMessages, scored.score, activePhase);
    } catch (error) {
      console.error('Error during Judge Objection ruling:', error);
      syncSessionRecord(latestMessagesRef.current.filter(message => message.id !== objectionId), scoreBreakdown, activePhase);
      setObjectionExplanation(savedExplanation);
      setGlobalError(error instanceof Error ? `The Court could not rule on this objection: ${error.message}` : 'The Court could not rule on this objection.');
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isAiTyping || !activeChatJudge || !activeChatOpposingCounsel || sessionEnded || !currentSessionSettings || !isTimerRunning) return;

    // An objection is a learner choice, not a typing-speed gate. Continuing an
    // argument simply closes the optional window and preserves the normal turn.
    if (objectionWindowActive) {
      setObjectionWindowActive(false);
    }

    if (voiceEnabledRef.current) cancelSpeech();

    const userMessageText = userInput.trim();
    lastUserMessageRef.current = userMessageText;

    const recentUserTexts = latestMessagesRef.current
      .filter(m => m.sender === 'user' && m.meta?.kind !== 'objection')
      .slice(-4)
      .map(m => m.text);
    const scored = scoreSubmission(scoreBreakdown, userMessageText, recentUserTexts);
    const nextPhase = inferNextPhase([...latestMessagesRef.current, {
      id: 'phase-probe',
      sender: 'user',
      text: userMessageText,
      timestamp: new Date(),
      meta: { kind: 'argument', phase: activePhase, argumentQuality: scored.assessment },
    }]);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userMessageText,
      timestamp: new Date(),
      meta: {
        kind: 'argument',
        phase: nextPhase,
        argumentQuality: scored.assessment,
      },
    };

    const submittedMessages = [...latestMessagesRef.current, userMessage];
    syncSessionRecord(submittedMessages, scored.score, nextPhase);
    setUserInput('');
    setAudioError(null);

    try {
      setIsAiTyping('opposingCounsel');
      const ocPrompt = buildOpposingCounselPrompt(
        currentSessionSettings,
        submittedMessages,
        nextPhase,
        userMessageText,
      );
      const ocResponseText = await streamAiResponse(activeChatOpposingCounsel, ocPrompt, 'opposingCounsel', { kind: 'response', phase: nextPhase });
      if (sessionEnded || !isTimerRunning) return;

      const scoredMessages = latestMessagesRef.current.map(message => message.id === userMessage.id
        ? { ...message, meta: { ...message.meta, scoreDelta: scored.scoreDelta, scoreReason: scored.scoreReason, argumentQuality: scored.assessment } }
        : message);
      syncSessionRecord(scoredMessages, scored.score, nextPhase);
      lastOcMessageRef.current = ocResponseText;
      if (!firstArgumentTrackedRef.current) {
        firstArgumentTrackedRef.current = true;
        trackEvent('first_argument_sent', {
          mode: currentSessionSettings.practiceMode,
          caseId: currentSessionSettings.caseDetail.id,
          sessionType: currentSessionSettings.sessionType,
        });
      }
      // Open objection window; judge auto-fires when window expires (see effect).
      setObjectionWindowActive(true);
      setObjectionWindowSecondsLeft(6.0);
    } catch (error) {
      console.error('Error during AI interaction:', error);
      syncSessionRecord(latestMessagesRef.current.filter(message => message.id !== userMessage.id), scoreBreakdown, activePhase);
      lastUserMessageRef.current = [...latestMessagesRef.current].reverse().find(message => message.sender === 'user')?.text || '';
      setUserInput(userMessageText);
      setGlobalError(error instanceof Error ? `Opposing Counsel could not respond: ${error.message}` : 'Opposing Counsel could not respond. Your draft has been restored.');
    } finally {
      setIsAiTyping(false);
    }
  };

  const beginSession = () => {
    if (sessionStarted || sessionEnded) return;
    setSessionStarted(true);
    startTimer();
    if (currentSessionSettings) {
      trackEvent('trial_timer_started', {
        mode: currentSessionSettings.practiceMode,
        caseId: currentSessionSettings.caseDetail.id,
        sessionType: currentSessionSettings.sessionType,
      });
    }
  };

  const lastMessage = messages[messages.length - 1];
  const canObject = messages.length > 0 && lastMessage && lastMessage.sender === 'opposingCounsel' && !isAiTyping && !sessionEnded && isTimerRunning;
  const sessionMeta = useMemo(() => ([
    { label: 'Phase', value: phaseLabel(activePhase), tone: 'text-brand-text-primary' },
    { label: 'Score', value: String(scoreBreakdown.total), tone: 'text-brand-text-primary' },
    { label: 'Timer', value: formattedTime, tone: remainingSeconds < 60 ? 'text-brand-error' : 'text-brand-text-primary' },
    { label: 'Reflex', value: String(quickObjectionsCount), tone: 'text-brand-text-primary' },
  ]), [activePhase, formattedTime, quickObjectionsCount, remainingSeconds, scoreBreakdown.total]);
  const mobileQuickActions = useMemo(() => ([
    {
      label: 'Bench',
      hint: 'Case brief',
      onClick: () => setIsMobileDrawerOpen(true),
      disabled: false,
      tone: 'border-brand-text-primary/15 text-brand-text-primary hover:border-brand-accent/40 hover:text-brand-accent',
    },
    {
      label: 'Objection',
      hint: canObject ? 'Ready now' : 'Wait turn',
      onClick: () => setIsInlineObjectionActive(true),
      disabled: !canObject,
      tone: canObject
        ? `${catColors.border} ${catColors.text} hover:${catColors.bgMuted}`
        : 'border-brand-text-primary/10 text-brand-text-secondary/40',
    },
    {
      label: 'End',
      hint: 'Analyze',
      onClick: () => { if (currentSessionSettings) handleSessionEnd(true, true); },
      disabled: sessionEnded || !isTimerRunning,
      tone: 'border-brand-error/30 text-brand-error hover:bg-brand-error/10',
    },
  ]), [canObject, catColors.bgMuted, catColors.border, catColors.text, currentSessionSettings, handleSessionEnd, isTimerRunning, sessionEnded]);

  const renderBenchCompanion = () => {
    if (!currentSessionSettings) return null;

    return (
      <div className="space-y-6 text-brand-text-secondary text-left">
        <div className="space-y-3">
          <h4 className={`text-xs uppercase font-mono tracking-widest ${catColors.text} border-b border-brand-text-primary/15 pb-1 flex items-center`}>
            <BriefcaseIcon className={`h-4 w-4 mr-1.5 ${catColors.text}`} /> Active Case Brief
          </h4>
          <div className="bg-brand-bg-secondary/60 border border-brand-border rounded-xl p-4 space-y-3 shadow-card hover:shadow-[0_4px_20px_rgba(214,186,145,0.06)] hover:border-brand-accent/30 transition-all duration-500 group">
            <h5 className="text-sm font-semibold text-brand-text-primary font-serif">{currentSessionSettings.caseDetail.title}</h5>
            <div className="text-xs text-brand-text-secondary font-light space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1 group-hover:text-brand-text-primary transition-colors duration-300">
              <p className="font-semibold text-brand-text-primary flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-pulse" />
                Brief Facts:
              </p>
              <p className="leading-relaxed font-light pl-2.5 border-l border-brand-border group-hover:border-brand-accent/30 transition-colors duration-300">{currentSessionSettings.caseDetail.briefFacts}</p>
            </div>
            <div className="text-xs text-brand-text-secondary font-light space-y-1.5 pt-2.5 border-t border-brand-border">
              <p className="font-semibold text-brand-text-primary">Relevant Law / Precedents:</p>
              <p className={`font-mono text-[10px] ${catColors.text} leading-relaxed`}>{currentSessionSettings.caseDetail.relevantArticlesSections}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className={`text-xs uppercase font-mono tracking-widest ${catColors.text} border-b border-brand-text-primary/15 pb-1 flex items-center`}>
            <svg className={`h-4 w-4 mr-1.5 ${catColors.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Live Trial Standing
          </h4>
          <div className="bg-brand-bg-secondary/60 border border-brand-text-primary/15 rounded-xl p-4 grid grid-cols-2 gap-4 shadow-card">
            <div>
              <p className="text-[9px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">Court Score</p>
              <p className={`text-2xl font-mono ${catColors.text} font-bold mt-1`}>{scoreBreakdown.total}</p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">Quick Reflexes</p>
              <p className={`text-2xl font-mono ${catColors.text} font-bold mt-1`}>{quickObjectionsCount}</p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">Phase</p>
              <p className={`text-sm uppercase ${catColors.text} font-semibold mt-2 tracking-wider`}>{phaseLabel(activePhase)}</p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">Momentum</p>
              <p className={`text-sm uppercase ${catColors.text} font-semibold mt-2 tracking-wider`}>{PHASE_SEQUENCE.indexOf(activePhase) + 1} / {PHASE_SEQUENCE.length}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className={`text-xs uppercase font-mono tracking-widest ${catColors.text} border-b border-brand-text-primary/15 pb-1 flex items-center`}>
            <CourtIcon className={`h-4 w-4 mr-1.5 ${catColors.text}`} /> Strategic Bench Profile
          </h4>
          <div className="bg-brand-bg-secondary/60 border border-brand-text-primary/15 rounded-xl p-4 space-y-4 shadow-card">
            <div className="flex items-start space-x-3">
              <div className={`h-8 w-8 rounded-lg bg-brand-bg-tertiary border border-brand-text-primary/15 flex items-center justify-center flex-shrink-0 ${catColors.text} font-bold text-xs`}>
                J
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-brand-text-primary">{currentSessionSettings.judgePersonality.name}</p>
                <p className="text-[10px] text-brand-text-secondary leading-relaxed font-light">{currentSessionSettings.judgePersonality.description}</p>
              </div>
            </div>
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
      <BackgroundGeometry />

      <div className="px-3 py-2.5 sm:px-4 sm:py-3 bg-brand-bg-secondary border-b border-brand-border sticky top-0 z-20 flex-shrink-0">
        <div className="max-w-7xl mx-auto space-y-2.5">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="text-left min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1 text-[11px] text-brand-text-secondary">
                <span>{currentSessionSettings.difficulty}</span>
                <span className="opacity-40">·</span>
                <span>{currentSessionSettings.sessionType}</span>
              </div>
              <h2 className="text-[15px] sm:text-lg font-semibold truncate text-brand-text-primary leading-snug" title={currentSessionSettings.caseDetail.title}>{currentSessionSettings.caseDetail.title}</h2>
              <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12px] text-brand-text-secondary mt-1">
                <span className="flex items-center gap-1"><GavelIcon className="h-3.5 w-3.5 opacity-60" /> {currentSessionSettings.judgePersonality.name}</span>
                <span className="flex items-center gap-1"><BriefcaseIcon className="h-3.5 w-3.5 opacity-60" /> {currentSessionSettings.opposingCounselPersonality.name}</span>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              {isTTSAvailable() && (
                <button
                  onClick={() => setVoiceEnabled(v => !v)}
                  className={`h-9 px-3 rounded-md border text-[12px] transition-colors ${
                    voiceEnabled
                      ? 'bg-brand-text-primary text-brand-bg-primary border-transparent'
                      : 'border-brand-border text-brand-text-secondary hover:text-brand-text-primary'
                  }`}
                  title={voiceEnabled ? 'Mute courtroom voice' : 'Enable courtroom voice'}
                >
                  {voiceEnabled ? 'Voice on' : 'Voice off'}
                </button>
              )}
              {!sessionEnded && isTimerRunning && (
                <button
                  onClick={() => { if (currentSessionSettings) handleSessionEnd(true, true); }}
                  className="h-9 px-3 rounded-md border border-brand-error/40 text-brand-error text-[12px] hover:bg-brand-error/10 transition-colors"
                  title="End Trial Early"
                >
                  End early
                </button>
              )}
            </div>
          </div>

          <SessionChipRow items={sessionMeta} className="hidden sm:grid" />

          <div className="sm:hidden space-y-2">
            <SessionChipRow items={sessionMeta} />
            <div className="grid grid-cols-3 gap-2">
              {mobileQuickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={`rounded-xl border px-2.5 py-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 min-h-[48px] ${action.tone}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide">{action.label}</p>
                  <p className="mt-0.5 text-[9px] font-mono uppercase tracking-[0.14em] text-brand-text-secondary/55">{action.hint}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-grow overflow-hidden relative z-10 w-full">
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
                      <div className="max-w-[92%] sm:max-w-[85%] ml-[1rem] sm:ml-[5.5rem] mb-4 sm:mb-6 -mt-2 sm:-mt-3 animate-fadeIn text-left">
                        <div className="bg-brand-bg-secondary/70 border border-brand-text-primary/15 rounded-xl p-3.5 sm:p-4 flex flex-col space-y-2 shadow-card">
                          <div className={`flex flex-col gap-1.5 sm:flex-row sm:justify-between sm:items-center text-[10px] font-mono uppercase tracking-wider ${catColors.text}`}>
                            <span className="font-semibold flex items-center">
                              <svg className={`w-3.5 h-3.5 mr-1 ${catColors.text} animate-pulse`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                              Optional objection window
                            </span>
                            <span className="font-bold">{objectionWindowSecondsLeft}s remaining</span>
                          </div>
                          <div className="w-full bg-brand-bg-tertiary h-1.5 rounded-full overflow-hidden border border-brand-text-primary/15">
                            <div
                              className={`${catColors.bg} h-full transition-all duration-100 ease-linear rounded-full`}
                              style={{ width: `${(objectionWindowSecondsLeft / 6.0) * 100}%` }}
                            ></div>
                          </div>
                          <div className="flex flex-col gap-1 text-[9px] font-mono text-brand-text-secondary/70 sm:flex-row sm:justify-between sm:items-center">
                            <span>{'Raise an objection or continue with your next submission.'}</span>
                            <span className={`${catColors.text} font-semibold`}>[ OPTIONAL SPEED BONUS ]</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!sessionStarted && !sessionEnded && (
                <div className="mx-auto my-6 max-w-2xl rounded-xl border border-brand-accent/30 bg-brand-bg-secondary/80 p-5 text-center shadow-card">
                  <p className="text-sm font-semibold text-brand-text-primary">Review the case brief before the clock starts.</p>
                  <p className="mt-1 text-xs leading-relaxed text-brand-text-secondary">You will have {SESSION_DURATIONS_MINUTES[currentSessionSettings.sessionType]} minutes once you begin. The timer is paused until then.</p>
                  <Button onClick={beginSession} size="md" variant="primary" className="mt-4 px-5">Begin session</Button>
                </div>
              )}
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
                        {isTranscribing ? 'Listening and transcribing your voice' : (isAiTyping === 'judge' ? 'The Court is considering your argument' : 'Opposing Counsel is formulating a response')}
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
          {!sessionEnded && (
            <div className="p-3 sm:p-6 bg-brand-bg-primary border-t border-brand-text-primary/15 z-20 relative flex-shrink-0">
              <div className="max-w-4xl mx-auto">
                {audioError && (
                  <div className="p-2.5 mb-3 bg-brand-error/10 border border-brand-error/25 text-brand-error text-[11px] rounded-xl text-left animate-fadeIn flex items-start justify-between gap-3">
                    <span className="leading-relaxed">{audioError}</span>
                    <button
                      type="button"
                      onClick={() => setAudioError(null)}
                      className="flex-shrink-0 text-[10px] font-mono uppercase tracking-wider opacity-70 hover:opacity-100"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="sm:hidden mb-3 rounded-2xl border border-brand-text-primary/15 bg-brand-bg-secondary/55 px-3.5 py-3 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary/60">Session controls</p>
                      <p className={`mt-1 text-xs font-semibold ${canObject ? catColors.text : 'text-brand-text-primary'}`}>
                        {canObject ? 'Opposing Counsel has opened an objection window.' : isInlineObjectionActive ? 'Drafting formal objection.' : 'Transcript stays primary. Bench tools remain one tap away.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isTTSAvailable() && (
                        <button
                          type="button"
                          onClick={() => setVoiceEnabled(v => !v)}
                          className={`rounded-xl border px-3 py-2 text-[10px] font-mono uppercase tracking-wider transition-all ${
                            voiceEnabled
                              ? `${catColors.bg} text-brand-accent-text border-transparent`
                              : 'border-brand-text-primary/15 bg-brand-bg-tertiary/45 text-brand-text-primary hover:border-brand-accent/40 hover:text-brand-accent'
                          }`}
                          title={voiceEnabled ? 'Mute courtroom voice' : 'Enable courtroom voice'}
                        >
                          {voiceEnabled ? 'Voice On' : 'Voice Off'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsMobileDrawerOpen(true)}
                        className="rounded-xl border border-brand-text-primary/15 bg-brand-bg-tertiary/45 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-brand-text-primary transition-all hover:border-brand-accent/40 hover:text-brand-accent"
                      >
                        Open Bench
                      </button>
                    </div>
                  </div>
                </div>

                {canObject && !isInlineObjectionActive && (
                  <div className="flex justify-center mb-3 animate-fadeInUp">
                    <button
                      type="button"
                      onClick={() => setIsInlineObjectionActive(true)}
                      className={`w-full sm:w-auto px-4 py-2.5 rounded-2xl border border-brand-text-primary/15 bg-brand-bg-secondary/60 hover:${catColors.bg} hover:text-brand-accent-text hover:border-transparent ${catColors.text} text-[10px] font-bold font-mono uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 shadow-card`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Objection! Raise Objection</span>
                      <span className="bg-brand-bg-tertiary text-brand-text-secondary px-1.5 py-0.5 rounded text-[8px] font-mono hidden sm:inline">Press [ O ]</span>
                    </button>
                  </div>
                )}

                {isInlineObjectionActive && (
                  <div className="flex flex-col space-y-2.5 p-3.5 sm:p-4 bg-brand-bg-secondary/70 border border-brand-text-primary/15 rounded-2xl mb-3 text-left animate-fadeIn shadow-card">
                    <div className="flex items-center justify-between gap-3">
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
                          className={`px-3 py-2 rounded-xl border text-xs font-mono transition-all text-center flex flex-col items-center justify-center min-h-[58px]
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

                <div className={`max-w-3xl mx-auto rounded-2xl border transition-all px-3 py-2 sm:py-2.5 shadow-card ${isInlineObjectionActive ? 'bg-brand-bg-secondary/75 border-brand-accent/30' : 'bg-brand-bg-secondary/50 border-brand-text-primary/20 focus-within:border-brand-accent focus-within:shadow-glow-accent-sm'}`}>
                  <div className="flex items-end gap-2.5">
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={!!isAiTyping || sessionEnded || !isTimerRunning}
                      className={`w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 rounded-xl flex items-center justify-center transition-all focus:outline-none disabled:opacity-40
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

                    <div className="flex-grow min-w-0">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary/60">
                          {isInlineObjectionActive ? 'Objection draft' : 'Live submission'}
                        </p>
                        <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-brand-text-secondary/50 hidden sm:block">
                          Enter to send, Shift+Enter for new line
                        </p>
                      </div>
                      <textarea
                        value={isInlineObjectionActive ? objectionExplanation : userInput}
                        onChange={(e) => isInlineObjectionActive ? setObjectionExplanation(e.target.value) : setUserInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            isInlineObjectionActive ? handleObjectionSubmit() : handleSendMessage();
                          }
                        }}
                        placeholder={isInlineObjectionActive ? 'State the legal basis for the objection in one concise sentence...' : 'Address the Court...'}
                        className="w-full bg-transparent text-brand-text-primary placeholder-brand-text-secondary/50 text-sm resize-none focus:outline-none min-h-[44px] max-h-[140px] py-2 custom-scrollbar font-light"
                        rows={1}
                        disabled={!!isAiTyping || sessionEnded || !isTimerRunning}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={isInlineObjectionActive ? handleObjectionSubmit : handleSendMessage}
                      disabled={!!isAiTyping || (isInlineObjectionActive ? !objectionExplanation.trim() : !userInput.trim()) || sessionEnded || !isTimerRunning}
                      className={`w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 rounded-full flex items-center justify-center transition-all focus:outline-none
                        ${(isInlineObjectionActive ? objectionExplanation.trim() : userInput.trim()) && !isAiTyping && isTimerRunning
                          ? `${catColors.bg} text-brand-accent-text hover:brightness-110`
                          : 'bg-brand-bg-tertiary text-brand-text-secondary/50 border border-brand-text-primary/15 cursor-not-allowed'
                        }`}
                      title={isInlineObjectionActive ? 'Submit Objection' : 'Send Statement'}
                    >
                      <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5 transform rotate-90" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <p className="text-center mt-3 text-[10px] font-mono text-zinc-500 tracking-widest uppercase hidden sm:block select-none">
                  Present your arguments clearly and concisely. The Court is listening.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="lg:w-[380px] xl:w-[420px] w-full lg:flex hidden flex-col border-l border-zinc-900/60 bg-[#0a0a0a] overflow-y-auto custom-scrollbar p-6 space-y-6 flex-shrink-0 h-full relative z-20">
          {renderBenchCompanion()}
        </div>
      </div>

      {isMobileDrawerOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-[#000000]/80 z-40 transition-opacity duration-300"
          onClick={() => setIsMobileDrawerOpen(false)}
        />
      )}
      
      <div className={`lg:hidden fixed bottom-0 left-0 right-0 bg-[#0d0d0d] border-t border-zinc-800/80 rounded-t-2xl z-50 transform transition-transform duration-300 overflow-y-auto custom-scrollbar px-4 py-5 sm:p-6 space-y-5 shadow-none ${isMobileDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`} style={{ maxHeight: `${Math.max(320, viewportHeight - 16)}px` }}>
        <div className="flex justify-between items-center pb-3 border-b border-zinc-900/60">
          <div>
            <h3 className={`text-lg font-bold font-serif ${catColors.text} flex items-center`}><CourtIcon className={`h-5 w-5 mr-2 ${catColors.text}`} /> Bench Companion</h3>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary/55">Case brief, score, and objection controls</p>
          </div>
          <button onClick={() => setIsMobileDrawerOpen(false)} className="text-zinc-500 hover:text-zinc-400 text-sm font-mono p-1">Close</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-brand-text-primary/15 bg-brand-bg-secondary/40 px-3 py-2.5">
            <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary/60">Score</p>
            <p className={`mt-1 text-base font-semibold ${catColors.text}`}>{scoreBreakdown.total}</p>
          </div>
          <div className="rounded-xl border border-brand-text-primary/15 bg-brand-bg-secondary/40 px-3 py-2.5">
            <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary/60">Phase</p>
            <p className={`mt-1 text-base font-semibold uppercase ${catColors.text}`}>{phaseLabel(activePhase)}</p>
          </div>
        </div>
        {renderBenchCompanion()}
      </div>
    </div>
  );
};

export default PracticeArena;
