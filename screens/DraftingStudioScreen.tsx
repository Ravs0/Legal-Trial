import React, { useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import { TrialSimContext } from '../App';
import { DRAFTING_TASKS_INDIAN, DRAFTING_TASKS_INTERNATIONAL } from '../constants';
import { DraftingTask, DraftingStudioStage } from '../types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { LoadingSpinner } from '../components/LoadingSpinner';
import {
  AcademicCapIcon,
  Bars3Icon,
  CheckCircleIcon,
  QuillIcon,
  XMarkIcon,
} from '../components/icons';
import { AiServiceError, generateDraftingFacts, generateDraftingGuidance, getFilingProcedureInfo } from '../services/aiService';
import { SelectInput } from '../components/SelectInput';
import { scoreLegalWriting, ScoringResult } from '../services/legalWritingScorer';
import { ScoreCard } from '../components/ScoreCard';
import { Modal } from '../components/Modal';
import { renderLegalMarkdown } from '../utils/markdown';
import { RoomBanner, RoomStepper } from '../components/RoomChrome';
import { PatternPanel, SurfacePattern } from '../components/SurfacePattern';
import { PhotoTile } from '../components/PhotoTile';
import { buildDraftMarkdown, downloadMarkdown, draftFilename } from '../services/exportService';
import { saveGenericState, readGenericState } from '../services/storageService';
import draftingPen from '../assets/drafting_pen.jpg';
import trialBinderDesk from '../assets/trial_binder_desk.jpg';
import counselScales from '../assets/counsel_scales.jpg';
import judgeGavel from '../assets/judge_gavel.jpg';
import courtroomLuxury from '../assets/courtroom_luxury.jpg';
import {
  isMicSupported,
  preferredRecordingMimeType,
  transcribeAudio,
  speakWithBestEffort,
  probeVoiceAvailability,
  humanizeVoiceError,
  VoiceError,
  isTTSAvailable,
} from '../services/voiceService';

// Screen-local outline icons (not yet promoted to components/icons)
const LightbulbIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6 6 0 1 0-7.432-1.201M12 11.25a6 6 0 1 1 7.432-1.201M12 18c1.38 0 2.5 1.12 2.5 2.5s-1.12 2.5-2.5 2.5-2.5-1.12-2.5-2.5 1.12-2.5 2.5-2.5Z" />
  </svg>
);

const BookOpenIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
  </svg>
);

const ClipboardIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 18 4.5h-2.25a2.25 2.25 0 0 0-2.25-2.25H10.5A2.25 2.25 0 0 0 8.25 4.5H6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 6 18.75h3Z" />
  </svg>
);

const ChartBarIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
  </svg>
);

const HistoryIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);


interface GroupedTaskOption {
  label: string;
  options: Array<{ value: string; label: string }>;
}

