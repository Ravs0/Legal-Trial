
import React, { useState, useContext, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { TrialSimContext } from '../App';
import { ROUTES, DRAFTING_TASKS_INDIAN, DRAFTING_TASKS_INTERNATIONAL } from '../constants';
import { DraftingTask, PracticeMode, DraftingStudioStage, ChatMessage as DraftingMessage, CaseDifficulty, DraftingSection } from '../types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { QuillIcon } from '../components/icons/QuillIcon';
import { generateDraftingFacts, generateDraftingGuidance, getFilingProcedureInfo } from '../services/geminiService';
import { SelectInput } from '../components/SelectInput';

interface GroupedTaskOption {
  label: string;
  options: Array<{ value: string; label: string }>;
}

const DraftingStudioScreen: React.FC = () => {
  const context = useContext(TrialSimContext);
  const instructionPanelRef = useRef<HTMLDivElement>(null);

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
  const [messages, setMessages] = useState<DraftingMessage[]>([]);

  const isLoading = isFactGenerating || isLoadingAiInteraction;

  const addMessage = useCallback((text: string, sender: 'system' | 'user' = 'system', isCriticalAiResponse: boolean = false) => {
    setMessages(prev => {
      let newMessages = [...prev];
      if (isCriticalAiResponse && sender === 'system') {
        newMessages = newMessages.filter(m => !(
          m.sender === 'system' &&
          (m.text.toLowerCase().includes("ai mentor feedback") || m.text.toLowerCase().includes("filing procedure for"))
        ));
      }
      newMessages.push({ id: `draftmsg-${Date.now()}-${Math.random()}`, text, sender, timestamp: new Date() });
      return newMessages;
    });
  }, []);

  const resetTaskStateFull = useCallback(() => {
    setCurrentTask(null);
    setGeneratedFacts('');
    setUserDraft('');
    setSelectedSectionId(null);
    setMessages([]);
    setStage('task_selection');
    setIsFactGenerating(false);
    setIsLoadingAiInteraction(false);
    setGlobalError(null);
  }, [setIsFactGenerating, setGlobalError]);

  useEffect(() => {
    if (practiceMode) {
      const tasks = practiceMode === 'indian' ? DRAFTING_TASKS_INDIAN : DRAFTING_TASKS_INTERNATIONAL;
      setAvailableTasks(tasks);
      resetTaskStateFull();
    }
  }, [practiceMode, resetTaskStateFull]);


  const handleTaskSelectionAndFactGeneration = async (taskId: string) => {
    if (!practiceMode || !taskId || isLoading) return;
    const selected = availableTasks.find(t => t.id === taskId);
    if (selected) {
      resetTaskStateFull();
      setCurrentTask(selected);
      setStage('fact_generation_loading');
      setIsFactGenerating(true);
      setGlobalLoading(true);

      addMessage(`Preparing scenario for: ${selected.title}...\nObjective: ${selected.objective}\nLaws: ${Array.isArray(selected.relevantLaws) ? selected.relevantLaws.join(', ') : selected.relevantLaws}\nDifficulty: ${selected.difficulty}`);
      addMessage("Generating unique facts for your drafting exercise...");

      try {
        const factsResponse = await generateDraftingFacts(selected.type, selected.relevantLaws, practiceMode, selected.objective);

        if (factsResponse && !factsResponse.toLowerCase().startsWith("error:")) {
          setGeneratedFacts(factsResponse);
          setMessages(prev => prev.filter(m => !m.text.startsWith("Generating unique facts")));
          addMessage(`AI Generated Facts:\n${factsResponse}`);
          setStage('task_details_display');
        } else {
          const errorMsg = factsResponse || "Error: AI did not return facts for scenario generation.";
          setMessages(prev => prev.filter(m => !m.text.startsWith("Generating unique facts")));
          addMessage(errorMsg, 'system', true);
          setGlobalError(errorMsg);
          setCurrentTask(null);
          setStage('task_selection');
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        setMessages(prev => prev.filter(m => !m.text.startsWith("Generating unique facts")));
        addMessage(`Critical Error (Fact Generation): ${errorMsg}`, 'system', true);
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
      addMessage(`You may now begin drafting the '${currentTask.type}'.\nFocus on the objective: "${currentTask.objective}" using the AI-generated facts and relevant ${practiceMode} laws outlined previously. Good luck!`);
    }
  }

  const handleSubmitForReview = async () => {
    if (!currentTask || !practiceMode || !generatedFacts.trim() || isLoading) return;
    if (userDraft.trim() === "") {
      addMessage("Please write your draft before submitting for review.", 'system', true);
      return;
    }

    if (stage === 'task_details_display') {
      setStage('drafting');
    }

    setIsLoadingAiInteraction(true);
    setGlobalLoading(true);
    addMessage(`Your draft for "${currentTask.title}" submitted. The AI Mentor is reviewing...`, 'user');

    const sectionName = selectedSectionId ? currentTask.sections?.find(s => s.id === selectedSectionId)?.name : null;

    const feedbackResponse = await generateDraftingGuidance(currentTask, userDraft, generatedFacts, practiceMode, sectionName || undefined);
    if (feedbackResponse && !feedbackResponse.toLowerCase().startsWith("error:")) {
      addMessage(`AI Mentor Feedback:\n${feedbackResponse}`, 'system', true);
      setStage('feedback_review');
    } else {
      const errorMsg = feedbackResponse || "Error: Could not get feedback from AI.";
      addMessage(errorMsg, 'system', true);
      setGlobalError(errorMsg);
    }
    setIsLoadingAiInteraction(false);
    setGlobalLoading(false);
  };

  const handleGetFilingInfo = async () => {
    if (!currentTask || !practiceMode || isLoading) return;
    setIsLoadingAiInteraction(true);
    setGlobalLoading(true);
    addMessage(`Requesting filing procedure for "${currentTask.type}"...`, 'user');
    const infoResponse = await getFilingProcedureInfo(currentTask.type, currentTask.relevantLaws, practiceMode);
    if (infoResponse && !infoResponse.toLowerCase().startsWith("error:")) {
      addMessage(`Filing Procedure for a ${currentTask.type} (in ${practiceMode} context):\n${infoResponse}`, 'system', true);
      setStage('filing_procedure');
    } else {
      const errorMsg = infoResponse || "Error: Could not get filing information from AI.";
      addMessage(errorMsg, 'system', true);
      setGlobalError(errorMsg);
    }
    setIsLoadingAiInteraction(false);
    setGlobalLoading(false);
  };

  useEffect(() => {
    if (instructionPanelRef.current) {
      instructionPanelRef.current.scrollTop = instructionPanelRef.current.scrollHeight;
    }
  }, [messages]);

  if (!practiceMode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }

  const modeDisplay = practiceMode.charAt(0).toUpperCase() + practiceMode.slice(1);

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

  const hasReceivedFeedback = messages.some(m => m.text.toLowerCase().includes("mentor feedback") && m.sender === 'system');

  const canSubmitForReview = !isLoading &&
    currentTask != null &&
    generatedFacts.trim() !== '' &&
    userDraft.trim() !== '' &&
    (stage === 'drafting' || stage === 'feedback_review' || stage === 'task_details_display');

  const canGetFilingInfo = !isLoading &&
    currentTask != null &&
    hasReceivedFeedback &&
    (stage === 'feedback_review' || stage === 'filing_procedure');

  const submitButtonText = hasReceivedFeedback ? "Re-submit Draft" : "Submit Draft";


  return (
    <div className="space-y-6 lg:space-y-8 animate-fadeIn p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto relative z-10">
      <div className="absolute top-[-10%] right-[-5%] w-[40rem] h-[40rem] bg-brand-accent/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>

      <div className="text-center mb-8 relative">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-brand-navy border border-brand-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner-subtle shadow-glow-gold-sm">
          <QuillIcon className="h-8 w-8 sm:h-10 sm:w-10 text-brand-accent drop-shadow-md" />
        </div>
        <div className="inline-flex items-center justify-center space-x-2 mb-3 opacity-80">
          <div className="h-px w-8 bg-brand-accent/50"></div>
          <span className="text-[10px] font-mono text-brand-accent tracking-widest uppercase">{modeDisplay} Law</span>
          <div className="h-px w-8 bg-brand-accent/50"></div>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-shimmer font-serif tracking-tight drop-shadow-md mb-2">Drafting Studio</h1>
        <p className="text-brand-text-secondary font-light max-w-2xl mx-auto">Master the art of legal drafting with AI-guided scenarios and procedural feedback.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
        <div className="xl:col-span-1 space-y-6 h-full flex flex-col">
          {stage === 'task_selection' && (
            <Card className="flex flex-col flex-grow">
              <div className="mb-6 pb-4 border-b border-brand-accent/10">
                <h3 className="text-xl font-serif font-semibold text-brand-text-primary">Scenario Selection</h3>
                <p className="text-sm font-light text-brand-text-secondary mt-1">Choose a legal instrument to practice.</p>
              </div>

              {availableTasks.length > 0 ? (
                <div className="relative">
                  <SelectInput
                    options={groupedTaskOptionsForSelect}
                    onChange={(e) => {
                      if (e.target.value && !e.target.value.startsWith("__optgroup__")) {
                        handleTaskSelectionAndFactGeneration(e.target.value);
                      }
                    }}
                    placeholder="Browse available instruments..."
                    value={currentTask?.id || ""}
                    disabled={isLoading}
                    className="py-4"
                  />
                </div>
              ) : (
                <div className="text-center p-8 border border-dashed border-brand-accent/20 rounded-xl bg-brand-navy/30">
                  <p className="text-brand-text-secondary font-light">No drafting tasks available for {modeDisplay} mode.</p>
                </div>
              )}
            </Card>
          )}

          {stage === 'fact_generation_loading' && (
            <Card className="text-center h-64 flex flex-col items-center justify-center bg-brand-navy/50 relative overflow-hidden text-brand-accent">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-accent/5 to-transparent pointer-events-none"></div>
              <LoadingSpinner text="Generating bespoke scenario facts..." size="lg" spinnerColor="text-brand-accent" textColor="text-brand-accent" />
            </Card>
          )}

          {currentTask && stage !== 'task_selection' && stage !== 'fact_generation_loading' && (
            <Card className="flex flex-col flex-grow lg:sticky lg:top-24 max-h-[600px] lg:max-h-[calc(100vh-8rem)] p-0 overflow-hidden bg-brand-navy/60">
              <div className="flex justify-between items-center p-5 bg-brand-navy border-b border-brand-accent/10 z-10 w-full relative">
                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-brand-accent/40 via-brand-accent/10 to-transparent"></div>
                <div className="w-[85%] pr-4">
                  <span className="text-[10px] font-mono text-brand-text-secondary uppercase tracking-widest">{currentTask.category}</span>
                  <h3 className="text-lg font-serif font-semibold text-brand-text-primary leading-tight mt-0.5 truncate" title={currentTask.title}>{currentTask.title}</h3>
                </div>
                <Button onClick={resetTaskStateFull} variant="ghost" size="sm" className="text-xs py-1.5 px-3 shadow-none border border-brand-accent/20 text-brand-text-secondary hover:text-brand-accent flex-shrink-0" disabled={isLoading}>
                  Reset
                </Button>
              </div>

              <div ref={instructionPanelRef} className="space-y-4 p-5 overflow-y-auto flex-grow custom-scrollbar min-h-[300px]">
                {messages.map(msg => {
                  const isUser = msg.sender === 'user';
                  const isSystem = msg.sender === 'system';

                  let senderLabel = "System";
                  let bgStyle = 'bg-brand-bg-tertiary/60 border border-brand-border-light text-brand-text-primary mr-auto rounded-tl-sm';
                  let headerColor = 'text-brand-text-secondary';
                  let icon = '✦';

                  if (isUser) {
                    senderLabel = "You";
                    bgStyle = 'bg-brand-accent/10 border border-brand-accent/30 text-brand-text-primary ml-auto text-right rounded-tr-sm';
                    headerColor = 'text-brand-accent';
                  } else if (msg.text.toLowerCase().includes("ai mentor feedback")) {
                    senderLabel = "AI Mentor Review";
                    bgStyle = 'bg-brand-navy border border-brand-accent/40 text-brand-text-primary mr-auto rounded-tl-sm shadow-[0_0_15px_rgba(201,168,76,0.1)]';
                    headerColor = 'text-brand-accent';
                    icon = '⚖';
                  } else if (msg.text.toLowerCase().includes("filing procedure")) {
                    senderLabel = "Procedural Guide";
                    bgStyle = 'bg-brand-bg-primary border border-brand-accent/20 text-brand-text-primary mr-auto rounded-tl-sm';
                    headerColor = 'text-brand-text-primary';
                    icon = '§';
                  } else if (msg.text.toLowerCase().includes("ai generated facts")) {
                    senderLabel = "Scenario Facts";
                    bgStyle = 'bg-brand-navy border-l-2 border-brand-accent text-brand-text-primary mr-auto rounded-l-none';
                    headerColor = 'text-brand-accent';
                    icon = '❖';
                  }

                  return (
                    <div key={msg.id} className={`flex flex-col w-full animate-fadeInUp`}>
                      <span className={`text-[10px] font-mono tracking-widest uppercase mb-1.5 ${isUser ? 'mr-1 text-right' : 'ml-1 text-left'} ${headerColor}`}>
                        {senderLabel}
                      </span>
                      <div className={`p-4 rounded-xl max-w-[95%] sm:max-w-[85%] font-light leading-relaxed text-sm ${bgStyle}`}>
                        <div className="whitespace-pre-wrap break-words prose prose-sm prose-invert max-w-none">
                          {msg.text.replace(/^(AI Mentor Feedback:|System Instructions:|Task Selected:|AI Generated Facts:|Objective:|Relevant Laws:|Difficulty:|Filing Procedure for.*?:|Generating unique facts for your scenario...|Selected Document Type:|Preparing scenario for.*?:|Selected:)/gmi, '').trim()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {isLoadingAiInteraction && (
                  <div className="flex items-center space-x-3 p-4 bg-brand-navy/40 border border-brand-accent/10 rounded-xl rounded-tl-sm max-w-[85%] animate-pulse">
                    <span className="flex space-x-1">
                      <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </span>
                    <span className="text-xs font-mono text-brand-text-secondary tracking-wider uppercase">Processing...</span>
                  </div>
                )}
              </div>

              {stage === 'task_details_display' && !isLoading && (
                <div className="p-4 bg-brand-navy border-t border-brand-accent/10 z-10 w-full relative">
                  <Button onClick={handleProceedToDrafting} variant="primary" fullWidth size="lg" className="shadow-glow-gold">
                    Commence Drafting
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="xl:col-span-2 flex flex-col h-full">
          {currentTask && stage !== 'task_selection' && stage !== 'fact_generation_loading' ? (
            <Card className="flex flex-col h-full lg:max-h-[calc(100vh-8rem)] p-0 overflow-hidden bg-brand-navy/30">
              <div className="p-5 border-b border-brand-accent/10 bg-brand-navy/60 backdrop-blur-md flex justify-between items-end relative z-10">
                <div>
                  <h3 className="text-xl font-serif font-semibold text-brand-text-primary">Draft Editor</h3>
                  <p className="text-xs font-mono text-brand-text-secondary mt-1 tracking-widest uppercase">Instrument: <span className="text-brand-accent font-semibold">{currentTask.type}</span></p>
                </div>
                {sectionOptions.length > 0 && (stage === 'drafting' || stage === 'feedback_review' || (stage === 'task_details_display' && userDraft.trim() !== '')) && (
                  <div className="w-48 hidden sm:block">
                    <SelectInput
                      options={[{ value: "", label: "-- Entire Draft --" }, ...sectionOptions]}
                      value={selectedSectionId || ""}
                      onChange={(e) => setSelectedSectionId(e.target.value || null)}
                      disabled={isLoading}
                      containerClassName="mb-0 border-brand-accent/30 py-2 text-xs"
                    />
                  </div>
                )}
              </div>

              <div className="flex-grow p-5 md:p-6 lg:p-8 bg-brand-bg-primary/20 relative">
                <textarea
                  value={userDraft}
                  onChange={(e) => setUserDraft(e.target.value)}
                  placeholder={
                    (stage === 'task_details_display' && !userDraft.trim()) ? "Review facts & instructions. Click 'Commence Drafting' or start typing here to begin." :
                      (stage === 'drafting' || (stage === 'task_details_display' && userDraft.trim() !== '') || stage === 'feedback_review') ?
                        `[Begin drafting your ${currentTask.type} here]\n\nObjective: ${currentTask.objective}`
                        : "Please wait..."
                  }
                  className="w-full h-full p-6 sm:p-8 bg-brand-bg-primary/50 text-brand-text-primary rounded-xl border border-brand-border-light focus:border-brand-accent/40 focus:ring-1 focus:ring-brand-accent focus:outline-none resize-none custom-scrollbar placeholder-brand-text-secondary/40 text-sm sm:text-base leading-relaxed min-h-[400px] lg:min-h-0 font-light font-sans shadow-inner-subtle transition-colors duration-300"
                  disabled={isLoading || (stage !== 'drafting' && stage !== 'task_details_display' && stage !== 'feedback_review')}
                  aria-label={`Drafting area`}
                />
              </div>

              {sectionOptions.length > 0 && (stage === 'drafting' || stage === 'feedback_review' || (stage === 'task_details_display' && userDraft.trim() !== '')) && (
                <div className="px-5 py-3 border-t border-brand-accent/10 sm:hidden bg-brand-navy/60">
                  <SelectInput
                    label="Focus Feedback Area"
                    options={[{ value: "", label: "-- Entire Draft --" }, ...sectionOptions]}
                    value={selectedSectionId || ""}
                    onChange={(e) => setSelectedSectionId(e.target.value || null)}
                    disabled={isLoading}
                    containerClassName="mb-0"
                  />
                </div>
              )}

              <div className="p-5 border-t border-brand-accent/10 bg-brand-navy/80 flex flex-col sm:flex-row gap-3 relative z-10 backdrop-blur-md items-center justify-between">
                {stage === 'task_details_display' && !isLoading && !userDraft.trim() ? (
                  <div className="text-center text-sm font-light text-brand-text-secondary/70 w-full py-2">
                    <p>Awaiting commence signal to open editor.</p>
                  </div>
                ) : (
                  <>
                    <Button
                      onClick={handleSubmitForReview}
                      disabled={!canSubmitForReview}
                      className="w-full sm:w-auto min-w-[200px] text-base py-3.5 shadow-glow-gold-sm hover:-translate-y-0.5"
                      variant="primary"
                    >
                      {submitButtonText}
                    </Button>

                    {canGetFilingInfo && (
                      <Button
                        onClick={handleGetFilingInfo}
                        disabled={isLoading}
                        variant="outline"
                        className="w-full sm:w-auto text-sm border-brand-text-secondary/30 text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-text-secondary/70 bg-transparent"
                      >
                        {messages.some(m => m.text.toLowerCase().includes("filing procedure")) ? 'View Procedure Again' : 'View Filing Procedure'}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          ) : (
            <div className="h-full min-h-[500px] flex items-center justify-center border-2 border-dashed border-brand-accent/10 rounded-2xl bg-brand-bg-primary/20">
              <div className="text-center p-8 max-w-sm">
                <div className="w-16 h-16 bg-brand-navy border border-brand-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <QuillIcon className="h-8 w-8 text-brand-accent/50" />
                </div>
                <p className="text-brand-text-secondary font-light text-lg">Select a drafting scenario from the left panel to begin.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DraftingStudioScreen;
