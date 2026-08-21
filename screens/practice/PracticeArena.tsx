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
import {
  speak,
  cancelSpeech,
  isTTSAvailable,
  isMicSupported,
  preferredRecordingMimeType,
  transcribeAudio,
  probeVoiceAvailability,
  humanizeVoiceError,
  VoiceError,
  type VoiceCapability,
} from '../../services/voiceService';
import { SESSION_DURATIONS_MINUTES } from '../../constants';
import { ROUTES } from '../../routes';
import { useTimer } from '../../hooks/useTimer';
import { BriefcaseIcon, CourtIcon, GavelIcon } from '../../components/icons';
import { getCategoryColorClasses } from '../../services/colorUtils';
import { useVisualViewport } from '../../hooks/useVisualViewport';
import { trackEvent } from '../../services/analyticsService';
import {
  DEFAULT_SCORE_BREAKDOWN,
  SCORE_DIMENSION_LABELS,
  detectObjectionOutcome,
  inferNextPhase,
  phaseLabel,
  scoreObjection,
  scoreSubmission,
} from '../../services/trialScoring';
import { SessionChipRow } from '../../components/SessionChip';

const PHASE_SEQUENCE: TrialPhase[] = ['opening', 'issue_framing', 'rebuttal', 'judicial_questions', 'closing'];
const OBJECTION_WINDOW_SECONDS = 6;
/** Soft ceiling so a hung /api/chat stream cannot leave the composer locked forever. */
const AI_STREAM_TIMEOUT_MS = 90_000;
const formatCounselName = (name: string) => /^(adv\.?|advocate)\s/i.test(name.trim()) ? name : `Advocate ${name}`;
const phaseIndex = (phase: TrialPhase) => {
  const idx = PHASE_SEQUENCE.indexOf(phase);
  return idx < 0 ? 0 : idx;
};
/** Never regress phase mid-hearing; quality gates may only advance. */
const resolveForwardPhase = (current: TrialPhase, inferred: TrialPhase): TrialPhase =>
  phaseIndex(inferred) >= phaseIndex(current) ? inferred : current;
const humanizeAiError = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
};