const DraftingStudioScreen: React.FC = () => {
  const context = useContext(TrialSimContext);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!context) throw new Error("TrialSimContext not found in DraftingStudioScreen");
  const {
    practiceMode,
    setIsLoading: setGlobalLoading,
    setError: setGlobalError,
    isFactGenerating,
    setIsFactGenerating
  } = context;

  const [currentTask, setCurrentTask] = useState<DraftingTask | null>(null);
  const [generatedFacts, setGeneratedFacts] = useState<string>('');
  const [availableTasks, setAvailableTasks] = useState<DraftingTask[]>([]);
  const [userDraft, setUserDraft] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [stage, setStage] = useState<DraftingStudioStage>('task_selection');
  const [isLoadingAiInteraction, setIsLoadingAiInteraction] = useState<boolean>(false);
  /** Local AI failure (fact gen / mentor / filing). Global error still set for shell banner. */
  type StudioErrorScope = 'facts' | 'review' | 'filing' | 'general';
  const [studioError, setStudioError] = useState<{ scope: StudioErrorScope; message: string } | null>(null);
  const [lastFailedTaskId, setLastFailedTaskId] = useState<string | null>(null);
  
  // Reference Panel States
  const [activeRefTab, setActiveRefTab] = useState<'facts' | 'feedback' | 'procedure' | 'score' | 'compliance' | 'course' | 'history'>('facts');
  const [snapshots, setSnapshots] = useState<{ id: string; timestamp: string; text: string }[]>([]);
  const [selectedSnapshotForDiff, setSelectedSnapshotForDiff] = useState<string | null>(null);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string>('');
  const [filingProcedure, setFilingProcedure] = useState<string>('');
  const [isRefPanelOpen, setIsRefPanelOpen] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState(false);

  // Course Syllabus states
  const [openModule, setOpenModule] = useState<number | null>(0);
  const [checklistChecked, setChecklistChecked] = useState<boolean[]>([false, false, false, false, false]);
  const [copiedSnippetIndex, setCopiedSnippetIndex] = useState<number | null>(null);

  // Focus Mode & Auto-Save
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
  const [showAutoSave, setShowAutoSave] = useState<boolean>(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveSnapshot = useCallback(() => {
    if (!currentTask || !userDraft.trim()) return;
    const key = `draft-snapshots-${currentTask.id}`;
    const newSnapshot = {
      id: `snapshot-${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      text: userDraft
    };
    const updated = [newSnapshot, ...snapshots];
    setSnapshots(updated);
    saveGenericState(key, updated);
    
    setShowAutoSave(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => setShowAutoSave(false), 2000);
  }, [currentTask, userDraft, snapshots]);

  useEffect(() => {
    if (currentTask) {
      const key = `draft-snapshots-${currentTask.id}`;
      const saved = readGenericState<typeof snapshots>(key);
      setSnapshots(Array.isArray(saved) ? saved : []);
    }
  }, [currentTask]);

  useEffect(() => {
    const handleToggleFocus = () => {
      setIsFocusMode(prev => !prev);
    };
    const handleSaveSnapshot = () => {
      saveSnapshot();
    };

    window.addEventListener('cmd-palette-toggle-focus-mode', handleToggleFocus);
    window.addEventListener('cmd-palette-save-snapshot', handleSaveSnapshot);

    return () => {
      window.removeEventListener('cmd-palette-toggle-focus-mode', handleToggleFocus);
      window.removeEventListener('cmd-palette-save-snapshot', handleSaveSnapshot);
    };
  }, [saveSnapshot]);

  const computeDiff = (oldText: string, newText: string) => {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const diffRows: { oldNum: number | string; oldLine: string; newNum: number | string; newLine: string; type: 'unchanged' | 'modified' | 'added' | 'deleted' }[] = [];

    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      const oLine = oldLines[oldIdx] ?? null;
      const nLine = newLines[newIdx] ?? null;

      if (oLine === nLine) {
        diffRows.push({
          oldNum: oldIdx + 1,
          oldLine: oLine,
          newNum: newIdx + 1,
          newLine: nLine,
          type: 'unchanged'
        });
        oldIdx++;
        newIdx++;
      } else if (oLine !== null && nLine === null) {
        diffRows.push({
          oldNum: oldIdx + 1,
          oldLine: oLine,
          newNum: '-',
          newLine: '',
          type: 'deleted'
        });
        oldIdx++;
      } else if (oLine === null && nLine !== null) {
        diffRows.push({
          oldNum: '-',
          oldLine: '',
          newNum: newIdx + 1,
          newLine: nLine,
          type: 'added'
        });
        newIdx++;
      } else {
        diffRows.push({
          oldNum: oldIdx + 1,
          oldLine: oLine,
          newNum: '-',
          newLine: '',
          type: 'deleted'
        });
        diffRows.push({
          oldNum: '-',
          oldLine: '',
          newNum: newIdx + 1,
          newLine: nLine,
          type: 'added'
        });
        oldIdx++;
        newIdx++;
      }
    }

    return diffRows;
  };

  const renderDiffViewer = () => {
    if (!selectedSnapshotForDiff) return null;
    const snapshot = snapshots.find(s => s.id === selectedSnapshotForDiff);
    if (!snapshot) return null;

    const diffRows = computeDiff(snapshot.text, userDraft);

    return (
      <div className="space-y-4 text-left font-mono">
        <div className="flex justify-between items-center bg-brand-bg-secondary p-3 border border-brand-text-primary/30">
          <span className="text-xs text-brand-text-primary uppercase font-bold">Comparing current draft to snapshot ({snapshot.timestamp})</span>
          <span className="text-[10px] text-brand-text-secondary">Line-by-line comparison</span>
        </div>

        <div className="max-h-[50vh] overflow-y-auto border border-brand-text-primary/30 text-xs custom-scrollbar">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-brand-bg-secondary text-[10px] uppercase border-b border-brand-text-primary/30 text-brand-text-secondary">
                <th className="p-2 border-r border-brand-text-primary/20 w-12 text-center">Line</th>
                <th className="p-2 border-r border-brand-text-primary/20 w-1/2 text-left">Snapshot</th>
                <th className="p-2 border-r border-brand-text-primary/20 w-12 text-center">Line</th>
                <th className="p-2 text-left w-1/2">Current Draft</th>
              </tr>
            </thead>
            <tbody>
              {diffRows.map((row, idx) => {
                let rowBg = '';
                let oldTextColor = 'text-brand-text-secondary/70';
                let newTextColor = 'text-brand-text-secondary/70';

                if (row.type === 'deleted') {
                  rowBg = 'bg-brand-error/10';
                  oldTextColor = 'text-brand-error font-medium line-through';
                } else if (row.type === 'added') {
                  rowBg = 'bg-[#1c1914]/[0.04]';
                  newTextColor = 'text-brand-text-primary font-medium';
                } else {
                  oldTextColor = 'text-brand-text-primary/80';
                  newTextColor = 'text-brand-text-primary/80';
                }

                return (
                  <tr key={idx} className={`border-b border-brand-text-primary/10 ${rowBg}`}>
                    <td className="p-1.5 border-r border-brand-text-primary/20 text-center text-[10px] text-brand-text-secondary/40 select-none">{row.oldNum}</td>
                    <td className={`p-1.5 border-r border-brand-text-primary/20 whitespace-pre-wrap font-sans ${oldTextColor}`}>{row.oldLine}</td>
                    <td className="p-1.5 border-r border-brand-text-primary/20 text-center text-[10px] text-brand-text-secondary/40 select-none">{row.newNum}</td>
                    <td className={`p-1.5 whitespace-pre-wrap font-sans ${newTextColor}`}>{row.newLine}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-4 border-t border-brand-text-primary/30">
          <Button variant="outline" onClick={() => setIsDiffModalOpen(false)}>Close Compare</Button>
        </div>
      </div>
    );
  };

  const handleCopySnippet = (index: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippetIndex(index);
    setTimeout(() => setCopiedSnippetIndex(null), 1500);
  };

  // Live scoring state
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null);
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real-time Pleadings Compliance Checker
  const complianceMetrics = useMemo(() => {
    const text = userDraft.toLowerCase();
    const checks = [
      {
        id: 'jurisdiction',
        name: 'Jurisdictional Statement',
        satisfied: /\b(jurisdiction|venue|district court|court of|forum)\b/i.test(text),
        tip: "Specify the court's authority over the parties and dispute (e.g., 'This Court has jurisdiction under Section...').",
      },
      {
        id: 'causeOfAction',
        name: 'Cause of Action / Claims',
        satisfied: /\b(cause of action|claim|count|negligence|breach|liability|violation|damages)\b/i.test(text),
        tip: "Clearly outline the legal counts or claims against the defendant (e.g., 'COUNT I: Breach of Contract').",
      },
      {
        id: 'allegations',
        name: 'Numbered Allegations / Facts',
        satisfied: /(\b\d+\.\s+[a-z]|\ballegation|\bfacts\b)/i.test(text),
        tip: "Structure your facts as separate, numbered allegations of fact to make them easy to admit or deny.",
      },
      {
        id: 'relief',
        name: 'Prayer for Relief',
        satisfied: /\b(prayer|relief|wherefore|demand|judgment against|remedy|damages)\b/i.test(text),
        tip: "Include a 'WHEREFORE' signature demand section detailing the damages or remedies you request.",
      },
      {
        id: 'signature',
        name: 'Signature Block & Attorney Info',
        satisfied: /\b(signature|signed|attorney for|esq|counsel for|dated)\b/i.test(text),
        tip: "Append an attorney signature block (e.g., 'Respectfully submitted, Attorney for Plaintiff...').",
      },
    ];

    const passedCount = checks.filter(c => c.satisfied).length;
    const score = Math.round((passedCount / checks.length) * 100);

    return {
      checks,
      score,
      verdict: score === 100 ? 'Compliant' : score >= 60 ? 'Substandard' : 'Deficient',
    };
  }, [userDraft]);

  // Voice Recording state for STT
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [sttAvailable, setSttAvailable] = useState<boolean | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isMicSupported()) {
      setSttAvailable(false);
      return;
    }
    probeVoiceAvailability()
      .then((cap) => {
        if (!cancelled) setSttAvailable(cap.probeFailed ? true : cap.available);
      })
      .catch(() => { if (!cancelled) setSttAvailable(true); });
    return () => {
      cancelled = true;
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch { /* ignore */ }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    };
  }, []);

  const startRecording = async () => {
    setGlobalError(null);
    audioChunksRef.current = [];

    if (!isMicSupported()) {
      setGlobalError('Microphone recording is not supported in this browser. Type your draft instead.');
      return;
    }
    if (sttAvailable === false) {
      setGlobalError('Voice transcription is unavailable (SARVAM_API_KEY not configured). Type your draft instead.');
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
        setGlobalError('Recording failed. Check microphone permissions and try again.');
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        const mimeType = (mediaRecorder.mimeType || preferredMime || 'audio/webm').split(';')[0] || 'audio/webm';
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        if (!chunks.length) {
          setGlobalError('No audio captured. Check the microphone and try again.');
          return;
        }
        const audioBlob = new Blob(chunks, { type: mimeType });
        await handleSTT(audioBlob);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setGlobalError('Microphone permission denied. Allow mic access or type your draft.');
      } else if (name === 'NotFoundError') {
        setGlobalError('No microphone found. Type your draft instead.');
      } else {
        setGlobalError('Microphone access is required for voice input.');
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
    setIsLoadingAiInteraction(true);
    try {
      const text = await transcribeAudio(blob, { language: 'en-IN' });
      setUserDraft(prev => (prev ? `${prev}\n${text}` : text));
    } catch (err) {
      console.error('Transcription error:', err);
      if (err instanceof VoiceError && err.code === 'MISSING_API_KEY') {
        setSttAvailable(false);
      }
      setGlobalError(humanizeVoiceError(err));
    } finally {
      setIsLoadingAiInteraction(false);
    }
  };

  const handleSpeak = async (text: string) => {
    try {
      const mode = await speakWithBestEffort(text, { language: 'en-IN' });
      if (mode === 'none') {
        setGlobalError(
          isTTSAvailable()
            ? 'Could not play speech.'
            : 'Speech playback is not supported in this browser.',
        );
      }
    } catch (error) {
      console.error('Error playing speech:', error);
      setGlobalError(humanizeVoiceError(error));
    }
  };

  // renderLegalMarkdown imported from ../utils/markdown
  const isLoading = isFactGenerating || isLoadingAiInteraction;

  const humanizeStudioAiError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof AiServiceError && err.message.trim()) return err.message.trim();
    if (err instanceof Error && err.message.trim()) return err.message.trim();
    return fallback;
  }, []);

  // Auto-save: debounced 600ms, routed through storageService's versioned
  // envelope (quota recovery + private-mode safety) instead of raw writes.
  useEffect(() => {
    if (!currentTask || !userDraft) return;
    const key = `draft-save-${currentTask.id}`;
    const draft = userDraft;
    const timer = setTimeout(() => {
      saveGenericState(key, draft);
      setShowAutoSave(true);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => setShowAutoSave(false), 2000);
    }, 600);
    return () => clearTimeout(timer);
  }, [userDraft, currentTask]);

  useEffect(() => {
    if (currentTask) {
        const saved = readGenericState<string>(`draft-save-${currentTask.id}`);
        if (saved && !userDraft) {
            setUserDraft(saved);
        }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTask]);

  // Debounced live scoring: runs 800ms after the user stops typing
  useEffect(() => {
    if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
    if (userDraft.trim().length < 50) {
      setScoringResult(null);
      return;
    }
    scoreTimerRef.current = setTimeout(() => {
      const result = scoreLegalWriting(userDraft);
      setScoringResult(result);
    }, 800);
    return () => { if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current); };
  }, [userDraft]);

  const resetTaskStateFull = useCallback(() => {
    if (currentTask) {
        try { localStorage.removeItem(`draft-save-${currentTask.id}`); } catch { /* private mode */ }
    }
    setCurrentTask(null);
    setGeneratedFacts('');
    setUserDraft('');
    setSelectedSectionId(null);
    setAiFeedback('');
    setFilingProcedure('');
    setScoringResult(null);
    setStage('task_selection');
    setIsFactGenerating(false);
    setIsLoadingAiInteraction(false);
    setGlobalError(null);
    setStudioError(null);
    setLastFailedTaskId(null);
    setActiveRefTab('facts');
  }, [currentTask, setIsFactGenerating, setGlobalError]);

  useEffect(() => {
    if (practiceMode) {
      const tasks = practiceMode === 'indian' ? DRAFTING_TASKS_INDIAN : DRAFTING_TASKS_INTERNATIONAL;
      setAvailableTasks(tasks);
    }
  }, [practiceMode]);


  const handleTaskSelectionAndFactGeneration = async (taskId: string) => {
    if (!practiceMode || !taskId || isLoading) return;
    const selected = availableTasks.find(t => t.id === taskId);
    if (!selected) {
      const msg = 'That instrument is not available in this jurisdiction.';
      setStudioError({ scope: 'facts', message: msg });
      setGlobalError(msg);
      return;
    }

    // Clear prior instrument state without wiping the pending selection path.
    if (currentTask && currentTask.id !== selected.id) {
      try { localStorage.removeItem(`draft-save-${currentTask.id}`); } catch { /* private mode */ }
    }
    setGeneratedFacts('');
    setUserDraft('');
    setSelectedSectionId(null);
    setAiFeedback('');
    setFilingProcedure('');
    setScoringResult(null);
    setSnapshots([]);
    setStudioError(null);
    setGlobalError(null);
    setCurrentTask(selected);
    setStage('fact_generation_loading');
    setIsFactGenerating(true);
    setGlobalLoading(true);

    try {
      const factsResponse = await generateDraftingFacts(
        selected.type,
        selected.relevantLaws,
        practiceMode,
        selected.objective,
      );
      setGeneratedFacts(factsResponse);
      setLastFailedTaskId(null);
      setStudioError(null);
      setStage('task_details_display');
    } catch (e) {
      const errorMsg = humanizeStudioAiError(
        e,
        'Could not generate scenario facts. Your selection is preserved; retry shortly.',
      );
      setStudioError({ scope: 'facts', message: errorMsg });
      setGlobalError(errorMsg);
      setLastFailedTaskId(selected.id);
      setCurrentTask(null);
      setStage('task_selection');
    } finally {
      setIsFactGenerating(false);
      setGlobalLoading(false);
    }
  };

  const handleProceedToDrafting = () => {
    if (stage === 'task_details_display' && !isLoading && currentTask) {
      setStudioError(null);
      setStage('drafting');
    }
  };

  const handleSubmitForReview = async () => {
    if (!currentTask || !practiceMode || !generatedFacts.trim() || isLoading) return;
    if (userDraft.trim() === '') {
      const msg = 'Write your draft before submitting for review.';
      setStudioError({ scope: 'review', message: msg });
      setGlobalError(msg);
      return;
    }

    setIsLoadingAiInteraction(true);
    setGlobalLoading(true);
    setActiveRefTab('feedback');
    setStudioError(null);
    setGlobalError(null);

    const sectionName = selectedSectionId
      ? currentTask.sections?.find(s => s.id === selectedSectionId)?.name
      : null;

    try {
      const feedbackResponse = await generateDraftingGuidance(
        currentTask,
        userDraft,
        generatedFacts,
        practiceMode,
        sectionName || undefined,
      );
      setAiFeedback(feedbackResponse);
      setStage('feedback_review');
      setStudioError(null);
    } catch (e) {
      // Keep draft + stage; only surface error so user can retry without data loss.
      const errorMsg = humanizeStudioAiError(
        e,
        'Could not get mentor feedback. Your draft is preserved; retry shortly.',
      );
      setStudioError({ scope: 'review', message: errorMsg });
      setGlobalError(errorMsg);
    } finally {
      setIsLoadingAiInteraction(false);
      setGlobalLoading(false);
    }
  };

  const handleGetFilingInfo = async () => {
    if (!currentTask || !practiceMode || isLoading) return;
    setIsLoadingAiInteraction(true);
    setGlobalLoading(true);
    setActiveRefTab('procedure');
    setStudioError(null);
    setGlobalError(null);

    try {
      const infoResponse = await getFilingProcedureInfo(
        currentTask.type,
        currentTask.relevantLaws,
        practiceMode,
      );
      setFilingProcedure(infoResponse);
      setStage('filing_procedure');
      setStudioError(null);
    } catch (e) {
      const errorMsg = humanizeStudioAiError(
        e,
        'Could not load filing guidance. Retry shortly.',
      );
      setStudioError({ scope: 'filing', message: errorMsg });
      setGlobalError(errorMsg);
    } finally {
      setIsLoadingAiInteraction(false);
      setGlobalLoading(false);
    }
  };

  const handleExportDraft = useCallback(() => {
    if (!currentTask || !userDraft.trim()) {
      const msg = 'Nothing to export yet. Write a draft first.';
      setStudioError({ scope: 'general', message: msg });
      setGlobalError(msg);
      return;
    }
    const markdown = buildDraftMarkdown({
      title: currentTask.title,
      documentType: currentTask.type,
      practiceMode: practiceMode || 'unknown',
      objective: currentTask.objective,
      facts: generatedFacts,
      draft: userDraft,
      feedback: aiFeedback,
    });
    const ok = downloadMarkdown(draftFilename(currentTask.title), markdown);
    if (!ok) {
      const msg = 'Could not download the draft file in this environment.';
      setStudioError({ scope: 'general', message: msg });
      setGlobalError(msg);
    }
  }, [currentTask, userDraft, practiceMode, generatedFacts, aiFeedback, setGlobalError]);

  // Sync scroll on ref changes
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
    }
  }, [activeRefTab]);


  const modeDisplay = (practiceMode || 'indian').charAt(0).toUpperCase() + (practiceMode || 'indian').slice(1);

  const groupedTaskOptionsForSelect = availableTasks.reduce((acc, task) => {
    const category = task.category || 'Uncategorized';
    let group = acc.find(g => g.label === category);
    if (!group) {
      group = { label: category, options: [] };
      acc.push(group);
    }
    group.options.push({ value: task.id, label: `${task.title} (${task.difficulty})` });
    return acc;
  }, [] as GroupedTaskOption[]).flatMap(group => [
    { value: `__optgroup__${group.label}`, label: group.label, disabled: true },
    ...group.options
  ]);

  const sectionOptions = currentTask?.sections?.map(sec => ({ value: sec.id, label: sec.name })) || [];

  // Stepper logic
  const steps = [
    { id: 'select', label: 'Scenario', active: stage === 'task_selection' || stage === 'fact_generation_loading' },
    { id: 'facts', label: 'Facts', active: stage === 'task_details_display' },
    { id: 'draft', label: 'Drafting', active: stage === 'drafting' },
    { id: 'review', label: 'Review', active: stage === 'feedback_review' || stage === 'filing_procedure' },
  ];

  const currentStepIndex = steps.findIndex(s => s.active);

  const renderSyllabus = () => {
    const modules = [
      {
        title: "Module 1: Transactional Architecture",
        subtitle: "Anatomy & Deal Translation",
        content: (
          <div className="space-y-4 text-xs font-light leading-relaxed">
            <p>Drafting does not begin with writing prose; it begins with mapping the commercial transaction. A contract translates business deal points into a binding, structured document.</p>
            <div className="font-semibold text-brand-text-primary">1.1 Structural Anatomy</div>
            <div className="bg-brand-bg-secondary p-2.5 rounded-xl border border-brand-text-primary/30 font-mono text-[9px] text-brand-text-secondary leading-normal">
              1. Introductory Provisions (Preamble & Recitals)<br/>
              2. Definitions Glossary<br/>
              3. Core Transactional Clauses (Price/Payment)<br/>
              4. Reps & Warranties (Facts)<br/>
              5. Covenants (Ongoing duties)<br/>
              6. Conditions Precedent (Triggers)<br/>
              7. Risk Allocation & Remedies (Indemnification)<br/>
              8. Miscellaneous / Boilerplate
            </div>
            
            <div className="font-semibold text-brand-text-primary pt-1">1.2 Preamble & Recitals Overhaul</div>
            <p className="italic text-brand-accent/90">Rule: Avoid "WITNESSETH" and "WHEREAS". Use direct plain English.</p>
            
            <div className="space-y-2">
              <p className="font-mono text-[9px] uppercase tracking-wider text-brand-accent">Red-Pen Overhaul:</p>
              <div className="border border-brand-text-primary/30 rounded-xl overflow-hidden text-[10px]">
                <div className="bg-brand-bg-secondary p-2 border-b border-brand-text-primary/30 font-bold grid grid-cols-2 gap-2">
                  <div>Old Legalese</div>
                  <div>Modern Professional</div>
                </div>
                <div className="p-2.5 border-b border-brand-text-primary/30 grid grid-cols-2 gap-2 bg-brand-bg-primary/30">
                  <div className="text-brand-error/80">THIS AGREEMENT made and entered into this 24th day... by and between Alpha Fund LP...</div>
                  <div className="text-brand-text-primary/90 font-medium">This Stock Purchase Agreement is dated May 24, 2026, and is between Alpha Fund LP ("Investor") and Beta Tech Inc. ("Company").</div>
                </div>
                <div className="p-2.5 grid grid-cols-2 gap-2 bg-brand-bg-primary/15">
                  <div className="text-brand-error/80">WITNESSETH: WHEREAS, the Company desires to sell Preferred Stock...</div>
                  <div className="text-brand-text-primary/90 font-medium">Recitals:<br/>1. The Company is conducting a Series A finance raise.<br/>2. The Company desires to sell Series A shares...</div>
                </div>
              </div>
            </div>
          </div>
        )
      },
      {
        title: "Module 2: Grammar of Obligation",
        subtitle: "Kenneth Adams' Categories of Language",
        content: (
          <div className="space-y-4 text-xs font-light leading-relaxed">
            <p>In <em>A Manual of Style for Contract Drafting</em>, Kenneth Adams establishes six core categories of contract language. Failing to distinguish them creates massive ambiguity.</p>
            <div className="bg-brand-bg-secondary p-3 rounded-xl border border-brand-text-primary/30 space-y-1.5">
              <p><strong>1. Obligation (Covenants):</strong> Party's duty to act. Verb: <em>shall / must</em>.</p>
              <p><strong>2. Factual Assertion (Reps):</strong> Past/present state of fact. Verb: <em>represents / warrants</em>.</p>
              <p><strong>3. Discretionary Authority (Rights):</strong> Option to act. Verb: <em>may</em>.</p>
              <p><strong>4. Policy (Declarations):</strong> Operating automatically. Verb: <em>is / means</em>.</p>
              <p><strong>5. Condition:</strong> Trigger event. Verb: <em>must / is a condition to</em>.</p>
            </div>
            
            <div className="bg-brand-bg-secondary border border-brand-text-primary/30 p-2.5 rounded-xl text-[11px]">
              <strong className="text-brand-accent block mb-1">[ Rule ] The Adams Rule for "Shall"</strong>
              Use <em>shall</em> <strong>only</strong> to impose a duty on a subject who is a party to the agreement. Do not use for policies, third parties, or conditions.
            </div>
 
            <div className="space-y-2">
              <p className="font-mono text-[9px] uppercase tracking-wider text-brand-accent">Red-Pen Overhaul:</p>
              <div className="border border-brand-text-primary/30 rounded-xl overflow-hidden text-[10px]">
                <div className="bg-brand-bg-secondary p-2 border-b border-brand-text-primary/30 font-bold grid grid-cols-2 gap-2">
                  <div>Misused Verb</div>
                  <div>Correct Verb (Category)</div>
                </div>
                <div className="p-2.5 border-b border-brand-text-primary/30 grid grid-cols-2 gap-2 bg-brand-bg-primary/30">
                  <div className="text-brand-error/80">"Terms" shall have the meanings...</div>
                  <div className="text-brand-text-primary/90 font-medium">"Terms" has the meaning... (Policy)</div>
                </div>
                <div className="p-2.5 border-b border-brand-text-primary/30 grid grid-cols-2 gap-2 bg-brand-bg-primary/15">
                  <div className="text-brand-error/80">Seller shall represent that...</div>
                  <div className="text-brand-text-primary/90 font-medium">Seller represents that... (Assertion)</div>
                </div>
                <div className="p-2.5 grid grid-cols-2 gap-2 bg-brand-bg-primary/30">
                  <div className="text-brand-error/80">Agreement shall be governed...</div>
                  <div className="text-brand-text-primary/90 font-medium">Agreement is governed... (Policy)</div>
                </div>
              </div>
            </div>
          </div>
        )
      },
      {
        title: "Module 3: Sentence Mechanics",
        subtitle: "Resolving Modifier Ambiguity",
        content: (
          <div className="space-y-4 text-xs font-light leading-relaxed">
            <p>Mechanical errors and sentence structures are heavily parsed. Modifier ambiguity occurs when relative clauses could apply to one or multiple elements in a list.</p>
            <div className="bg-brand-bg-secondary p-3 rounded-xl border border-brand-text-primary/30 space-y-2">
              <p className="text-brand-error/90 font-mono text-[10px] leading-normal">Ambiguous Clause:<br/>"The Company shall not hire employees or independent contractors who reside in California."</p>
              <p className="text-[10px] text-brand-text-secondary">Does "who reside in California" modify employees, or only independent contractors?</p>
              <p className="text-brand-text-primary/90 font-mono text-[10px] leading-normal">Option A (Both):<br/>"The Company shall not hire any individual residing in California, whether as an employee or as an independent contractor."</p>
            </div>
            
            <div className="font-semibold text-brand-text-primary">3.2 Tabulation Rules</div>
            <p>Use numbered lists for dense provisions. The introductory phrase must flow grammatically into every tabulated item.</p>
            
            <div className="border border-brand-text-primary/30 rounded-xl p-3 bg-brand-bg-secondary space-y-2">
              <p className="font-bold text-[10px] uppercase tracking-wider text-brand-accent">Modern Tabulated Clause:</p>
              <p className="text-[10.5px] leading-relaxed">
                The Receiving Party may disclose Confidential Information to its representatives who:<br/>
                1. need to know the information to evaluate the Transaction;<br/>
                2. are informed of its confidential nature; and<br/>
                3. are bound by written confidentiality obligations at least as restrictive...
              </p>
            </div>
          </div>
        )
      },
      {
        title: "Module 4: Boilerplate Clauses",
        subtitle: "Indemnification & IP Transfer",
        content: (
          <div className="space-y-4 text-xs font-light leading-relaxed">
            <p>Operational clarity is everything. Know the exact meanings in modern risk allocation:</p>
            <div className="bg-brand-bg-secondary p-2.5 rounded-xl border border-brand-text-primary/30 text-[10.5px] space-y-1">
              <p><strong>Indemnify:</strong> Compensate for direct losses/judgments.</p>
              <p><strong>Defend:</strong> Pay legal fees and handle active third-party lawsuits.</p>
              <p><strong>Hold Harmless:</strong> Release the other party from liability between signatories.</p>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-brand-text-primary text-[10.5px]">Template: Indemnification & Cap</span>
                <button
                  onClick={() => handleCopySnippet(0, `Section 8.1 Indemnification. The Consultant shall indemnify, defend, and hold harmless the Client and its officers against all third-party claims, losses, and reasonable legal fees arising out of the Consultant's gross negligence or willful misconduct in performing the Services.\n\nSection 8.2 Limitation of Liability.\n(a) Waiver. Neither party is liable to the other for any indirect, incidental, or consequential damages arising out of this Agreement, even if advised of the possibility of such damages.\n(b) Cap. Except for breaches of Section 5 (Confidentiality), each party's aggregate liability under this Agreement is capped at the total fees paid by the Client to the Consultant in the 12 months preceding the claim.`)}
                  className="px-2 py-0.5 border border-brand-accent/30 text-brand-accent text-[9px] rounded-xl hover:bg-brand-accent/10 transition-colors uppercase font-mono"
                >
                  {copiedSnippetIndex === 0 ? "Copied!" : "Quick Copy"}
                </button>
              </div>
              <pre className="bg-brand-bg-secondary p-2.5 rounded-xl border border-brand-text-primary/30 font-mono text-[9px] text-brand-text-secondary leading-relaxed overflow-x-auto">
{`Section 8.1 Indemnification. The Consultant shall indemnify, defend, and hold harmless...
Section 8.2 Limitation of Liability.
(a) Waiver. Neither party is liable to...
(b) Cap. Aggregate liability is capped at...`}
              </pre>
            </div>
 
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-brand-text-primary text-[10.5px]">Template: IP Assignment</span>
                <button
                  onClick={() => handleCopySnippet(1, `Section 6.1 Work Product Ownership. The Developer hereby assigns to the Client all right, title, and interest in and to the Work Product, including all intellectual property rights. The Developer shall cooperate with the Client and execute any additional documents necessary to perfect the Client's ownership of the Work Product.`)}
                  className="px-2 py-0.5 border border-brand-accent/30 text-brand-accent text-[9px] rounded-xl hover:bg-brand-accent/10 transition-colors uppercase font-mono"
                >
                  {copiedSnippetIndex === 1 ? "Copied!" : "Quick Copy"}
                </button>
              </div>
              <pre className="bg-brand-bg-secondary p-2.5 rounded-xl border border-brand-text-primary/30 font-mono text-[9px] text-brand-text-secondary leading-relaxed overflow-x-auto">
{`Section 6.1 Work Product Ownership. The Developer hereby assigns to the Client all right, title, and interest...`}
              </pre>
            </div>
          </div>
        )
      },
      {
        title: "Module 5: Strategic Interpretation",
        subtitle: "Canons of Construction",
        content: (
          <div className="space-y-4 text-xs font-light leading-relaxed">
            <p>Contracts are interpreted using established judicial canons. Write defensively to avoid the common law traps.</p>
            <div className="space-y-2.5">
              <p><strong>Ejusdem Generis ("Of the same kind"):</strong> General terms following a list are limited to similar items.</p>
              <div className="bg-brand-bg-secondary p-2.5 rounded-xl border border-brand-text-primary/30 text-[10px]">
                <span className="text-brand-error font-mono">Trap:</span> "Tenant shall not keep dogs, cats, birds, or other animals." (Tiger might be excluded by a court as not a household pet).<br/>
                <span className="text-brand-success font-mono">Fix:</span> "...or other animals, whether domestic or wild."
              </div>
              
              <p><strong>Expressio Unius ("Exclusion of others"):</strong> Mentioning one implies excluding the other.</p>
              <div className="bg-brand-bg-secondary p-2.5 rounded-xl border border-brand-text-primary/30 text-[10px]">
                <span className="text-brand-error font-mono">Trap:</span> "Seller represents that IP does not infringe US patents." (Implies no representation for foreign patents or trademarks).<br/>
                <span className="text-brand-success font-mono">Fix:</span> "...any intellectual property right globally."
              </div>
            </div>
          </div>
        )
      }
    ];
 
    const checklist = [
      "No Misused \"Shall\": Is every shall associated with a party's duty? (Declarations to present tense is/means)",
      "No Legalese: Have you removed heretofore, said, same, whereas?",
      "Tabulation Flow: Do all itemized lists flow grammatically?",
      "Explicit IP Assigns: Does it use \"hereby assigns\"?",
      "Balanced Indemnity: Is indemnity coupled with a cap/waiver?"
    ];
 
    return (
      <div className="animate-fadeIn space-y-6">
        {/* Antigravity Audit Checklist */}
        <div className="bg-brand-bg-secondary border border-brand-text-primary/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center space-x-2 text-brand-accent">
            <CheckCircleIcon className="w-5.5 h-5.5 text-brand-accent" />
            <h4 className="text-xs uppercase font-mono tracking-wider font-bold">Audit Checklist</h4>
          </div>
          <p className="text-[11px] text-brand-text-secondary font-light leading-relaxed">
            Audit your active draft against the Antigravity criteria:
          </p>
          <div className="space-y-2">
            {checklist.map((item, idx) => (
              <label key={idx} className="flex items-start space-x-2.5 text-[10.5px] font-light text-brand-text-primary/90 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checklistChecked[idx]}
                  onChange={() => {
                    const next = [...checklistChecked];
                    next[idx] = !next[idx];
                    setChecklistChecked(next);
                  }}
                  className="mt-0.5 rounded-xl border-brand-text-primary/30 text-brand-accent bg-brand-bg-secondary focus:ring-brand-accent cursor-pointer h-3.5 w-3.5"
                />
                <span className={`leading-snug transition-all ${checklistChecked[idx] ? 'line-through text-brand-text-secondary/50' : 'group-hover:text-brand-accent'}`}>
                  {item}
                </span>
              </label>
            ))}
          </div>
        </div>
 
        {/* Modules Accordion */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-brand-accent mb-2">
            <div className="h-px w-4 bg-brand-accent"></div>
            <span className="text-[10px] font-mono uppercase tracking-widest">Masterclass Modules</span>
          </div>
          
          <div className="space-y-2.5">
            {modules.map((m, idx) => {
              const isOpen = openModule === idx;
              return (
                <div key={idx} className="border border-brand-text-primary/30 rounded-xl overflow-hidden bg-brand-bg-secondary transition-all">
                  <button
                    onClick={() => setOpenModule(isOpen ? null : idx)}
                    className="w-full p-3.5 flex justify-between items-center text-left hover:bg-brand-accent/5 transition-all"
                  >
                    <div>
                      <p className={`text-[11px] font-bold tracking-wide uppercase font-serif ${isOpen ? 'text-brand-accent' : 'text-brand-text-primary'}`}>{m.title}</p>
                      <p className="text-[9px] text-brand-text-secondary/70 italic mt-0.5">{m.subtitle}</p>
                    </div>
                    <span className="text-brand-accent/70 text-xs font-mono">{isOpen ? "[-]" : "[+]"}</span>
                  </button>
                  {isOpen && (
                    <div className="p-4 border-t border-brand-text-primary/30 bg-brand-bg-primary/20 animate-fadeIn text-brand-text-secondary leading-relaxed">
                      {m.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Guard index so RoomStepper never gets -1
  const stepIndex = currentStepIndex < 0 ? 0 : currentStepIndex;

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full h-full overflow-hidden animate-fadeIn relative p-3 sm:p-4 md:p-5">
      <SurfacePattern variant="grid" className="opacity-30" />

      <div className="relative z-10 flex flex-col flex-1 min-h-0 w-full gap-3 sm:gap-4">
      <RoomBanner
        image={draftingPen}
        dense
        eyebrow={`${modeDisplay} · write`}
        title="Drafting studio"
        subtitle="Draft it. Score it. File it."
        trailing={<RoomStepper steps={steps} currentIndex={stepIndex} />}
        className="flex-shrink-0"
      />

      <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 flex-1 min-h-0 overflow-hidden relative">
        
        {/* Main Interface */}
        {stage === 'task_selection' || stage === 'fact_generation_loading' ? (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <div className="max-w-3xl mx-auto space-y-4 py-2 pb-8">
                    {stage === 'task_selection' ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {[
                            { label: 'Plaints', image: courtroomLuxury },
                            { label: 'Petitions', image: judgeGavel },
                            { label: 'Contracts', image: trialBinderDesk },
                            { label: 'Notices', image: counselScales },
                          ].map((t) => (
                            <PhotoTile
                              key={t.label}
                              title={t.label}
                              image={t.image}
                              compact
                              badge="Instrument"
                            />
                          ))}
                        </div>

                        {studioError && (
                          <div
                            role="alert"
                            className="border border-brand-border bg-brand-bg-secondary p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-mono uppercase tracking-widest text-brand-text-secondary mb-1">
                                Scenario generation failed
                              </p>
                              <p className="text-[13px] text-brand-text-primary leading-relaxed">{studioError.message}</p>
                            </div>
                            {lastFailedTaskId && (
                              <Button
                                variant="primary"
                                size="sm"
                                className="uppercase tracking-wider text-[10px] rounded-xl flex-shrink-0"
                                onClick={() => void handleTaskSelectionAndFactGeneration(lastFailedTaskId)}
                                disabled={isLoading}
                              >
                                Retry
                              </Button>
                            )}
                          </div>
                        )}

                        <PatternPanel pattern="dots" className="p-5 sm:p-8">
                          <div className="space-y-6">
                            <div className="text-center sm:text-left">
                              <div className="inline-flex items-center gap-2 mb-2">
                                <ClipboardIcon className="w-5 h-5 text-brand-text-primary/70" />
                                <h3 className="text-[1.05rem] sm:text-lg font-serif font-semibold text-brand-text-primary">
                                  Choose a practice instrument
                                </h3>
                              </div>
                              <p className="text-[13px] text-brand-text-secondary">
                                Select from the docket. Facts generate next; then you draft.
                              </p>
                            </div>

                            {!practiceMode ? (
                              <EmptyState
                                icon={<QuillIcon />}
                                title="No practice mode selected"
                                description="Open Home and choose Indian or International mode to load drafting instruments."
                              />
                            ) : availableTasks.length === 0 ? (
                              <EmptyState
                                icon={<ClipboardIcon className="w-10 h-10" />}
                                title="No instruments in this docket"
                                description="No drafting tasks are configured for this jurisdiction yet."
                              />
                            ) : (
                              <SelectInput
                                options={groupedTaskOptionsForSelect}
                                onChange={(e) => {
                                  if (e.target.value && !e.target.value.startsWith('__optgroup__')) {
                                    void handleTaskSelectionAndFactGeneration(e.target.value);
                                  }
                                }}
                                placeholder="Browse legal instruments..."
                                value={currentTask?.id || lastFailedTaskId || ''}
                                disabled={isLoading}
                                className="py-3.5"
                              />
                            )}
                          </div>
                        </PatternPanel>
                      </>
                    ) : (
                        <PatternPanel pattern="lines" className="p-10 text-center max-w-xl mx-auto">
                            <LoadingSpinner
                              text="Generating facts for your instrument..."
                              size="lg"
                              spinnerColor="text-brand-text-primary/70"
                              textColor="text-brand-text-secondary"
                            />
                            <p className="text-[12px] text-brand-text-secondary mt-4 uppercase tracking-wide">
                              Building the scenario
                            </p>
                            <p className="text-[11px] text-brand-text-secondary/70 mt-2">
                              This usually takes a few seconds. Stay on this screen.
                            </p>
                        </PatternPanel>
                    )}
                </div>
            </div>
        ) : (
            <>
                {/* Reference Sidebar (Left/Collapsible) */}
                <aside className={`flex-shrink-0 transition-all duration-500 ease-in-out border border-brand-text-primary/30 bg-brand-bg-primary rounded-xl overflow-hidden flex flex-col
                    ${isFocusMode ? 'hidden' : ''}
                    ${isRefPanelOpen ? 'w-full lg:w-[380px] h-full lg:h-auto' : 'w-full lg:w-16 h-10 lg:h-auto'}
                `}>
                    {/* Sidebar Header / Toggle */}
                    <div className="p-2 lg:p-3 border-b border-brand-text-primary/30 bg-brand-bg-secondary flex items-center justify-between">
                        {isRefPanelOpen ? (
                            <div className="flex items-center space-x-2 ml-1 lg:ml-2">
                                <span className="text-[10px] lg:text-[11px] font-mono font-bold text-brand-accent tracking-widest uppercase">Reference Bank</span>
                            </div>
                        ) : (
                            <span className="text-[9px] font-mono text-brand-text-secondary/60 uppercase tracking-wider lg:hidden">Tap to open references</span>
                        )}
                        <button 
                            onClick={() => setIsRefPanelOpen(!isRefPanelOpen)}
                            className="p-1.5 lg:p-2 rounded-xl hover:bg-brand-bg-secondary text-brand-text-secondary hover:text-brand-accent transition-all lg:mx-0"
                            title={isRefPanelOpen ? "Minimize" : "Expand"}
                        >
                            {isRefPanelOpen ? <XMarkIcon className="w-4 h-4 lg:w-5 lg:h-5" /> : <Bars3Icon className="w-4 h-4 lg:w-5 lg:h-5" />}
                        </button>
                    </div>

                    {isRefPanelOpen && (
                        <>
                            {/* Tabs */}
                            <div className="flex border-b border-brand-text-primary/30 bg-brand-bg-secondary">
                                <button 
                                    onClick={() => setActiveRefTab('facts')}
                                    className={`flex-1 flex flex-col items-center py-3 px-1 transition-all border-b-2 
                                        ${activeRefTab === 'facts' ? 'border-brand-accent bg-brand-bg-secondary text-brand-text-primary' : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg-secondary/50'}`}
                                >
                                    <ClipboardIcon className={`w-4 h-4 mb-1 ${activeRefTab === 'facts' ? 'text-brand-accent' : ''}`} />
                                    <span className="text-[9px] font-mono uppercase tracking-tighter">Facts</span>
                                </button>
                                <button 
                                    onClick={() => setActiveRefTab('score')}
                                    className={`flex-1 flex flex-col items-center py-3 px-1 transition-all border-b-2 relative
                                        ${activeRefTab === 'score' ? 'border-brand-accent bg-brand-bg-secondary text-brand-text-primary' : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg-secondary/50'}`}
                                >
                                    <ChartBarIcon className={`w-4 h-4 mb-1 ${activeRefTab === 'score' ? 'text-brand-accent' : ''}`} />
                                    <span className="text-[9px] font-mono uppercase tracking-tighter">Score</span>
                                    {scoringResult && (
                                        <span className={`absolute -top-1 -right-1 text-[8px] font-bold font-mono w-5 h-5 rounded-xl border border-current flex items-center justify-center
                                            ${scoringResult.verdictTier === 'excellent' ? 'bg-[#1c1914]/[0.08] text-brand-text-primary' :
                                              scoringResult.verdictTier === 'good' ? 'bg-[#1c1914]/[0.06] text-brand-text-primary' :
                                              scoringResult.verdictTier === 'fair' ? 'bg-[#1c1914]/[0.04] text-brand-text-secondary' :
                                              'bg-brand-error/15 text-brand-error'}
                                        `}>
                                            {Math.round(scoringResult.totalScore)}
                                        </span>
                                    )}
                                </button>
                                <button 
                                    onClick={() => setActiveRefTab('compliance')}
                                    className={`flex-1 flex flex-col items-center py-3 px-1 transition-all border-b-2 relative
                                        ${activeRefTab === 'compliance' ? 'border-brand-accent bg-brand-bg-secondary text-brand-text-primary' : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg-secondary/50'}`}
                                >
                                    <CheckCircleIcon className={`w-4 h-4 mb-1 ${activeRefTab === 'compliance' ? 'text-brand-accent' : ''}`} />
                                    <span className="text-[9px] font-mono uppercase tracking-tighter">Rules</span>
                                    <span className={`absolute -top-1 -right-1 text-[8px] font-bold font-mono w-5 h-5 rounded-xl border border-current flex items-center justify-center
                                        ${complianceMetrics.score === 100 ? 'bg-[#1c1914]/[0.08] text-brand-text-primary' :
                                          complianceMetrics.score >= 60 ? 'bg-[#1c1914]/[0.06] text-brand-text-primary' :
                                          'bg-brand-error/15 text-brand-error'}
                                    `}>
                                        {complianceMetrics.score}
                                    </span>
                                </button>
                                <button 
                                    onClick={() => { if(aiFeedback) setActiveRefTab('feedback'); }}
                                    className={`flex-1 flex flex-col items-center py-3 px-1 transition-all border-b-2 
                                        ${!aiFeedback ? 'opacity-30 cursor-not-allowed' : ''}
                                        ${activeRefTab === 'feedback' ? 'border-brand-accent bg-brand-bg-secondary text-brand-text-primary' : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg-secondary/50'}`}
                                >
                                    <LightbulbIcon className={`w-4 h-4 mb-1 ${activeRefTab === 'feedback' ? 'text-brand-accent' : ''}`} />
                                    <span className="text-[9px] font-mono uppercase tracking-tighter">Mentor</span>
                                </button>
                                <button 
                                    onClick={() => { if(filingProcedure) setActiveRefTab('procedure'); }}
                                    className={`flex-1 flex flex-col items-center py-3 px-1 transition-all border-b-2 
                                        ${!filingProcedure ? 'opacity-30 cursor-not-allowed' : ''}
                                        ${activeRefTab === 'procedure' ? 'border-brand-accent bg-brand-bg-secondary text-brand-text-primary' : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg-secondary/50'}`}
                                >
                                    <BookOpenIcon className={`w-4 h-4 mb-1 ${activeRefTab === 'procedure' ? 'text-brand-accent' : ''}`} />
                                    <span className="text-[9px] font-mono uppercase tracking-tighter">Procedure</span>
                                </button>
                                <button 
                                    onClick={() => setActiveRefTab('course')}
                                    className={`flex-1 flex flex-col items-center py-3 px-1 transition-all border-b-2 
                                        ${activeRefTab === 'course' ? 'border-brand-accent bg-brand-bg-secondary text-brand-text-primary' : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg-secondary/50'}`}
                                >
                                    <AcademicCapIcon className={`w-4 h-4 mb-1 ${activeRefTab === 'course' ? 'text-brand-accent' : ''}`} />
                                    <span className="text-[9px] font-mono uppercase tracking-tighter">Syllabus</span>
                                </button>
                                <button 
                                    onClick={() => setActiveRefTab('history')}
                                    className={`flex-1 flex flex-col items-center py-3 px-1 transition-all border-b-2 
                                        ${activeRefTab === 'history' ? 'border-brand-accent bg-brand-bg-secondary text-brand-text-primary' : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg-secondary/50'}`}
                                >
                                    <HistoryIcon className={`w-4 h-4 mb-1 ${activeRefTab === 'history' ? 'text-brand-accent' : ''}`} />
                                    <span className="text-[9px] font-mono uppercase tracking-tighter">History</span>
                                </button>
                            </div>

                            {/* Tab Content */}
                            <div ref={scrollRef} className="flex-grow p-5 overflow-y-auto custom-scrollbar bg-brand-bg-primary">
                                {activeRefTab === 'facts' && (
                                    <div className="animate-fadeIn space-y-4">
                                        <div className="flex items-center space-x-2 text-brand-accent mb-2">
                                            <div className="h-px w-4 bg-brand-accent"></div>
                                            <span className="text-[10px] font-mono uppercase tracking-widest">{currentTask?.type} Case Facts</span>
                                        </div>
                                        {generatedFacts ? (
                                            <div className="font-light leading-relaxed text-[13px] text-brand-text-primary/90 selection:bg-[#1c1914]/[0.08] prose-sm">
                                                {renderLegalMarkdown(generatedFacts)}
                                            </div>
                                        ) : (
                                            <EmptyState
                                                icon={<ClipboardIcon className="w-10 h-10" />}
                                                title="Facts not loaded"
                                                description="Scenario facts will appear here after generation. If generation failed, return to Scenario and retry."
                                                className="py-8"
                                            />
                                        )}
                                    </div>
                                )}

                                {activeRefTab === 'score' && (
                                    <div className="animate-fadeIn space-y-4">
                                        <div className="flex items-center space-x-2 text-brand-accent mb-2">
                                            <div className="h-px w-4 bg-brand-accent"></div>
                                            <span className="text-[10px] font-mono uppercase tracking-widest">Legal Conformance Score</span>
                                        </div>
                                        {scoringResult ? (
                                            <ScoreCard result={scoringResult} />
                                        ) : (
                                            <EmptyState
                                                icon={<ChartBarIcon className="w-10 h-10" />}
                                                title="Score pending"
                                                description="Write at least 50 characters to see live conformance metrics. Form-based stylometry only; not a legal quality judgment."
                                                className="py-8"
                                            />
                                        )}
                                    </div>
                                )}

                                {activeRefTab === 'compliance' && (
                                    <div className="animate-fadeIn space-y-4">
                                        <div className="flex items-center space-x-2 text-brand-accent mb-2">
                                            <div className="h-px w-4 bg-brand-accent"></div>
                                            <span className="text-[10px] font-mono uppercase tracking-widest">Pleading Rules Guidance</span>
                                        </div>

                                        {/* Score card summary */}
                                        <div className="border border-brand-text-primary/30 p-4 bg-brand-bg-secondary font-mono flex flex-col items-center justify-center text-center">
                                            <span className="text-[9px] text-brand-text-secondary uppercase tracking-widest mb-1">Pleadings Compliance</span>
                                            <span className={`text-4xl font-bold ${
                                                complianceMetrics.score === 100 ? 'text-brand-text-primary' :
                                                complianceMetrics.score >= 60 ? 'text-brand-text-primary' :
                                                'text-brand-error'
                                            }`}>
                                                {complianceMetrics.score}%
                                            </span>
                                            <span className={`text-[10px] uppercase font-bold tracking-widest mt-2 px-2 py-0.5 border ${
                                                complianceMetrics.score === 100 ? 'border-brand-border-light text-brand-text-primary bg-[#1c1914]/[0.06]' :
                                                complianceMetrics.score >= 60 ? 'border-brand-border text-brand-text-primary bg-[#1c1914]/[0.04]' :
                                                'border-brand-error/30 text-brand-error bg-brand-error/10'
                                            }`}>
                                                {complianceMetrics.verdict}
                                            </span>
                                        </div>

                                        {/* Rules checklist */}
                                        <div className="space-y-3 font-mono text-xs">
                                            {complianceMetrics.checks.map((check) => (
                                                <div 
                                                    key={check.id} 
                                                    className={`p-3 border text-left transition-all ${
                                                        check.satisfied 
                                                            ? 'border-brand-border bg-[#1c1914]/[0.04] text-brand-text-primary' 
                                                            : 'border-brand-text-primary/10 text-brand-text-secondary bg-black/10'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className={`font-bold tracking-wide ${check.satisfied ? 'text-brand-text-primary' : 'text-brand-text-secondary'}`}>
                                                            {check.satisfied ? '✓' : '✗'} {check.name}
                                                        </span>
                                                        <span className={`text-[8px] uppercase px-1 py-0.5 border leading-none ${
                                                            check.satisfied 
                                                                ? 'border-brand-border text-brand-text-primary' 
                                                                : 'border-brand-text-primary/20 text-brand-text-secondary'
                                                        }`}>
                                                            {check.satisfied ? 'PASSED' : 'MISSING'}
                                                        </span>
                                                    </div>
                                                    {!check.satisfied && (
                                                        <p className="text-[10px] text-brand-text-secondary leading-relaxed font-sans pl-3 border-l border-brand-border">
                                                            {check.tip}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeRefTab === 'feedback' && (
                                    <div className="animate-fadeIn space-y-4">
                                        <div className="flex items-center space-x-2 text-brand-accent mb-2">
                                            <div className="h-px w-4 bg-brand-accent"></div>
                                            <span className="text-[10px] font-mono uppercase tracking-widest">AI Mentor Guidance</span>
                                        </div>
                                        {isLoadingAiInteraction && activeRefTab === 'feedback' ? (
                                            <div className="flex flex-col items-center justify-center py-10 space-y-4">
                                                <LoadingSpinner size="sm" spinnerColor="text-brand-text-primary/70" />
                                                <span className="text-[10px] font-mono text-brand-text-secondary uppercase">Analysing your draft...</span>
                                            </div>
                                        ) : studioError?.scope === 'review' && !aiFeedback ? (
                                            <EmptyState
                                                icon={<LightbulbIcon className="w-10 h-10" />}
                                                title="Mentor review failed"
                                                description={studioError.message}
                                                actionLabel="Retry review"
                                                onAction={() => void handleSubmitForReview()}
                                                className="py-8"
                                            />
                                        ) : aiFeedback ? (
                                            <div>
                                                <div className="font-light leading-relaxed text-[13px] text-brand-text-primary/90 selection:bg-[#1c1914]/[0.08] prose-sm">
                                                    {renderLegalMarkdown(aiFeedback)}
                                                </div>
                                                <div className="mt-4 pt-2 border-t border-brand-text-primary/30">
                                                    <button
                                                        onClick={() => void handleSpeak(aiFeedback)}
                                                        className="px-2.5 py-1 text-[10px] border border-brand-text-primary/30 rounded-xl bg-brand-bg-secondary hover:bg-brand-bg-primary text-brand-text-primary transition-all cursor-pointer font-mono uppercase"
                                                        title="Speak this feedback"
                                                    >
                                                        [ Read Aloud ]
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <EmptyState
                                                icon={<LightbulbIcon className="w-10 h-10" />}
                                                title="No mentor review yet"
                                                description="Submit a draft of at least 10 characters from the editor bar to receive structured feedback."
                                                className="py-8"
                                            />
                                        )}
                                    </div>
                                )}

                                {activeRefTab === 'procedure' && (
                                    <div className="animate-fadeIn space-y-4">
                                        <div className="flex items-center space-x-2 text-brand-accent mb-2">
                                            <div className="h-px w-4 bg-brand-accent"></div>
                                            <span className="text-[10px] font-mono uppercase tracking-widest">Filing Protocol</span>
                                        </div>
                                        {isLoadingAiInteraction && activeRefTab === 'procedure' ? (
                                            <div className="flex flex-col items-center justify-center py-10 space-y-4">
                                                <LoadingSpinner size="sm" spinnerColor="text-brand-text-primary/70" />
                                                <span className="text-[10px] font-mono text-brand-text-secondary uppercase">Loading filing workflow...</span>
                                            </div>
                                        ) : studioError?.scope === 'filing' && !filingProcedure ? (
                                            <EmptyState
                                                icon={<BookOpenIcon className="w-10 h-10" />}
                                                title="Filing guidance failed"
                                                description={studioError.message}
                                                actionLabel="Retry filing info"
                                                onAction={() => void handleGetFilingInfo()}
                                                className="py-8"
                                            />
                                        ) : filingProcedure ? (
                                            <div className="font-light leading-relaxed text-[13px] text-brand-text-primary/90 selection:bg-[#1c1914]/[0.08] prose-sm">
                                                {renderLegalMarkdown(filingProcedure)}
                                                <div className="mt-4 pt-2 border-t border-brand-text-primary/30">
                                                    <button
                                                        onClick={() => void handleSpeak(filingProcedure)}
                                                        className="px-2.5 py-1 text-[10px] border border-brand-text-primary/30 rounded-xl bg-brand-bg-secondary hover:bg-brand-bg-primary text-brand-text-primary transition-all cursor-pointer font-mono uppercase"
                                                        title="Speak this protocol"
                                                    >
                                                        [ Read Aloud ]
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <EmptyState
                                                icon={<BookOpenIcon className="w-10 h-10" />}
                                                title="Filing info not requested"
                                                description="After mentor review, use Filing in the editor bar to load a cautious procedural workflow."
                                                className="py-8"
                                            />
                                        )}
                                    </div>
                                )}

                                {activeRefTab === 'course' && renderSyllabus()}

                                {activeRefTab === 'history' && (
                                    <div className="animate-fadeIn space-y-4">
                                        <div className="flex justify-between items-center border-b border-brand-text-primary/30 pb-2">
                                            <span className="text-[10px] font-mono uppercase tracking-widest text-brand-accent">Snapshots ({snapshots.length})</span>
                                            <Button size="sm" variant="primary" onClick={saveSnapshot} className="px-2 py-1 text-[9px] font-mono rounded-xl uppercase tracking-wider">
                                                [ Snapshot ]
                                            </Button>
                                        </div>
                                        
                                        {snapshots.length === 0 ? (
                                            <EmptyState
                                                icon={<HistoryIcon className="w-10 h-10" />}
                                                title="No snapshots yet"
                                                description="Use Snapshot above, Cmd+S, or the command palette to capture the current draft state."
                                                className="py-6"
                                            />
                                        ) : (
                                            <div className="space-y-3">
                                                {snapshots.map((snap) => (
                                                    <div key={snap.id} className="bg-brand-bg-secondary border border-brand-text-primary/30 p-3 rounded-xl flex flex-col space-y-2 text-left">
                                                        <div className="flex justify-between items-start">
                                                            <span className="text-[10px] font-mono text-brand-text-primary font-semibold">{snap.timestamp}</span>
                                                            <span className="text-[9px] font-mono text-brand-text-secondary/60">({snap.text.length} chars)</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    if (window.confirm("Are you sure you want to restore this snapshot? This will replace your current draft content.")) {
                                                                        setUserDraft(snap.text);
                                                                    }
                                                                }}
                                                                className="text-[9px] font-mono text-brand-accent hover:text-brand-text-primary transition-colors border border-brand-accent/20 px-2 py-1 uppercase"
                                                            >
                                                                Restore
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedSnapshotForDiff(snap.id);
                                                                    setIsDiffModalOpen(true);
                                                                }}
                                                                className="text-[9px] font-mono text-brand-accent hover:text-brand-text-primary transition-colors border border-brand-accent/20 px-2 py-1 uppercase"
                                                            >
                                                                Compare Diff
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const key = `draft-snapshots-${currentTask?.id}`;
                                                                    const updated = snapshots.filter(s => s.id !== snap.id);
                                                                    setSnapshots(updated);
                                                                    if (currentTask) saveGenericState(key, updated);
                                                                }}
                                                                className="text-[9px] font-mono text-brand-error hover:text-brand-error transition-colors border border-brand-error/25 px-2 py-1 uppercase ml-auto"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </aside>

                {/* Editor Area (Right/Main) */}
                <main className="flex-grow flex flex-col min-h-[300px] lg:min-h-0 overflow-hidden bg-brand-bg-primary border border-brand-text-primary/30 rounded-xl relative">
                    
                    {/* Editor Toolbar */}
                    <div className="flex-shrink-0 p-2.5 lg:p-4 border-b border-brand-text-primary/30 bg-brand-bg-secondary flex items-center justify-between z-10 gap-2">
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[8px] lg:text-[9px] font-mono text-brand-text-secondary uppercase tracking-[0.2em] mb-0.5">Editor</span>
                            <h3 className="text-xs lg:text-sm font-serif font-semibold text-brand-text-primary truncate">{currentTask?.title}</h3>
                        </div>

                        <div className="flex items-center space-x-3">
                            {sectionOptions.length > 0 && (
                                <div className="hidden sm:block">
                                    <SelectInput
                                        options={[{ value: "", label: "Full Draft" }, ...sectionOptions]}
                                        value={selectedSectionId || ""}
                                        onChange={(e) => setSelectedSectionId(e.target.value || null)}
                                        containerClassName="mb-0 border-brand-text-primary/30 py-1.5 text-[11px] h-8"
                                    />
                                </div>
                            )}
                            <Button 
                                onClick={() => setIsFocusMode(!isFocusMode)}
                                variant="outline"
                                size="sm"
                                className="text-[8px] lg:text-[10px] h-7 lg:h-8 px-2 lg:px-3 border border-brand-text-primary/30 hover:border-brand-text-primary text-brand-text-secondary rounded-xl flex-shrink-0"
                            >
                                {isFocusMode ? 'Exit Focus' : 'Focus Mode'}
                            </Button>
                            <Button onClick={resetTaskStateFull} variant="ghost" size="sm" className="text-[8px] lg:text-[10px] h-7 lg:h-8 px-2 lg:px-3 border border-brand-text-primary/30 hover:border-brand-text-primary text-brand-text-secondary rounded-xl flex-shrink-0 hidden sm:flex">
                                Reset
                            </Button>
                        </div>
                    </div>

                        <div className="flex-grow relative bg-brand-bg-primary">
                        {stage === 'task_details_display' ? (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 lg:p-8 text-center bg-brand-bg-primary/95 group">
                                <Card className="max-w-md p-5 lg:p-8 border-brand-text-primary/30 bg-brand-bg-secondary transition-transform duration-500 overflow-hidden">
                                    <div className="relative -mx-5 -mt-5 lg:-mx-8 lg:-mt-8 mb-4 h-24 overflow-hidden border-b border-brand-text-primary/20">
                                        <img src={trialBinderDesk} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-brand-bg-secondary via-brand-bg-secondary/40 to-transparent" />
                                    </div>
                                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-brand-bg-primary rounded-xl flex items-center justify-center mx-auto mb-3 lg:mb-4 border border-brand-text-primary/30">
                                        <QuillIcon className="w-5 h-5 lg:w-6 lg:h-6 text-brand-text-primary/80" />
                                    </div>
                                    <h4 className="text-base lg:text-lg font-serif font-bold text-brand-text-primary mb-1.5 lg:mb-2">Scenario ready</h4>
                                    <p className="text-xs lg:text-sm text-brand-text-secondary font-light mb-4 lg:mb-6 leading-relaxed">
                                        Review the <span className="text-brand-text-primary font-medium">Facts</span> in the reference panel, then open the editor to draft your <span className="text-brand-text-primary font-medium">{currentTask?.type}</span>.
                                    </p>
                                    <Button onClick={handleProceedToDrafting} variant="primary" fullWidth size="md" className="uppercase tracking-wider text-[10px] lg:text-xs rounded-xl">
                                        Commence drafting
                                    </Button>
                                </Card>
                            </div>
                        ) : null}

                        <textarea
                            value={userDraft}
                            onChange={(e) => setUserDraft(e.target.value)}
                            placeholder={`Start drafting your ${currentTask?.type}...\n\n[Focus: ${currentTask?.objective}]`}
                            className="w-full h-full p-4 sm:p-6 lg:p-12 bg-transparent text-brand-text-primary resize-none outline-none custom-scrollbar placeholder-brand-text-secondary/20 text-sm sm:text-base lg:text-lg leading-relaxed lg:leading-loose font-light font-sans selection:bg-brand-accent/20 transition-all"
                            disabled={isLoading || stage === 'task_details_display'}
                            spellCheck="true"
                        />
                    </div>

                    {/* Bottom Command Bar */}
                    <div className="flex-shrink-0 p-2.5 lg:p-4 border-t border-brand-text-primary/30 bg-brand-bg-secondary z-10">
                        {/* Status row */}
                        <div className="flex items-center justify-between mb-2 lg:mb-0 lg:inline-flex lg:mr-4">
                            <div className="flex items-center space-x-3">
                                <div className="flex items-center space-x-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-xl ${userDraft.length > 0 ? 'bg-white' : 'bg-brand-text-secondary/30'}`}></div>
                                    <span className="text-[9px] lg:text-[10px] font-mono text-brand-text-secondary">{userDraft.length} chars</span>
                                </div>
                                <span className={`text-[9px] font-mono text-brand-text-secondary transition-opacity duration-300 ${showAutoSave ? 'opacity-100' : 'opacity-0'}`}>
                                    [Saved]
                                </span>
                            </div>
                            {scoringResult && (
                                <button
                                    onClick={() => { setActiveRefTab('score'); if(!isRefPanelOpen) setIsRefPanelOpen(true); }}
                                    className={`flex items-center space-x-1 px-1.5 py-0.5 rounded-xl border transition-all cursor-pointer
                                        ${scoringResult.verdictTier === 'excellent' ? 'border-brand-border-light bg-[#1c1914]/[0.06] text-brand-text-primary' :
                                          scoringResult.verdictTier === 'good' ? 'border-brand-border bg-[#1c1914]/[0.04] text-brand-text-primary' :
                                          scoringResult.verdictTier === 'fair' ? 'border-brand-border bg-transparent text-brand-text-secondary' :
                                          'border-brand-error/30 bg-brand-error/10 text-brand-error'}
                                    `}
                                    title="View full scoring breakdown"
                                >
                                    <ChartBarIcon className="w-3 h-3" />
                                    <span className="text-[9px] font-mono font-bold">{Math.round(scoringResult.totalScore)}</span>
                                </button>
                            )}
                        </div>
                        {studioError && (
                          <div role="alert" className="mb-2 text-[11px] text-brand-text-secondary border border-white/10 bg-black/20 px-2.5 py-1.5 rounded-xl">
                            {studioError.message}
                          </div>
                        )}
                        {/* Action buttons row */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                if (sttAvailable === false && !isRecording) {
                                  setGlobalError('Voice transcription is unavailable (SARVAM_API_KEY not configured). Type your draft instead.');
                                  return;
                                }
                                if (isRecording) stopRecording();
                                else void startRecording();
                              }}
                              disabled={isLoading || stage === 'task_details_display'}
                              className={`w-8 h-8 lg:w-10 lg:h-10 flex-shrink-0 rounded-xl border flex items-center justify-center transition-all focus:outline-none disabled:opacity-50
                                ${isRecording
                                  ? 'bg-brand-error/20 border-brand-error text-brand-error animate-pulse'
                                  : sttAvailable === false
                                    ? 'bg-brand-bg-secondary border-brand-text-primary/15 text-brand-text-secondary/50'
                                    : 'bg-brand-bg-secondary border-brand-text-primary/30 text-brand-text-primary hover:bg-brand-bg-primary'
                                }`}
                              title={
                                isRecording
                                  ? 'Stop Recording'
                                  : sttAvailable === false
                                    ? 'Voice transcription unavailable (server key not configured)'
                                    : 'Speak using voice transcription'
                              }
                            >
                              {isRecording ? (
                                <svg className="w-4 h-4 lg:w-5 lg:h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                              ) : (
                                <svg className="w-4 h-4 lg:w-5 lg:h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>
                              )}
                            </button>

                            <Button 
                                onClick={() => {
                                    void navigator.clipboard.writeText(userDraft);
                                    setIsCopied(true);
                                    setTimeout(() => setIsCopied(false), 2000);
                                }}
                                variant="ghost"
                                size="sm"
                                disabled={!userDraft}
                                className="text-[8px] lg:text-[10px] border border-brand-text-primary/30 text-brand-text-secondary hover:text-brand-text-primary rounded-xl uppercase tracking-wider h-8 lg:h-10 px-2 lg:px-4"
                            >
                                {isCopied ? 'Copied!' : 'Copy'}
                            </Button>

                            <Button
                                onClick={handleExportDraft}
                                variant="ghost"
                                size="sm"
                                disabled={!userDraft.trim() || stage === 'task_details_display'}
                                className="text-[8px] lg:text-[10px] border border-brand-text-primary/30 text-brand-text-secondary hover:text-brand-text-primary rounded-xl uppercase tracking-wider h-8 lg:h-10 px-2 lg:px-4"
                            >
                                Export
                            </Button>

                            {stage === 'feedback_review' || stage === 'filing_procedure' ? (
                                <Button 
                                    onClick={() => void handleGetFilingInfo()}
                                    variant="outline"
                                    size="sm"
                                    disabled={isLoading}
                                    className="text-[8px] lg:text-[11px] border-brand-text-primary/30 text-brand-text-secondary hover:text-brand-text-primary rounded-xl uppercase tracking-wider h-8 lg:h-10 px-2 lg:px-4"
                                >
                                    Filing
                                </Button>
                            ) : null}

                            <Button 
                                onClick={() => void handleSubmitForReview()}
                                variant="primary"
                                size="sm"
                                disabled={isLoading || userDraft.length < 10 || stage === 'task_details_display'}
                                className="flex-1 min-w-0 rounded-xl transition-all text-[9px] lg:text-xs uppercase tracking-wider h-8 lg:h-10"
                            >
                                {isLoadingAiInteraction ? 'Reviewing...' : (aiFeedback ? 'Re-Submit' : 'Submit')}
                            </Button>
                        </div>
                    </div>
                </main>
            </>
        )}
      </div>

      <Modal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        title="Draft Version Diff Comparator"
        size="xl"
      >
        {renderDiffViewer()}
      </Modal>
      </div>
    </div>
  );
};

export default DraftingStudioScreen;
