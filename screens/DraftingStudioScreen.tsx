import React, { useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { TrialSimContext } from '../App';
import { DRAFTING_TASKS_INDIAN, DRAFTING_TASKS_INTERNATIONAL } from '../constants';
import { DraftingTask, DraftingStudioStage, ChatMessage as DraftingMessage } from '../types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { QuillIcon } from '../components/icons/QuillIcon';
import { generateDraftingFacts, generateDraftingGuidance, getFilingProcedureInfo } from '../services/geminiService';
import { SelectInput } from '../components/SelectInput';
import { scoreLegalWriting, ScoringResult } from '../services/legalWritingScorer';
import { ScoreCard } from '../components/ScoreCard';
import { Modal } from '../components/Modal';


// Icons
import { Bars3Icon } from '../components/icons/Bars3Icon';
import { XMarkIcon } from '../components/icons/XMarkIcon';

const LightbulbIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6 6 0 1 0-7.432-1.201M12 11.25a6 6 0 1 1 7.432-1.201M12 18c1.38 0 2.5 1.12 2.5 2.5s-1.12 2.5-2.5 2.5-2.5-1.12-2.5-2.5 1.12-2.5 2.5-2.5Z" />
  </svg>
);

const BookOpenIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
  </svg>
);

const ClipboardIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 18 4.5h-2.25a2.25 2.25 0 0 0-2.25-2.25H10.5A2.25 2.25 0 0 0 8.25 4.5H6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 6 18.75h3Z" />
  </svg>
);

const CheckCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const ChartBarIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
  </svg>
);

const AcademicCapIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.57 50.57 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84a50.557 50.557 0 0 0-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
  </svg>
);

const HistoryIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
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
  
  // Reference Panel States
  const [activeRefTab, setActiveRefTab] = useState<'facts' | 'feedback' | 'procedure' | 'score' | 'course' | 'history'>('facts');
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
    localStorage.setItem(key, JSON.stringify(updated));
    
    setShowAutoSave(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => setShowAutoSave(false), 2000);
  }, [currentTask, userDraft, snapshots]);

  useEffect(() => {
    if (currentTask) {
      const key = `draft-snapshots-${currentTask.id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          setSnapshots(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse snapshots", e);
          setSnapshots([]);
        }
      } else {
        setSnapshots([]);
      }
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
    const maxLines = Math.max(oldLines.length, newLines.length);
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
                <th className="p-2 border-r border-brand-text-primary/20.w-12 text-center">Line</th>
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
                  rowBg = 'bg-emerald-500/10';
                  newTextColor = 'text-emerald-400 font-medium';
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

  // Voice Recording state for STT
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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
    setIsLoadingAiInteraction(true);
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
          setUserDraft(prev => prev ? `${prev}\n${data.text}` : data.text);
        }
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('Transcription error:', err);
      setAudioError('Failed to transcribe voice.');
    } finally {
      setIsLoadingAiInteraction(false);
    }
  };

  const handleSpeak = async (text: string) => {
    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'tts',
          text,
          language: 'en-IN',
        }),
      });

      if (!response.ok) {
        throw new Error('Speech synthesis failed');
      }

      const data = await response.json();
      if (data.status !== 'success' || !data.audio) {
        throw new Error('No audio returned');
      }

      // Sarvam returns base64-encoded WAV; decode and play.
      const byteString = atob(data.audio);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      const audioBlob = new Blob([bytes], { type: data.format === 'wav' ? 'audio/wav' : 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();

    } catch (error) {
      console.error('Error playing speech:', error);
    }
  };

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return (
      <ReactMarkdown
        components={{
          strong: ({node, ...props}) => <strong className="text-brand-accent font-semibold" {...props} />,
          em: ({node, ...props}) => <em className="font-serif italic opacity-95" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-4 my-2 space-y-1" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-4 my-2 space-y-1" {...props} />,
          li: ({node, ...props}) => <li className="" {...props} />,
          h1: ({node, ...props}) => <h1 className="text-lg font-serif font-bold text-brand-text-primary mt-4 mb-2" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-base font-serif font-bold text-brand-text-primary mt-4 mb-2" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-sm font-serif font-bold text-brand-text-primary mt-3 mb-1" {...props} />,
          p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
          code: ({node, className, children, ...props}) => {
            const match = /language-(\w+)/.exec(className || '');
            return !match ? (
              <code className="bg-brand-bg-secondary px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
            ) : (
              <pre className="bg-brand-bg-secondary p-2 rounded text-xs font-mono overflow-x-auto"><code {...props}>{children}</code></pre>
            );
          }
        }}
      >
        {text}
      </ReactMarkdown>
    );
  };

  const isLoading = isFactGenerating || isLoadingAiInteraction;

  // Auto-save logic
  useEffect(() => {
    if (currentTask && userDraft) {
      localStorage.setItem(`draft-save-${currentTask.id}`, userDraft);
      setShowAutoSave(true);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => setShowAutoSave(false), 2000);
    }
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [userDraft, currentTask]);

  useEffect(() => {
    if (currentTask) {
        const saved = localStorage.getItem(`draft-save-${currentTask.id}`);
        if (saved && !userDraft) {
            setUserDraft(saved);
        }
    }
  }, [currentTask]);

  // Debounced live scoring — runs 800ms after the user stops typing
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
        localStorage.removeItem(`draft-save-${currentTask.id}`);
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
    setActiveRefTab('facts');
  }, [setIsFactGenerating, setGlobalError]);

  useEffect(() => {
    if (practiceMode) {
      const tasks = practiceMode === 'indian' ? DRAFTING_TASKS_INDIAN : DRAFTING_TASKS_INTERNATIONAL;
      setAvailableTasks(tasks);
    }
  }, [practiceMode]);


  const handleTaskSelectionAndFactGeneration = async (taskId: string) => {
    if (!practiceMode || !taskId || isLoading) return;
    const selected = availableTasks.find(t => t.id === taskId);
    if (selected) {
      resetTaskStateFull();
      setCurrentTask(selected);
      setStage('fact_generation_loading');
      setIsFactGenerating(true);
      setGlobalLoading(true);

      try {
        const factsResponse = await generateDraftingFacts(selected.type, selected.relevantLaws, practiceMode, selected.objective);

        if (factsResponse && !factsResponse.toLowerCase().startsWith("error:")) {
          setGeneratedFacts(factsResponse);
          setStage('task_details_display');
        } else {
          const errorMsg = factsResponse || "Error: AI did not return facts for scenario generation.";
          setGlobalError(errorMsg);
          setCurrentTask(null);
          setStage('task_selection');
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        setGlobalError(`Critical Error (Fact Generation): ${errorMsg}`);
        setCurrentTask(null);
        setStage('task_selection');
      } finally {
        setIsFactGenerating(false);
        setGlobalLoading(false);
      }
    }
  };

  const handleProceedToDrafting = () => {
    if (stage === 'task_details_display' && !isLoading && currentTask) {
      setStage('drafting');
    }
  }

  const handleSubmitForReview = async () => {
    if (!currentTask || !practiceMode || !generatedFacts.trim() || isLoading) return;
    if (userDraft.trim() === "") {
      setGlobalError("Please write your draft before submitting for review.");
      return;
    }

    setIsLoadingAiInteraction(true);
    setGlobalLoading(true);
    setActiveRefTab('feedback');

    const sectionName = selectedSectionId ? currentTask.sections?.find(s => s.id === selectedSectionId)?.name : null;

    const feedbackResponse = await generateDraftingGuidance(currentTask, userDraft, generatedFacts, practiceMode, sectionName || undefined);
    if (feedbackResponse && !feedbackResponse.toLowerCase().startsWith("error:")) {
      setAiFeedback(feedbackResponse);
      setStage('feedback_review');
    } else {
      const errorMsg = feedbackResponse || "Error: Could not get feedback from AI.";
      setGlobalError(errorMsg);
    }
    setIsLoadingAiInteraction(false);
    setGlobalLoading(false);
  };

  const handleGetFilingInfo = async () => {
    if (!currentTask || !practiceMode || isLoading) return;
    setIsLoadingAiInteraction(true);
    setGlobalLoading(true);
    setActiveRefTab('procedure');
    
    const infoResponse = await getFilingProcedureInfo(currentTask.type, currentTask.relevantLaws, practiceMode);
    if (infoResponse && !infoResponse.toLowerCase().startsWith("error:")) {
      setFilingProcedure(infoResponse);
      setStage('filing_procedure');
    } else {
      const errorMsg = infoResponse || "Error: Could not get filing information from AI.";
      setGlobalError(errorMsg);
    }
    setIsLoadingAiInteraction(false);
    setGlobalLoading(false);
  };

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
            <div className="bg-brand-bg-secondary p-2.5 rounded-none border border-brand-text-primary/30 font-mono text-[9px] text-brand-text-secondary leading-normal">
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
              <div className="border border-brand-text-primary/30 rounded-none overflow-hidden text-[10px]">
                <div className="bg-brand-bg-secondary p-2 border-b border-brand-text-primary/30 font-bold grid grid-cols-2 gap-2">
                  <div>Old Legalese</div>
                  <div>Modern Professional</div>
                </div>
                <div className="p-2.5 border-b border-brand-text-primary/30 grid grid-cols-2 gap-2 bg-brand-bg-primary/30">
                  <div className="text-red-400/80">THIS AGREEMENT made and entered into this 24th day... by and between Alpha Fund LP...</div>
                  <div className="text-green-400/90 font-medium">This Stock Purchase Agreement is dated May 24, 2026, and is between Alpha Fund LP ("Investor") and Beta Tech Inc. ("Company").</div>
                </div>
                <div className="p-2.5 grid grid-cols-2 gap-2 bg-brand-bg-primary/15">
                  <div className="text-red-400/80">WITNESSETH: WHEREAS, the Company desires to sell Preferred Stock...</div>
                  <div className="text-green-400/90 font-medium">Recitals:<br/>1. The Company is conducting a Series A finance raise.<br/>2. The Company desires to sell Series A shares...</div>
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
            <div className="bg-brand-bg-secondary p-3 rounded-none border border-brand-text-primary/30 space-y-1.5">
              <p><strong>1. Obligation (Covenants):</strong> Party's duty to act. Verb: <em>shall / must</em>.</p>
              <p><strong>2. Factual Assertion (Reps):</strong> Past/present state of fact. Verb: <em>represents / warrants</em>.</p>
              <p><strong>3. Discretionary Authority (Rights):</strong> Option to act. Verb: <em>may</em>.</p>
              <p><strong>4. Policy (Declarations):</strong> Operating automatically. Verb: <em>is / means</em>.</p>
              <p><strong>5. Condition:</strong> Trigger event. Verb: <em>must / is a condition to</em>.</p>
            </div>
            
            <div className="bg-brand-bg-secondary border border-brand-text-primary/30 p-2.5 rounded-none text-[11px]">
              <strong className="text-brand-accent block mb-1">[ Rule ] The Adams Rule for "Shall"</strong>
              Use <em>shall</em> <strong>only</strong> to impose a duty on a subject who is a party to the agreement. Do not use for policies, third parties, or conditions.
            </div>
 
            <div className="space-y-2">
              <p className="font-mono text-[9px] uppercase tracking-wider text-brand-accent">Red-Pen Overhaul:</p>
              <div className="border border-brand-text-primary/30 rounded-none overflow-hidden text-[10px]">
                <div className="bg-brand-bg-secondary p-2 border-b border-brand-text-primary/30 font-bold grid grid-cols-2 gap-2">
                  <div>Misused Verb</div>
                  <div>Correct Verb (Category)</div>
                </div>
                <div className="p-2.5 border-b border-brand-text-primary/30 grid grid-cols-2 gap-2 bg-brand-bg-primary/30">
                  <div className="text-red-400/80">"Terms" shall have the meanings...</div>
                  <div className="text-green-400/90 font-medium">"Terms" has the meaning... (Policy)</div>
                </div>
                <div className="p-2.5 border-b border-brand-text-primary/30 grid grid-cols-2 gap-2 bg-brand-bg-primary/15">
                  <div className="text-red-400/80">Seller shall represent that...</div>
                  <div className="text-green-400/90 font-medium">Seller represents that... (Assertion)</div>
                </div>
                <div className="p-2.5 grid grid-cols-2 gap-2 bg-brand-bg-primary/30">
                  <div className="text-red-400/80">Agreement shall be governed...</div>
                  <div className="text-green-400/90 font-medium">Agreement is governed... (Policy)</div>
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
            <div className="bg-brand-bg-secondary p-3 rounded-none border border-brand-text-primary/30 space-y-2">
              <p className="text-red-400/90 font-mono text-[10px] leading-normal">Ambiguous Clause:<br/>"The Company shall not hire employees or independent contractors who reside in California."</p>
              <p className="text-[10px] text-brand-text-secondary">Does "who reside in California" modify employees, or only independent contractors?</p>
              <p className="text-green-400/90 font-mono text-[10px] leading-normal">Option A (Both):<br/>"The Company shall not hire any individual residing in California, whether as an employee or as an independent contractor."</p>
            </div>
            
            <div className="font-semibold text-brand-text-primary">3.2 Tabulation Rules</div>
            <p>Use numbered lists for dense provisions. The introductory phrase must flow grammatically into every tabulated item.</p>
            
            <div className="border border-brand-text-primary/30 rounded-none p-3 bg-brand-bg-secondary space-y-2">
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
            <div className="bg-brand-bg-secondary p-2.5 rounded-none border border-brand-text-primary/30 text-[10.5px] space-y-1">
              <p><strong>Indemnify:</strong> Compensate for direct losses/judgments.</p>
              <p><strong>Defend:</strong> Pay legal fees and handle active third-party lawsuits.</p>
              <p><strong>Hold Harmless:</strong> Release the other party from liability between signatories.</p>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-brand-text-primary text-[10.5px]">Template: Indemnification & Cap</span>
                <button
                  onClick={() => handleCopySnippet(0, `Section 8.1 Indemnification. The Consultant shall indemnify, defend, and hold harmless the Client and its officers against all third-party claims, losses, and reasonable legal fees arising out of the Consultant's gross negligence or willful misconduct in performing the Services.\n\nSection 8.2 Limitation of Liability.\n(a) Waiver. Neither party is liable to the other for any indirect, incidental, or consequential damages arising out of this Agreement, even if advised of the possibility of such damages.\n(b) Cap. Except for breaches of Section 5 (Confidentiality), each party's aggregate liability under this Agreement is capped at the total fees paid by the Client to the Consultant in the 12 months preceding the claim.`)}
                  className="px-2 py-0.5 border border-brand-accent/30 text-brand-accent text-[9px] rounded-none hover:bg-brand-accent/10 transition-colors uppercase font-mono"
                >
                  {copiedSnippetIndex === 0 ? "Copied!" : "Quick Copy"}
                </button>
              </div>
              <pre className="bg-brand-bg-secondary p-2.5 rounded-none border border-brand-text-primary/30 font-mono text-[9px] text-brand-text-secondary leading-relaxed overflow-x-auto">
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
                  className="px-2 py-0.5 border border-brand-accent/30 text-brand-accent text-[9px] rounded-none hover:bg-brand-accent/10 transition-colors uppercase font-mono"
                >
                  {copiedSnippetIndex === 1 ? "Copied!" : "Quick Copy"}
                </button>
              </div>
              <pre className="bg-brand-bg-secondary p-2.5 rounded-none border border-brand-text-primary/30 font-mono text-[9px] text-brand-text-secondary leading-relaxed overflow-x-auto">
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
              <div className="bg-brand-bg-secondary p-2.5 rounded-none border border-brand-text-primary/30 text-[10px]">
                <span className="text-red-400 font-mono">Trap:</span> "Tenant shall not keep dogs, cats, birds, or other animals." (Tiger might be excluded by a court as not a household pet).<br/>
                <span className="text-green-400 font-mono">Fix:</span> "...or other animals, whether domestic or wild."
              </div>
              
              <p><strong>Expressio Unius ("Exclusion of others"):</strong> Mentioning one implies excluding the other.</p>
              <div className="bg-brand-bg-secondary p-2.5 rounded-none border border-brand-text-primary/30 text-[10px]">
                <span className="text-red-400 font-mono">Trap:</span> "Seller represents that IP does not infringe US patents." (Implies no representation for foreign patents or trademarks).<br/>
                <span className="text-green-400 font-mono">Fix:</span> "...any intellectual property right globally."
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
        <div className="bg-brand-bg-secondary border border-brand-text-primary/30 rounded-none p-4 space-y-3">
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
                  className="mt-0.5 rounded-none border-brand-text-primary/30 text-brand-accent bg-brand-bg-secondary focus:ring-brand-accent cursor-pointer h-3.5 w-3.5"
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
                <div key={idx} className="border border-brand-text-primary/30 rounded-none overflow-hidden bg-brand-bg-secondary transition-all">
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

  return (
    <div className="flex flex-col min-h-[calc(100vh-100px)] h-full overflow-y-auto custom-scrollbar animate-fadeIn relative pb-8">

      {/* Header & Stepper */}
      <div className="flex-shrink-0 mb-4 lg:mb-8 text-center lg:text-left flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-6 px-1">
        <div>
            <div className="flex items-center justify-center lg:justify-start space-x-2 lg:space-x-3 mb-1 lg:mb-2">
                <QuillIcon className="h-5 w-5 lg:h-6 lg:w-6 text-brand-accent" />
                <h1 className="text-lg lg:text-3xl font-serif font-bold text-shimmer tracking-tight">Drafting Studio</h1>
                <span className="text-[8px] lg:text-[10px] font-mono text-brand-accent border border-brand-text-primary/30 px-1.5 lg:px-2 py-0.5 rounded-none uppercase tracking-widest">{modeDisplay}</span>
            </div>
            <p className="text-xs lg:text-sm text-brand-text-secondary font-light max-w-xl mx-auto lg:mx-0">
                AI-powered legal instrument synthesis and procedural validation.
            </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center space-x-1.5 md:space-x-4">
            {steps.map((step, idx) => (
                <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center group">
                        <div className={`w-6 h-6 lg:w-8 lg:h-8 rounded-none flex items-center justify-center text-[10px] lg:text-xs font-bold transition-all duration-300
                            ${idx <= currentStepIndex ? 'bg-brand-accent text-brand-bg-primary scale-110' : 'bg-brand-bg-secondary border border-brand-text-primary/30 text-brand-text-secondary/50'}
                        `}>
                            {idx < currentStepIndex ? <CheckCircleIcon className="w-4 h-4 lg:w-5 lg:h-5" /> : idx + 1}
                        </div>
                        <span className={`text-[7px] lg:text-[9px] mt-1 lg:mt-1.5 font-mono uppercase tracking-tighter transition-colors ${idx <= currentStepIndex ? 'text-brand-accent' : 'text-brand-text-secondary/40'}`}>
                            {step.label}
                        </span>
                    </div>
                    {idx < steps.length - 1 && (
                        <div className={`h-[1px] w-3 md:w-8 transition-colors duration-500 mb-4 ${idx < currentStepIndex ? 'bg-brand-accent' : 'bg-brand-text-primary/10'}`}></div>
                    )}
                </React.Fragment>
            ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-grow lg:overflow-hidden relative min-h-[600px] lg:min-h-0">
        
        {/* Main Interface */}
        {stage === 'task_selection' || stage === 'fact_generation_loading' ? (
            <div className="flex-grow flex items-center justify-center">
                <Card className="max-w-xl w-full p-5 sm:p-10 bg-brand-bg-secondary border-brand-text-primary/30 relative overflow-hidden group">
                    
                    {stage === 'task_selection' ? (
                        <div className="space-y-8 relative z-10">
                            <div className="text-center">
                                <div className="w-12 h-12 lg:w-16 lg:h-16 bg-brand-bg-primary border border-brand-text-primary/30 rounded-none flex items-center justify-center mx-auto mb-3 lg:mb-4">
                                    <ClipboardIcon className="w-6 h-6 lg:w-8 lg:h-8 text-brand-accent" />
                                </div>
                                <h3 className="text-base lg:text-xl font-serif font-semibold text-brand-text-primary">Choose your Practice Area</h3>
                                <p className="text-xs lg:text-sm text-brand-text-secondary font-light mt-1">Select an instrument to generate a practice scenario.</p>
                            </div>

                            <SelectInput
                                options={groupedTaskOptionsForSelect}
                                onChange={(e) => {
                                    if (e.target.value && !e.target.value.startsWith("__optgroup__")) {
                                        handleTaskSelectionAndFactGeneration(e.target.value);
                                    }
                                }}
                                placeholder="Browse legal instruments..."
                                value={currentTask?.id || ""}
                                disabled={isLoading}
                                className="py-4 bg-brand-bg-secondary border-brand-text-primary/30 hover:border-brand-text-primary transition-colors"
                            />

                            <div className="grid grid-cols-2 gap-4">
                                {['Plaints', 'Petitions', 'Contracts', 'Legal Notices'].map(type => (
                                    <div key={type} className="p-4 rounded-none border border-brand-text-primary/30 bg-brand-bg-secondary text-center">
                                        <span className="text-[10px] font-mono text-brand-text-secondary uppercase tracking-widest">{type}</span>
                                    </div>
                                ))}
                             </div>
                        </div>
                    ) : (
                        <div className="space-y-6 text-center py-10">
                            <LoadingSpinner text="Synthesizing bespoke legal facts..." size="lg" spinnerColor="text-brand-accent" textColor="text-brand-accent" />
                            <p className="text-xs text-brand-text-secondary font-mono tracking-widest uppercase animate-pulse">Consulting the AI Legal Oracle</p>
                        </div>
                    )}
                </Card>
            </div>
        ) : (
            <>
                {/* Reference Sidebar (Left/Collapsible) */}
                <aside className={`flex-shrink-0 transition-all duration-500 ease-in-out border border-brand-text-primary/30 bg-brand-bg-primary rounded-none overflow-hidden flex flex-col
                    ${isFocusMode ? 'hidden' : ''}
                    ${isRefPanelOpen ? 'w-full lg:w-[380px] max-h-[40vh] lg:max-h-none lg:h-auto' : 'w-full lg:w-16 h-10 lg:h-auto'}
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
                            className="p-1.5 lg:p-2 rounded-none hover:bg-brand-bg-secondary text-brand-text-secondary hover:text-brand-accent transition-all lg:mx-0"
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
                                        <span className={`absolute -top-1 -right-1 text-[8px] font-bold font-mono w-5 h-5 rounded-none border border-current flex items-center justify-center
                                            ${scoringResult.verdictTier === 'excellent' ? 'bg-emerald-500/20 text-emerald-400' :
                                              scoringResult.verdictTier === 'good' ? 'bg-brand-accent/20 text-brand-accent' :
                                              scoringResult.verdictTier === 'fair' ? 'bg-amber-500/20 text-amber-400' :
                                              'bg-red-500/20 text-red-400'}
                                        `}>
                                            {Math.round(scoringResult.totalScore)}
                                        </span>
                                    )}
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
                                        <div className="font-light leading-relaxed text-[13px] text-brand-text-primary/90 selection:bg-brand-accent/30 prose-sm prose-invert">
                                            {generatedFacts ? renderMarkdown(generatedFacts) : "Generating facts..."}
                                        </div>
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
                                            <div className="text-center py-12 space-y-3">
                                                <ChartBarIcon className="w-10 h-10 text-brand-text-secondary/20 mx-auto" />
                                                <p className="text-xs text-brand-text-secondary/50 font-light">
                                                    Write at least 50 characters to see live conformance metrics.
                                                </p>
                                                <p className="text-[10px] text-brand-text-secondary/30 font-mono">
                                                    Benchmarked against 50 legal journal articles
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeRefTab === 'feedback' && (
                                    <div className="animate-fadeIn space-y-4">
                                        <div className="flex items-center space-x-2 text-brand-accent mb-2">
                                            <div className="h-px w-4 bg-brand-accent"></div>
                                            <span className="text-[10px] font-mono uppercase tracking-widest">AI Mentor Guidance</span>
                                        </div>
                                        {isLoadingAiInteraction ? (
                                            <div className="flex flex-col items-center justify-center py-10 space-y-4">
                                                <LoadingSpinner size="sm" />
                                                <span className="text-[10px] font-mono text-brand-text-secondary animate-pulse uppercase">Analysing your draft...</span>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="font-light leading-relaxed text-[13px] text-brand-text-primary/90 selection:bg-brand-accent/30 prose-sm prose-invert">
                                                    {aiFeedback ? renderMarkdown(aiFeedback) : "Submit your draft for AI review."}
                                                </div>
                                                {aiFeedback && (
                                                    <div className="mt-4 pt-2 border-t border-brand-text-primary/30">
                                                        <button
                                                            onClick={() => handleSpeak(aiFeedback)}
                                                            className="px-2.5 py-1 text-[10px] border border-brand-text-primary/30 rounded-none bg-brand-bg-secondary hover:bg-brand-bg-primary text-brand-text-primary transition-all cursor-pointer font-mono uppercase"
                                                            title="Speak this feedback"
                                                        >
                                                            [ Read Aloud ]
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeRefTab === 'procedure' && (
                                    <div className="animate-fadeIn space-y-4">
                                        <div className="flex items-center space-x-2 text-brand-accent mb-2">
                                            <div className="h-px w-4 bg-brand-accent"></div>
                                            <span className="text-[10px] font-mono uppercase tracking-widest">Filing Protocol</span>
                                        </div>
                                        <div className="font-light leading-relaxed text-[13px] text-brand-text-primary/90 selection:bg-brand-accent/30 prose-sm prose-invert">
                                            {filingProcedure ? renderMarkdown(filingProcedure) : "Filing info not requested yet."}
                                            {filingProcedure && (
                                                <div className="mt-4 pt-2 border-t border-brand-text-primary/30">
                                                    <button
                                                        onClick={() => handleSpeak(filingProcedure)}
                                                        className="px-2.5 py-1 text-[10px] border border-brand-text-primary/30 rounded-none bg-brand-bg-secondary hover:bg-brand-bg-primary text-brand-text-primary transition-all cursor-pointer font-mono uppercase"
                                                        title="Speak this protocol"
                                                    >
                                                        [ Read Aloud ]
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeRefTab === 'course' && renderSyllabus()}

                                {activeRefTab === 'history' && (
                                    <div className="animate-fadeIn space-y-4">
                                        <div className="flex justify-between items-center border-b border-brand-text-primary/30 pb-2">
                                            <span className="text-[10px] font-mono uppercase tracking-widest text-brand-accent">Snapshots ({snapshots.length})</span>
                                            <Button size="sm" variant="primary" onClick={saveSnapshot} className="px-2 py-1 text-[9px] font-mono rounded-none uppercase tracking-wider">
                                                [ Snapshot ]
                                            </Button>
                                        </div>
                                        
                                        {snapshots.length === 0 ? (
                                            <p className="text-xs text-brand-text-secondary/60 italic leading-relaxed py-4 text-left">
                                                No snapshots saved for this draft yet. Click the Snapshot button above or press Cmd+S (or use Command Palette) to capture the current draft state.
                                            </p>
                                        ) : (
                                            <div className="space-y-3">
                                                {snapshots.map((snap) => (
                                                    <div key={snap.id} className="bg-brand-bg-secondary border border-brand-text-primary/30 p-3 rounded-none flex flex-col space-y-2 text-left">
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
                                                                    localStorage.setItem(key, JSON.stringify(updated));
                                                                }}
                                                                className="text-[9px] font-mono text-red-400 hover:text-red-300 transition-colors border border-red-500/20 px-2 py-1 uppercase ml-auto"
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
                <main className="flex-grow flex flex-col min-h-[300px] lg:min-h-0 overflow-hidden bg-brand-bg-primary border border-brand-text-primary/30 rounded-none relative">
                    
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
                                className="text-[8px] lg:text-[10px] h-7 lg:h-8 px-2 lg:px-3 border border-brand-text-primary/30 hover:border-brand-text-primary text-brand-text-secondary rounded-none flex-shrink-0"
                            >
                                {isFocusMode ? 'Exit Focus' : 'Focus Mode'}
                            </Button>
                            <Button onClick={resetTaskStateFull} variant="ghost" size="sm" className="text-[8px] lg:text-[10px] h-7 lg:h-8 px-2 lg:px-3 border border-brand-text-primary/30 hover:border-brand-text-primary text-brand-text-secondary rounded-none flex-shrink-0 hidden sm:flex">
                                Reset
                            </Button>
                        </div>
                    </div>

                        <div className="flex-grow relative bg-brand-bg-primary">
                        {stage === 'task_details_display' ? (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 lg:p-8 text-center bg-brand-bg-primary/95 group">
                                <Card className="max-w-md p-5 lg:p-8 border-brand-text-primary/30 bg-brand-bg-secondary transition-transform duration-500">
                                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-brand-bg-primary rounded-none flex items-center justify-center mx-auto mb-3 lg:mb-4 border border-brand-text-primary/30">
                                        <QuillIcon className="w-5 h-5 lg:w-6 lg:h-6 text-brand-accent" />
                                    </div>
                                    <h4 className="text-base lg:text-lg font-serif font-bold text-brand-text-primary mb-1.5 lg:mb-2">Scenario Ready</h4>
                                    <p className="text-xs lg:text-sm text-brand-text-secondary font-light mb-4 lg:mb-6 leading-relaxed">
                                        Review the <span className="text-brand-accent font-medium">Facts</span> in the reference panel, then open the editor to draft your <span className="text-brand-accent font-medium">{currentTask?.type}</span>.
                                    </p>
                                    <Button onClick={handleProceedToDrafting} variant="primary" fullWidth size="md" className="uppercase tracking-wider text-[10px] lg:text-xs rounded-none border border-brand-accent hover:bg-brand-accent hover:text-brand-navy">
                                        Commence Drafting
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
                                    <div className={`w-1.5 h-1.5 rounded-none ${userDraft.length > 0 ? 'bg-green-500' : 'bg-brand-text-secondary/30'}`}></div>
                                    <span className="text-[9px] lg:text-[10px] font-mono text-brand-text-secondary">{userDraft.length} chars</span>
                                </div>
                                <span className={`text-[9px] font-mono text-brand-accent transition-opacity duration-300 ${showAutoSave ? 'opacity-100' : 'opacity-0'}`}>
                                    [Saved]
                                </span>
                            </div>
                            {scoringResult && (
                                <button
                                    onClick={() => { setActiveRefTab('score'); if(!isRefPanelOpen) setIsRefPanelOpen(true); }}
                                    className={`flex items-center space-x-1 px-1.5 py-0.5 rounded-none border transition-all cursor-pointer
                                        ${scoringResult.verdictTier === 'excellent' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' :
                                          scoringResult.verdictTier === 'good' ? 'border-brand-accent/30 bg-brand-accent/10 text-brand-accent' :
                                          scoringResult.verdictTier === 'fair' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                                          'border-red-500/30 bg-red-500/10 text-red-400'}
                                    `}
                                    title="View full scoring breakdown"
                                >
                                    <ChartBarIcon className="w-3 h-3" />
                                    <span className="text-[9px] font-mono font-bold">{Math.round(scoringResult.totalScore)}</span>
                                </button>
                            )}
                        </div>
                        {/* Action buttons row */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={isRecording ? stopRecording : startRecording}
                              disabled={isLoading || stage === 'task_details_display'}
                              className={`w-8 h-8 lg:w-10 lg:h-10 flex-shrink-0 rounded-none border flex items-center justify-center transition-all focus:outline-none disabled:opacity-50
                                ${isRecording
                                  ? 'bg-brand-error/20 border-brand-error text-brand-error animate-pulse'
                                  : 'bg-brand-bg-secondary border-brand-text-primary/30 text-brand-text-primary hover:bg-brand-bg-primary'
                                }`}
                              title={isRecording ? 'Stop Recording' : 'Speak using Sarvam voice transcription'}
                            >
                              {isRecording ? (
                                <svg className="w-4 h-4 lg:w-5 lg:h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                              ) : (
                                <svg className="w-4 h-4 lg:w-5 lg:h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>
                              )}
                            </button>

                            <Button 
                                onClick={() => {
                                    navigator.clipboard.writeText(userDraft);
                                    setIsCopied(true);
                                    setTimeout(() => setIsCopied(false), 2000);
                                }}
                                variant="ghost"
                                size="sm"
                                disabled={!userDraft}
                                className="text-[8px] lg:text-[10px] border border-brand-text-primary/30 text-brand-text-secondary hover:text-brand-accent rounded-none uppercase tracking-wider h-8 lg:h-10 px-2 lg:px-4"
                            >
                                {isCopied ? 'Copied!' : 'Copy'}
                            </Button>

                            {stage === 'feedback_review' || stage === 'filing_procedure' ? (
                                <Button 
                                    onClick={handleGetFilingInfo}
                                    variant="outline"
                                    size="sm"
                                    disabled={isLoading}
                                    className="text-[8px] lg:text-[11px] border-brand-text-primary/30 text-brand-text-secondary hover:text-brand-accent rounded-none uppercase tracking-wider h-8 lg:h-10 px-2 lg:px-4"
                                >
                                    Filing
                                </Button>
                            ) : null}

                            <Button 
                                onClick={handleSubmitForReview}
                                variant="primary"
                                size="sm"
                                disabled={isLoading || userDraft.length < 10 || stage === 'task_details_display'}
                                className="flex-1 min-w-0 rounded-none transition-all text-[9px] lg:text-xs uppercase tracking-wider h-8 lg:h-10 border border-brand-accent"
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
  );
};

export default DraftingStudioScreen;