const PracticeArena: React.FC = () => {
  const navigate = useNavigate();
  const { vpHeight, viewportHeight, isMobile } = useVisualViewport({ breakpoint: 768, mobileOffset: 0, desktopOffset: 0 });
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
  const [hearingNotice, setHearingNotice] = useState<string | null>(null);
  /** When set, the notice offers a one-tap Court retry after a failed auto-judge call. */
  const [pendingJudgeRetry, setPendingJudgeRetry] = useState(false);
  const [voiceCap, setVoiceCap] = useState<VoiceCapability | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ocStreamInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const streamAiResponseRef = useRef<
    (
      chatInstance: Chat,
      textForAi: string,
      senderType: 'judge' | 'opposingCounsel',
      meta?: ChatMessage['meta'],
    ) => Promise<string>
  >(async () => '');

  // Text-to-speech toggle — the bench speaks its replies aloud.
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('lexforge.voiceEnabled') === 'true'; } catch { return false; }
  });
  const voiceEnabledRef = useRef(voiceEnabled);
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
    try { localStorage.setItem('lexforge.voiceEnabled', voiceEnabled ? 'true' : 'false'); } catch { /* ignore */ }
  }, [voiceEnabled]);

  // Probe Sarvam availability so mic can degrade gracefully without a failed record cycle.
  useEffect(() => {
    let cancelled = false;
    if (!isMicSupported()) {
      setVoiceCap({
        configured: false,
        available: false,
        features: { stt: false, tts: false, browserTtsFallback: isTTSAvailable() },
        message: 'This browser does not support microphone recording.',
      });
      return;
    }
    probeVoiceAvailability()
      .then((cap) => { if (!cancelled) setVoiceCap(cap); })
      .catch(() => { /* keep null → optimistic UI */ });
    return () => {
      cancelled = true;
      // Release any orphaned mic stream if the arena unmounts mid-record.
      try {
        mediaRecorderRef.current?.state !== 'inactive' && mediaRecorderRef.current?.stop();
      } catch { /* ignore */ }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      cancelSpeech();
    };
  }, []);

  // Refs to avoid stale closures (B3: live transcript, B7: judge double-fire)
  const latestMessagesRef = useRef<ChatMessage[]>(messages);
  const judgeStreamInFlightRef = useRef<boolean>(false);
  const activePhaseRef = useRef(activePhase);
  const scoreBreakdownRef = useRef(scoreBreakdown);
  const isInlineObjectionActiveRef = useRef(isInlineObjectionActive);
  const sessionEndedRef = useRef(sessionEnded);
  const isAiTypingRef = useRef(isAiTyping);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);
  useEffect(() => { activePhaseRef.current = activePhase; }, [activePhase]);
  useEffect(() => { scoreBreakdownRef.current = scoreBreakdown; }, [scoreBreakdown]);
  useEffect(() => { isInlineObjectionActiveRef.current = isInlineObjectionActive; }, [isInlineObjectionActive]);
  useEffect(() => { sessionEndedRef.current = sessionEnded; }, [sessionEnded]);
  useEffect(() => { isAiTypingRef.current = isAiTyping; }, [isAiTyping]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
        streamTimeoutRef.current = null;
      }
      try { streamAbortRef.current?.abort(); } catch { /* ignore */ }
      streamAbortRef.current = null;
      judgeStreamInFlightRef.current = false;
      ocStreamInFlightRef.current = false;
    };
  }, []);

  // Lock background scroll while the mobile bench drawer is open.
  useEffect(() => {
    if (!isMobileDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobileDrawerOpen]);

  const clearStreamWatchdog = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
  }, []);

  const abortActiveStream = useCallback((reason?: string) => {
    clearStreamWatchdog();
    try { streamAbortRef.current?.abort(); } catch { /* ignore */ }
    streamAbortRef.current = null;
    judgeStreamInFlightRef.current = false;
    ocStreamInFlightRef.current = false;
    isAiTypingRef.current = false;
    if (mountedRef.current) {
      setIsAiTyping(false);
      if (reason) setHearingNotice(reason);
    }
  }, [clearStreamWatchdog]);

  const beginStreamWatchdog = useCallback((label: string) => {
    clearStreamWatchdog();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    streamTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      try { controller.abort(); } catch { /* ignore */ }
      judgeStreamInFlightRef.current = false;
      ocStreamInFlightRef.current = false;
      isAiTypingRef.current = false;
      setIsAiTyping(false);
      setHearingNotice(`${label} timed out. Your hearing and draft are preserved. Retry when ready.`);
      setGlobalError(`${label} timed out. Retry your last action.`);
    }, AI_STREAM_TIMEOUT_MS);
    return controller;
  }, [clearStreamWatchdog, setGlobalError]);

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

  const sttDisabledReason = useMemo(() => {
    if (!isMicSupported()) return 'Microphone recording is not supported in this browser. Type your argument instead.';
    if (voiceCap && !voiceCap.available && !voiceCap.probeFailed) {
      return voiceCap.message
        || 'Voice transcription is unavailable (SARVAM_API_KEY not configured). You can still type.';
    }
    return null;
  }, [voiceCap]);

  const startRecording = async () => {
    setAudioError(null);
    audioChunksRef.current = [];

    if (sttDisabledReason) {
      setAudioError(sttDisabledReason);
      return;
    }
    if (!isMicSupported()) {
      setAudioError('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const preferredMime = preferredRecordingMimeType();
      const mediaRecorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setIsRecording(false);
        setAudioError('Recording failed. Check microphone permissions and try again.');
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        const mimeType = (mediaRecorder.mimeType || preferredMime || 'audio/webm').split(';')[0] || 'audio/webm';
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        if (!chunks.length) {
          setAudioError('No audio captured. Check the microphone and try again.');
          return;
        }
        const audioBlob = new Blob(chunks, { type: mimeType });
        await handleSTT(audioBlob);
      };

      // timeslice keeps chunks flowing on browsers that buffer until stop
      mediaRecorder.start(250);
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setAudioError('Microphone permission denied. Allow mic access in the browser, or type your argument.');
      } else if (name === 'NotFoundError') {
        setAudioError('No microphone found. Plug in a mic or type your argument.');
      } else {
        setAudioError('Microphone access is required for voice input.');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    }
    setIsRecording(false);
  };

  const handleSTT = async (blob: Blob) => {
    setIsTranscribing(true);
    setAudioError(null);
    try {
      const text = await transcribeAudio(blob, {
        // Server aliases en-US → en-IN; keep intent explicit for international mode.
        language: practiceMode === 'international' ? 'en-US' : 'en-IN',
      });
      setUserInput(prev => (prev ? `${prev} ${text}` : text));
    } catch (err) {
      console.error('Transcription error:', err);
      if (err instanceof VoiceError && err.code === 'MISSING_API_KEY') {
        setVoiceCap({
          configured: false,
          available: false,
          features: { stt: false, tts: false, browserTtsFallback: isTTSAvailable() },
          message: err.message,
        });
      }
      setAudioError(humanizeVoiceError(err));
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
    setPendingJudgeRetry(false);
    setObjectionWindowActive(false);
    setIsInlineObjectionActive(false);
    abortActiveStream();
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
      try {
        const analysis = await analyzeSessionPerformance(finalRecord, scoreBreakdown);
        finalRecord = finalizeSessionRecord(
          finalRecord,
          { state: 'ready', source: analysis.source },
          analysis.metrics,
        );
      } catch {
        // analyzeSessionPerformance is designed not to throw; keep a safe unavailable path.
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
  }, [sessionEnded, currentSessionSettings, remainingSeconds, activePhase, scoreBreakdown, navigate, setCurrentSessionSettings, setActiveChatJudge, setActiveChatOpposingCounsel, pauseTimer, setGlobalLoading, setGlobalError, finalizeSessionRecord, sessionDurationSeconds, abortActiveStream]);

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
      const restoredTranscript = savedSession.transcript.filter((message) => !(
        (message.sender === 'system' || message.meta?.kind === 'system')
        && /^(error|network error|not found|ai service error)\b/i.test(message.text.trim())
      ));
      currentSessionRecordRef.current = {
        ...savedSession,
        settings: settingsWithMode,
        transcript: restoredTranscript,
      };
      setMessages(restoredTranscript);
      setScoreBreakdown(savedSession.scoreBreakdown || DEFAULT_SCORE_BREAKDOWN);
      setActivePhase(savedSession.activePhase || inferNextPhase(restoredTranscript));
      setSessionStarted(true);
      const lastUser = [...restoredTranscript].reverse().find(m => m.sender === 'user');
      const lastOc = [...restoredTranscript].reverse().find(m => m.sender === 'opposingCounsel');
      lastUserMessageRef.current = lastUser?.text || '';
      lastOcMessageRef.current = lastOc?.text || '';
      if (restoredTranscript.length !== savedSession.transcript.length) {
        setHearingNotice('A prior connection error was removed from the transcript. Your hearing and draft were restored.');
      }
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
    if (sessionEndedRef.current || !isTimerRunning || !activeChatJudge || !currentSessionSettings) return;
    // Do not interrupt an open objection draft; the cancel/submit paths resume the Court.
    if (isInlineObjectionActiveRef.current) return;
    if (judgeStreamInFlightRef.current || ocStreamInFlightRef.current) return;
    if (isAiTypingRef.current) return;
    judgeStreamInFlightRef.current = true;
    isAiTypingRef.current = 'judge';
    setPendingJudgeRetry(false);
    setIsAiTyping('judge');
    const phaseNow = activePhaseRef.current;
    const scoreNow = scoreBreakdownRef.current;

    try {
      const contextForJudge = buildJudgePrompt(
        currentSessionSettings,
        latestMessagesRef.current,
        phaseNow,
        lastUserMessageRef.current || 'The user is awaiting the Court\'s next direction.',
        lastOcMessageRef.current || 'Opposing counsel has not yet responded in this phase.',
        scoreNow,
      );
      await streamAiResponseRef.current(activeChatJudge, contextForJudge, 'judge', { kind: 'question', phase: phaseNow });
      setPendingJudgeRetry(false);
    } catch (e) {
      console.error('Error triggerAutoJudgeResponse:', e);
      if (!mountedRef.current || sessionEndedRef.current) return;
      setPendingJudgeRetry(true);
      setHearingNotice('The Court could not respond. Your hearing is preserved. Retry the Court direction, or continue with your next submission.');
      setGlobalError(humanizeAiError(e, 'The Court could not respond. Please try again.'));
    } finally {
      judgeStreamInFlightRef.current = false;
      isAiTypingRef.current = false;
      if (mountedRef.current) setIsAiTyping(false);
    }
  }, [isTimerRunning, activeChatJudge, currentSessionSettings, setGlobalError]);

  useEffect(() => {
    // Pause the optional window while the learner is drafting an objection so the
    // Court does not speak over an unfinished formal challenge.
    if (!objectionWindowActive || isInlineObjectionActive || sessionEnded || !isTimerRunning) {
      return;
    }
    let fired = false;
    const interval = setInterval(() => {
      setObjectionWindowSecondsLeft(prev => {
        if (prev <= 0.1) {
          if (!fired) {
            fired = true;
            setObjectionWindowActive(false);
            // Defer out of the setState updater to avoid nested state updates.
            queueMicrotask(() => {
              if (!isInlineObjectionActiveRef.current && !sessionEndedRef.current) {
                void triggerAutoJudgeResponse();
              }
            });
          }
          return 0;
        }
        return Number((prev - 0.1).toFixed(1));
      });
    }, 100);
    return () => clearInterval(interval);
  }, [objectionWindowActive, isInlineObjectionActive, sessionEnded, isTimerRunning, triggerAutoJudgeResponse]);

  // If the Court already spoke while an objection form was open, close the stale draft.
  useEffect(() => {
    if (!isInlineObjectionActive || sessionEnded) return;
    const last = messages[messages.length - 1];
    if (last && last.sender !== 'opposingCounsel' && last.meta?.kind !== 'objection') {
      setIsInlineObjectionActive(false);
      setHearingNotice('The Court has moved on. Re-open Objection after Opposing Counsel speaks, if needed.');
    }
  }, [messages, isInlineObjectionActive, sessionEnded]);

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
          isInlineObjectionActiveRef.current = true;
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
        isInlineObjectionActiveRef.current = true;
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

  const streamAiResponse = useCallback(async (
    chatInstance: Chat,
    textForAi: string,
    senderType: 'judge' | 'opposingCounsel',
    meta?: ChatMessage['meta'],
  ): Promise<string> => {
    let aiResponseText = '';
    const messageId = `${senderType}-${Date.now()}`;
    const scoreSnapshot = scoreBreakdownRef.current;
    const phaseSnapshot = activePhaseRef.current;
    const placeholderMessage: ChatMessage = {
      id: messageId,
      sender: senderType,
      text: '...',
      timestamp: new Date(),
      meta,
    };

    const nextMessages = [...latestMessagesRef.current, placeholderMessage];
    syncSessionRecord(nextMessages, scoreSnapshot, phaseSnapshot);

    const controller = beginStreamWatchdog(senderType === 'judge' ? 'The Court' : 'Opposing Counsel');

    try {
      const stream = await sendMessageToChatStream(chatInstance, textForAi, { signal: controller.signal });
      if (!stream) {
        throw new Error('The AI service did not return a response stream.');
      }
      for await (const chunk of stream) {
        if (controller.signal.aborted || sessionEndedRef.current || !mountedRef.current) {
          throw new Error('The AI request was cancelled. Your work is preserved; retry when ready.');
        }
        const chunkText = chunk.text || '';
        aiResponseText += chunkText;
        const updatedMessages = latestMessagesRef.current.map(msg =>
          msg.id === messageId ? { ...msg, text: aiResponseText } : msg,
        );
        syncSessionRecord(updatedMessages, scoreBreakdownRef.current, activePhaseRef.current);
      }
      if (!aiResponseText.trim()) throw new Error('The AI service returned an empty response.');
    } catch (error) {
      console.error('streamAiResponse failed:', error);
      syncSessionRecord(
        latestMessagesRef.current.filter(message => message.id !== messageId),
        scoreBreakdownRef.current,
        activePhaseRef.current,
      );
      throw new Error(humanizeAiError(error, 'AI service unavailable.'));
    } finally {
      clearStreamWatchdog();
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
    }

    if (sessionEndedRef.current || !mountedRef.current) {
      return aiResponseText;
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
    syncSessionRecord(finalizedMessages, scoreBreakdownRef.current, activePhaseRef.current);

    if (voiceEnabledRef.current && (senderType === 'judge' || senderType === 'opposingCounsel')) {
      speak(aiResponseText, { rate: 1, pitch: senderType === 'judge' ? 0.9 : 1.05 });
    }
    return aiResponseText;
  }, [beginStreamWatchdog, clearStreamWatchdog, syncSessionRecord]);

  useEffect(() => { streamAiResponseRef.current = streamAiResponse; }, [streamAiResponse]);

  const handleObjectionSubmit = async () => {
    if (isAiTyping || sessionEnded || !activeChatJudge || !currentSessionSettings || !isTimerRunning) return;
    if (judgeStreamInFlightRef.current || ocStreamInFlightRef.current) return;
    if (!objectionExplanation.trim()) return;

    const phaseAtStart = activePhaseRef.current;
    const scoreAtStart = scoreBreakdownRef.current;
    const isQuick = objectionWindowActive && objectionWindowSecondsLeft > 0;
    // Closing the window claims the turn: Court rules on the objection instead of free direction.
    setObjectionWindowActive(false);
    setPendingJudgeRetry(false);
    if (isQuick) {
      setQuickObjectionsCount(prev => prev + 1);
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
      phase: phaseAtStart,
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
    const savedGrounds = objectionGrounds;
    setIsInlineObjectionActive(false);
    setObjectionExplanation('');
    setHearingNotice(null);

    const objectionMessages = [...latestMessagesRef.current, userMessage];
    syncSessionRecord(objectionMessages, scoreAtStart, phaseAtStart);

    judgeStreamInFlightRef.current = true;
    isAiTypingRef.current = 'judge';
    try {
      setIsAiTyping('judge');
      const contextForJudge = buildJudgePrompt(
        currentSessionSettings,
        objectionMessages,
        phaseAtStart,
        savedExplanation ? `[OBJECTION] ${groundsText}: ${savedExplanation}` : `[OBJECTION] ${groundsText}`,
        lastOcMessageRef.current || 'Opposing counsel has not yet responded in this phase.',
        scoreAtStart,
      ) + `\n\nRule specifically on the objection raised by counsel. State clearly whether it is sustained, overruled, or reserved, and explain why in under 100 words.`;

      const rulingText = await streamAiResponse(activeChatJudge, contextForJudge, 'judge', { kind: 'ruling', phase: phaseAtStart });
      if (sessionEndedRef.current || !mountedRef.current) return;
      // Outcome must come from the Court stream only, never from counsel text.
      const outcome = detectObjectionOutcome(rulingText);
      const scored = scoreObjection(scoreAtStart, outcome, isQuick, savedExplanation);
      const outcomeLabel = outcome === 'sustained' ? 'Sustained' : outcome === 'overruled' ? 'Overruled' : 'Reserved';
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
      syncSessionRecord(finalMessages, scored.score, phaseAtStart);
      setHearingNotice(
        isQuick
          ? `Objection ${outcomeLabel.toLowerCase()} (quick reflex). Structure ${scored.scoreDelta >= 0 ? '+' : ''}${scored.scoreDelta}. Continue your next submission when ready.`
          : `Objection ${outcomeLabel.toLowerCase()}. Structure ${scored.scoreDelta >= 0 ? '+' : ''}${scored.scoreDelta}. Continue your next submission when ready.`,
      );
    } catch (error) {
      console.error('Error during Judge Objection ruling:', error);
      if (!mountedRef.current) return;
      syncSessionRecord(
        latestMessagesRef.current.filter(message => message.id !== objectionId),
        scoreAtStart,
        phaseAtStart,
      );
      setObjectionGrounds(savedGrounds);
      setObjectionExplanation(savedExplanation);
      setIsInlineObjectionActive(true);
      setPendingJudgeRetry(false);
      setHearingNotice('The objection was not filed. Court connection failed; your draft basis was restored. Edit and resubmit, or cancel and continue.');
      setGlobalError(humanizeAiError(error, 'The Court could not rule on this objection.'));
    } finally {
      judgeStreamInFlightRef.current = false;
      isAiTypingRef.current = false;
      if (mountedRef.current) setIsAiTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isAiTyping || !activeChatJudge || !activeChatOpposingCounsel || sessionEnded || !currentSessionSettings || !isTimerRunning) return;
    if (ocStreamInFlightRef.current || judgeStreamInFlightRef.current) return;

    // An objection is a learner choice, not a typing-speed gate. Continuing an
    // argument simply closes the optional window and preserves the normal turn.
    if (objectionWindowActive) {
      setObjectionWindowActive(false);
    }
    if (isInlineObjectionActive) {
      setIsInlineObjectionActive(false);
    }
    setPendingJudgeRetry(false);

    if (voiceEnabledRef.current) cancelSpeech();

    const userMessageText = userInput.trim();
    const phaseAtStart = activePhaseRef.current;
    const scoreAtStart = scoreBreakdownRef.current;
    lastUserMessageRef.current = userMessageText;

    const recentUserTexts = latestMessagesRef.current
      .filter(m => m.sender === 'user' && m.meta?.kind !== 'objection')
      .slice(-4)
      .map(m => m.text);
    const scored = scoreSubmission(scoreAtStart, userMessageText, recentUserTexts);
    const inferredPhase = inferNextPhase([...latestMessagesRef.current, {
      id: 'phase-probe',
      sender: 'user',
      text: userMessageText,
      timestamp: new Date(),
      meta: { kind: 'argument', phase: phaseAtStart, argumentQuality: scored.assessment },
    }]);
    const nextPhase = resolveForwardPhase(phaseAtStart, inferredPhase);
    const phaseAdvanced = nextPhase !== phaseAtStart;

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

    let submittedMessages = [...latestMessagesRef.current, userMessage];
    if (phaseAdvanced) {
      const phaseBanner: ChatMessage = {
        id: `phase-${nextPhase}-${Date.now()}`,
        sender: 'system',
        text: `Phase advanced to ${phaseLabel(nextPhase)}. ${
          nextPhase === 'issue_framing'
            ? 'Frame the precise issue for the Court.'
            : nextPhase === 'rebuttal'
              ? 'Answer opposing points with authority and record facts.'
              : nextPhase === 'judicial_questions'
                ? 'Expect direct questions from the Court.'
                : nextPhase === 'closing'
                  ? 'Close with relief sought and your strongest thread.'
                  : 'Continue with structured advocacy.'
        }`,
        timestamp: new Date(),
        meta: { kind: 'instruction', phase: nextPhase },
      };
      submittedMessages = [...submittedMessages, phaseBanner];
    }

    syncSessionRecord(submittedMessages, scored.score, nextPhase);
    setUserInput('');
    setAudioError(null);
    setHearingNotice(null);

    ocStreamInFlightRef.current = true;
    isAiTypingRef.current = 'opposingCounsel';
    try {
      setIsAiTyping('opposingCounsel');
      const ocPrompt = buildOpposingCounselPrompt(
        currentSessionSettings,
        submittedMessages,
        nextPhase,
        userMessageText,
      );
      const ocResponseText = await streamAiResponse(activeChatOpposingCounsel, ocPrompt, 'opposingCounsel', { kind: 'response', phase: nextPhase });
      if (sessionEndedRef.current || !mountedRef.current) return;

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
      // Window pauses automatically while a formal objection draft is open.
      setObjectionWindowActive(true);
      setObjectionWindowSecondsLeft(OBJECTION_WINDOW_SECONDS);
      if (phaseAdvanced) {
        setHearingNotice(`Now in ${phaseLabel(nextPhase)}. Optional objection window is open for ${OBJECTION_WINDOW_SECONDS}s, or continue your next submission.`);
      }
    } catch (error) {
      console.error('Error during AI interaction:', error);
      if (!mountedRef.current) return;
      // Roll back this turn (user bubble + optional phase banner) and restore draft.
      const phaseBannerId = phaseAdvanced
        ? latestMessagesRef.current.find(
          message => message.sender === 'system'
            && message.meta?.kind === 'instruction'
            && message.meta?.phase === nextPhase
            && message.id.startsWith(`phase-${nextPhase}-`),
        )?.id
        : undefined;
      syncSessionRecord(
        latestMessagesRef.current.filter(message =>
          message.id !== userMessage.id && message.id !== phaseBannerId,
        ),
        scoreAtStart,
        phaseAtStart,
      );
      lastUserMessageRef.current = [...latestMessagesRef.current]
        .reverse()
        .find(message => message.sender === 'user' && message.meta?.kind !== 'objection')
        ?.text || '';
      setUserInput(userMessageText);
      setObjectionWindowActive(false);
      setPendingJudgeRetry(false);
      setHearingNotice('Opposing Counsel could not respond. Your submission was restored so you can retry it.');
      setGlobalError(humanizeAiError(error, 'Opposing Counsel could not respond. Your draft has been restored.'));
    } finally {
      ocStreamInFlightRef.current = false;
      isAiTypingRef.current = false;
      if (mountedRef.current) setIsAiTyping(false);
    }
  };

  const cancelInlineObjection = useCallback(() => {
    isInlineObjectionActiveRef.current = false;
    setIsInlineObjectionActive(false);
    setObjectionExplanation('');
    // If the optional window already elapsed while drafting, ask the Court now.
    if (!objectionWindowActive && !sessionEnded && isTimerRunning && !isAiTypingRef.current) {
      const last = latestMessagesRef.current[latestMessagesRef.current.length - 1];
      if (last?.sender === 'opposingCounsel') {
        void triggerAutoJudgeResponse();
      }
    }
  }, [objectionWindowActive, sessionEnded, isTimerRunning, triggerAutoJudgeResponse]);

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
    { label: 'Structure', value: String(scoreBreakdown.total), tone: 'text-brand-text-primary' },
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
      onClick: () => {
        isInlineObjectionActiveRef.current = true;
        setIsInlineObjectionActive(true);
      },
      disabled: !canObject,
      tone: canObject
        ? 'border-brand-text-primary/30 text-brand-text-primary hover:bg-[#1c1914]/[0.06]'
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
          <div className="bg-brand-bg-secondary/60 border border-brand-text-primary/15 rounded-xl p-4 space-y-3 shadow-card transition-colors duration-300 group">
            <h5 className="text-sm font-semibold text-brand-text-primary font-serif">{currentSessionSettings.caseDetail.title}</h5>
            <div className="text-xs text-brand-text-secondary font-light space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1 group-hover:text-brand-text-primary transition-colors duration-300">
              <p className="font-semibold text-brand-text-primary flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-brand-text-primary/60 rounded-full" />
                Brief Facts:
              </p>
              <p className="leading-relaxed font-light pl-2.5 border-l border-brand-text-primary/15 group-hover:border-brand-text-primary/30 transition-colors duration-300">{currentSessionSettings.caseDetail.briefFacts}</p>
            </div>
            <div className="text-xs text-brand-text-secondary font-light space-y-1.5 pt-2.5 border-t border-brand-text-primary/15">
              <p className="font-semibold text-brand-text-primary">Relevant Law / Precedents:</p>
              <p className="font-mono text-[10px] text-brand-text-primary/80 leading-relaxed">{currentSessionSettings.caseDetail.relevantArticlesSections}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs uppercase font-mono tracking-widest text-brand-text-primary/80 border-b border-brand-text-primary/15 pb-1 flex items-center">
            <svg className="h-4 w-4 mr-1.5 text-brand-text-primary/80" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Live Trial Standing
          </h4>
          <div className="bg-brand-bg-secondary/60 border border-brand-text-primary/15 rounded-xl p-4 grid grid-cols-2 gap-4 shadow-card">
            <div>
              <p className="text-[9px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">Structure score</p>
              <p className="text-2xl font-mono text-brand-text-primary font-bold mt-1">{scoreBreakdown.total}</p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">Quick Reflexes</p>
              <p className="text-2xl font-mono text-brand-text-primary font-bold mt-1">{quickObjectionsCount}</p>
            </div>
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">Phase</p>
                <p className="text-[10px] font-mono text-brand-text-secondary/60 uppercase tracking-wider">
                  {phaseIndex(activePhase) + 1} / {PHASE_SEQUENCE.length}
                </p>
              </div>
              <p className="text-sm uppercase text-brand-text-primary font-semibold tracking-wider">{phaseLabel(activePhase)}</p>
              <div className="flex gap-1" aria-hidden>
                {PHASE_SEQUENCE.map((phase, idx) => {
                  const current = phaseIndex(activePhase);
                  const filled = idx <= current;
                  return (
                    <div
                      key={phase}
                      title={phaseLabel(phase)}
                      className={`h-1 flex-1 rounded-full border border-brand-border ${filled ? 'bg-brand-text-primary/55' : 'bg-[#1c1914]/[0.04]'}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <div className="bg-brand-bg-secondary/40 border border-brand-text-primary/10 rounded-xl p-3 space-y-2">
            <p className="text-[9px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">Feedback dimensions</p>
            {(
              [
                ['engagement', scoreBreakdown.engagement],
                ['advocacy', scoreBreakdown.advocacy],
                ['objections', scoreBreakdown.objections],
                ['responsiveness', scoreBreakdown.responsiveness],
                ['professionalism', scoreBreakdown.professionalism],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-[7.5rem] text-[10px] font-mono text-brand-text-secondary/80 truncate">
                  {SCORE_DIMENSION_LABELS[key]}
                </span>
                <div className="flex-1 h-1 bg-[#1c1914]/[0.04] rounded-full overflow-hidden border border-brand-border">
                  <div
                    className="h-full bg-brand-text-primary/50 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, (value / 50) * 100))}%` }}
                  />
                </div>
                <span className="w-6 text-right text-[10px] font-mono text-brand-text-primary">{value}</span>
              </div>
            ))}
            <p className="text-[9px] font-mono text-brand-text-secondary/50 pt-1">
              Local structure signals only. Not a ruling on the merits.
            </p>
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
            <div className="bg-brand-bg-secondary/60 border border-brand-text-primary/15 rounded-xl p-4 text-center space-y-2">
              <p className="text-xs text-brand-text-secondary/80 leading-relaxed font-light">
                {isAiTyping
                  ? 'Wait for the current speaker to finish before raising an objection.'
                  : objectionWindowActive
                    ? 'Objection window is open in the transcript. Use Raise Objection below the feed, or wait for the Court.'
                    : 'Objections unlock after Opposing Counsel finishes a submission. Then: choose grounds, state a legal basis, and file.'}
              </p>
              <p className="text-[10px] font-mono uppercase tracking-wider text-brand-text-secondary/55">
                Flow: OC speaks → optional window → object or continue → Court responds
              </p>
            </div>
          ) : (
            <div className="space-y-4 animate-fadeIn">
              <p className="text-xs text-brand-text-secondary font-light leading-relaxed">
                {objectionWindowActive
                  ? `Optional window: ${objectionWindowSecondsLeft.toFixed(1)}s left for a quick-reflex bonus. Select grounds, state a legal basis, then file.`
                  : 'Select grounds and state a concise legal basis. Filing asks the Court to rule before you continue.'}
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
                  void handleObjectionSubmit();
                  setIsMobileDrawerOpen(false);
                }}
                disabled={!objectionExplanation.trim() || !!isAiTyping || sessionEnded || !isTimerRunning}
                className="w-full min-h-11 py-2.5 rounded-lg text-xs tracking-wider uppercase font-semibold bg-brand-text-primary text-brand-bg-primary hover:bg-[#3a352c] disabled:bg-brand-bg-tertiary disabled:text-brand-text-secondary/50 border-none transition-all flex items-center justify-center"
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
      className="flex flex-col bg-brand-bg-primary text-brand-text-primary overflow-hidden relative overscroll-none"
      style={{ height: `${vpHeight}px`, maxHeight: `${vpHeight}px` }}
    >
      {/* design.md §9: solid canvas — no BackgroundGeometry wallpaper */}

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

            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('lexforge-open-coach'))}
              className="sm:hidden shrink-0 min-h-11 min-w-11 px-3 rounded-lg border border-brand-border text-[11px] font-mono uppercase tracking-wide text-brand-text-secondary hover:border-brand-border-light hover:text-brand-text-primary"
              aria-label="Open coach"
            >
              Coach
            </button>

            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              {isTTSAvailable() && (
                <button
                  type="button"
                  onClick={() => setVoiceEnabled(v => !v)}
                  className={`min-h-11 px-3 rounded-md border text-[12px] transition-colors ${
                    voiceEnabled
                      ? 'bg-brand-text-primary text-brand-bg-primary border-transparent'
                      : 'border-brand-border text-brand-text-secondary hover:text-brand-text-primary'
                  }`}
                  title={voiceEnabled ? 'Mute courtroom voice' : 'Enable courtroom voice'}
                  aria-pressed={voiceEnabled}
                >
                  {voiceEnabled ? 'Voice on' : 'Voice off'}
                </button>
              )}
              {!sessionEnded && isTimerRunning && (
                <button
                  type="button"
                  onClick={() => { if (currentSessionSettings) handleSessionEnd(true, true); }}
                  className="min-h-11 px-3 rounded-md border border-brand-error/40 text-brand-error text-[12px] hover:bg-brand-error/10 transition-colors"
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
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:justify-between sm:items-center text-[10px] font-mono uppercase tracking-wider text-brand-text-primary">
                            <span className="font-semibold flex items-center">
                              <svg className="w-3.5 h-3.5 mr-1 text-brand-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                              {isInlineObjectionActive ? 'Objection draft open (timer paused)' : 'Optional objection window'}
                            </span>
                            <span className="font-bold">
                              {isInlineObjectionActive ? 'Paused' : `${objectionWindowSecondsLeft.toFixed(1)}s remaining`}
                            </span>
                          </div>
                          <div className="w-full bg-brand-bg-tertiary h-1.5 rounded-full overflow-hidden border border-brand-border">
                            <div
                              className="bg-brand-text-primary/55 h-full transition-all duration-100 ease-linear rounded-full"
                              style={{ width: `${(objectionWindowSecondsLeft / OBJECTION_WINDOW_SECONDS) * 100}%` }}
                            ></div>
                          </div>
                          <div className="flex flex-col gap-1 text-[9px] font-mono text-brand-text-secondary/70 sm:flex-row sm:justify-between sm:items-center">
                            <span>
                              {isInlineObjectionActive
                                ? 'Finish the basis and file, or cancel to let the Court proceed.'
                                : 'Object now for a quick-reflex bonus, or send your next submission. Court follows if you wait.'}
                            </span>
                            <span className="text-brand-text-primary/80 font-semibold">
                              {isInlineObjectionActive ? '[ DRAFTING ]' : '[ OPTIONAL ]'}
                            </span>
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
                      <CourtIcon className="h-[18px] w-[18px] sm:h-5 sm:w-5 text-brand-text-primary/80" />
                    ) : (
                      <BriefcaseIcon className="h-[18px] w-[18px] sm:h-5 sm:w-5 text-brand-text-secondary" />
                    )}
                  </div>
                  <div className="flex flex-col flex-grow items-start max-w-[calc(100%-3rem)] pl-1">
                    <div className="flex items-center space-x-2 mb-1.5 text-[10px] font-mono uppercase tracking-widest text-brand-text-secondary/70">
                      <span className="font-bold text-brand-text-primary">
                        {isTranscribing ? 'Transcribing' : (isAiTyping === 'judge' ? 'The Court' : 'Opposing Counsel')}
                      </span>
                      <span className="text-brand-text-secondary/40">·</span>
                      <span className="text-brand-text-secondary/70">{isTranscribing ? 'Voice' : 'Typing'}</span>
                    </div>
                    <div className="flex items-center space-x-2.5 py-1">
                      <span className="text-xs sm:text-sm font-light text-brand-text-secondary">
                        {isTranscribing
                          ? 'Listening and transcribing your voice'
                          : (isAiTyping === 'judge'
                            ? 'The Court is considering the record'
                            : 'Opposing Counsel is preparing a response')}
                      </span>
                      <span className="flex space-x-1 items-center h-2.5">
                        <span className="w-1.5 h-1.5 bg-brand-text-primary/55 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-brand-text-primary/55 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-brand-text-primary/55 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
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
            <div
              className="p-3 sm:p-6 bg-brand-bg-primary border-t border-brand-text-primary/15 z-20 relative flex-shrink-0"
              style={{ paddingBottom: isMobile ? 'max(0.75rem, env(safe-area-inset-bottom, 0px))' : undefined }}
            >
              <div className="max-w-4xl mx-auto">
                {audioError && (
                  <div className="p-2.5 mb-3 bg-brand-error/10 border border-brand-error/25 text-brand-error text-[11px] rounded-xl text-left animate-fadeIn flex items-start justify-between gap-3">
                    <span className="leading-relaxed">{audioError}</span>
                    <button
                      type="button"
                      onClick={() => setAudioError(null)}
                      className="flex-shrink-0 min-h-11 min-w-11 px-2 text-[11px] font-mono uppercase tracking-wider opacity-70 hover:opacity-100"
                      aria-label="Dismiss audio error"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                {hearingNotice && (
                  <div role="status" className="p-2.5 mb-3 bg-brand-bg-secondary/80 border border-brand-text-primary/20 text-brand-text-primary text-[11px] rounded-xl text-left animate-fadeIn flex items-start justify-between gap-3">
                    <span className="leading-relaxed">{hearingNotice}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {pendingJudgeRetry && !isAiTyping && !sessionEnded && isTimerRunning && (
                        <button
                          type="button"
                          onClick={() => {
                            setHearingNotice(null);
                            setPendingJudgeRetry(false);
                            void triggerAutoJudgeResponse();
                          }}
                          className="min-h-11 px-3 text-[11px] font-mono uppercase tracking-wider border border-brand-text-primary/25 rounded-md hover:bg-brand-text-primary hover:text-brand-bg-primary transition-colors"
                        >
                          Retry Court
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setHearingNotice(null);
                          setPendingJudgeRetry(false);
                        }}
                        className="min-h-11 min-w-11 px-2 text-[11px] font-mono uppercase tracking-wider opacity-70 hover:opacity-100"
                        aria-label="Dismiss hearing notice"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                <div className="sm:hidden mb-3 rounded-2xl border border-brand-text-primary/15 bg-brand-bg-secondary/55 px-3.5 py-3 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary/60">Session controls</p>
                      <p className="mt-1 text-xs font-semibold text-brand-text-primary">
                        {canObject
                          ? (objectionWindowActive
                            ? `Objection ready (${objectionWindowSecondsLeft.toFixed(1)}s optional window).`
                            : 'You may raise a formal objection now.')
                          : isInlineObjectionActive
                            ? 'Drafting formal objection. Timer paused if a window was open.'
                            : 'Transcript stays primary. Bench tools remain one tap away.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isTTSAvailable() && (
                        <button
                          type="button"
                          onClick={() => setVoiceEnabled(v => !v)}
                          className={`min-h-11 rounded-xl border px-3 py-2 text-[10px] font-mono uppercase tracking-wider transition-all ${
                            voiceEnabled
                              ? 'bg-white text-brand-bg-primary border-transparent'
                              : 'border-brand-text-primary/15 bg-brand-bg-tertiary/45 text-brand-text-primary hover:border-brand-border-light'
                          }`}
                          title={voiceEnabled ? 'Mute courtroom voice' : 'Enable courtroom voice'}
                          aria-pressed={voiceEnabled}
                        >
                          {voiceEnabled ? 'Voice On' : 'Voice Off'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsMobileDrawerOpen(true)}
                        className="min-h-11 rounded-xl border border-brand-text-primary/15 bg-brand-bg-tertiary/45 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-brand-text-primary transition-all hover:border-brand-border-light"
                        aria-expanded={isMobileDrawerOpen}
                        aria-controls="practice-bench-drawer"
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
                      onClick={() => {
                        isInlineObjectionActiveRef.current = true;
                        setIsInlineObjectionActive(true);
                      }}
                      className="w-full sm:w-auto min-h-11 px-4 py-2.5 rounded-2xl border border-brand-text-primary/25 bg-brand-bg-secondary/60 hover:bg-brand-text-primary hover:text-brand-bg-primary text-brand-text-primary text-[10px] font-bold font-mono uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 shadow-card"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Raise Objection</span>
                      <span className="bg-brand-bg-tertiary text-brand-text-secondary px-1.5 py-0.5 rounded text-[8px] font-mono hidden sm:inline group-hover:bg-black/10">Press [ O ]</span>
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
                        onClick={cancelInlineObjection}
                        className="min-h-11 px-3 text-[11px] font-mono uppercase text-brand-text-secondary/70 hover:text-brand-text-primary transition-colors"
                        aria-label="Cancel formal objection"
                      >
                        Cancel
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

                <div className={`max-w-3xl mx-auto rounded-2xl border transition-all px-3 py-2 sm:py-2.5 shadow-card ${isInlineObjectionActive ? 'bg-brand-bg-secondary/75 border-brand-border-light' : 'bg-brand-bg-secondary/50 border-brand-text-primary/20 focus-within:border-brand-border-light'}`}>
                  <div className="flex items-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (sttDisabledReason && !isRecording) {
                          setAudioError(sttDisabledReason);
                          return;
                        }
                        if (isRecording) stopRecording();
                        else void startRecording();
                      }}
                      disabled={!!isAiTyping || sessionEnded || !isTimerRunning || isTranscribing}
                      aria-disabled={Boolean(sttDisabledReason && !isRecording)}
                      className={`min-h-11 min-w-11 w-11 h-11 sm:w-11 sm:h-11 flex-shrink-0 rounded-xl flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1914]/25 disabled:opacity-40
                        ${isRecording
                          ? 'bg-brand-error/15 border border-brand-error/30 text-brand-error animate-pulse'
                          : sttDisabledReason
                            ? 'bg-brand-bg-tertiary border border-brand-text-primary/10 text-brand-text-secondary/45'
                            : 'bg-brand-bg-tertiary border border-brand-text-primary/15 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-text-primary/10'
                        }`}
                      title={
                        isRecording
                          ? 'Stop Recording'
                          : sttDisabledReason || 'Speak to Transcribe'
                      }
                      aria-label={
                        isRecording
                          ? 'Stop recording'
                          : sttDisabledReason || 'Speak to transcribe'
                      }
                    >
                      {isRecording ? (
                        <span className="w-2.5 h-2.5 bg-brand-error rounded-sm animate-ping"></span>
                      ) : (
                        <svg className="w-4 h-4 sm:h-[18px] sm:w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
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
                        className="w-full bg-transparent text-brand-text-primary placeholder-brand-text-secondary/50 text-base sm:text-sm resize-none focus:outline-none min-h-[44px] max-h-[140px] py-2 custom-scrollbar font-light"
                        rows={1}
                        disabled={!!isAiTyping || sessionEnded || !isTimerRunning}
                        enterKeyHint="send"
                        autoComplete="off"
                        autoCorrect="on"
                        spellCheck
                      />
                    </div>

                    <button
                      type="button"
                      onClick={isInlineObjectionActive ? handleObjectionSubmit : handleSendMessage}
                      disabled={!!isAiTyping || (isInlineObjectionActive ? !objectionExplanation.trim() : !userInput.trim()) || sessionEnded || !isTimerRunning}
                      className={`min-h-11 min-w-11 w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1914]/25
                        ${(isInlineObjectionActive ? objectionExplanation.trim() : userInput.trim()) && !isAiTyping && isTimerRunning
                          ? 'bg-brand-text-primary text-brand-bg-primary hover:bg-white'
                          : 'bg-brand-bg-tertiary text-brand-text-secondary/50 border border-brand-text-primary/15 cursor-not-allowed'
                        }`}
                      title={isInlineObjectionActive ? 'Submit Objection' : 'Send Statement'}
                      aria-label={isInlineObjectionActive ? 'Submit objection' : 'Send statement'}
                    >
                      <svg className="w-4 h-4 sm:h-[18px] sm:w-[18px] transform rotate-90" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <p className="text-center mt-3 text-[10px] font-mono text-brand-text-secondary/50 tracking-widest uppercase hidden sm:block select-none">
                  Present your arguments clearly and concisely. The Court is listening.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="lg:w-[380px] xl:w-[420px] w-full lg:flex hidden flex-col border-l border-brand-border bg-brand-bg-primary overflow-y-auto custom-scrollbar p-6 space-y-6 flex-shrink-0 h-full relative z-20">
          {renderBenchCompanion()}
        </div>
      </div>

      {isMobileDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/80 z-40 transition-opacity duration-300"
          onClick={() => setIsMobileDrawerOpen(false)}
          aria-hidden
        />
      )}

      <div
        id="practice-bench-drawer"
        role="dialog"
        aria-modal={isMobileDrawerOpen || undefined}
        aria-label="Bench companion"
        aria-hidden={!isMobileDrawerOpen}
        className={`lg:hidden fixed bottom-0 left-0 right-0 bg-brand-bg-secondary border-t border-brand-border rounded-t-2xl z-50 transform transition-transform duration-300 overflow-y-auto custom-scrollbar overscroll-contain px-4 pt-5 sm:p-6 space-y-5 shadow-none ${isMobileDrawerOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}
        style={{
          maxHeight: `${Math.max(280, viewportHeight - 24)}px`,
          paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))',
        }}
        {...(!isMobileDrawerOpen ? ({ inert: '' } as Record<string, string>) : {})}
      >
        <div className="flex justify-between items-center gap-3 pb-3 border-b border-brand-border">
          <div className="min-w-0">
            <h3 className="text-lg font-bold font-serif text-brand-text-primary flex items-center">
              <CourtIcon className="h-5 w-5 mr-2 text-brand-text-primary" /> Bench Companion
            </h3>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary/55">Case brief, score, and objection controls</p>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(false)}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-brand-text-secondary hover:text-brand-text-primary hover:bg-[#1c1914]/[0.05] text-sm font-mono"
            aria-label="Close bench companion"
          >
            Close
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-brand-text-primary/15 bg-brand-bg-secondary/40 px-3 py-2.5">
            <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary/60">Structure</p>
            <p className="mt-1 text-base font-semibold text-brand-text-primary">{scoreBreakdown.total}</p>
          </div>
          <div className="rounded-xl border border-brand-text-primary/15 bg-brand-bg-secondary/40 px-3 py-2.5">
            <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary/60">Phase</p>
            <p className="mt-1 text-base font-semibold uppercase text-brand-text-primary">{phaseLabel(activePhase)}</p>
          </div>
        </div>
        {renderBenchCompanion()}
      </div>
    </div>
  );
};

export default PracticeArena;
