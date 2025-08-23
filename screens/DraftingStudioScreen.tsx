
import React, { useState, useContext, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { TrialSimContext } from '../App';
import { ROUTES, DRAFTING_TASKS_INDIAN, DRAFTING_TASKS_INTERNATIONAL } from '../constants';
import { DraftingTask, PracticeMode, DraftingStudioStage, ChatMessage as DraftingMessage, CaseDifficulty, DraftingSection } from '../types';
import { Button } from '../components/Button';
import { Card } 
from '../components/Card';
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
    if (!currentTask || !practiceMode || !generatedFacts.trim() || isLoading ) return;
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

  const submitButtonText = hasReceivedFeedback ? "Re-submit Draft for AI Review" : "Submit Draft for AI Review";


  return (
    <div className="space-y-6 lg:space-y-8 animate-fadeIn p-1 md:p-0">
      <Card className="text-center"> 
        <QuillIcon className="h-16 w-16 sm:h-20 sm:w-20 text-brand-accent mx-auto mb-4" />
        <h1 className="text-3xl sm:text-4xl font-bold text-brand-text-primary mb-1 font-serif">Drafting Practice Studio</h1>
        <p className="text-md sm:text-lg text-brand-text-secondary">Mode: <span className="font-semibold text-brand-accent">{modeDisplay} Law</span></p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {stage === 'task_selection' && (
            <Card> 
              <h3 className="text-xl font-semibold text-brand-accent mb-4">Select Document Type</h3> 
              {availableTasks.length > 0 ? (
                <SelectInput
                  label={`Available ${modeDisplay} Document Types`}
                  options={groupedTaskOptionsForSelect}
                  onChange={(e) => {
                    if (e.target.value && !e.target.value.startsWith("__optgroup__")) {
                      handleTaskSelectionAndFactGeneration(e.target.value);
                    }
                  }}
                  placeholder="-- Choose a document type --"
                  value={currentTask?.id || ""}
                  disabled={isLoading}
                />
              ) : (
                <p className="text-center text-brand-text-secondary py-4">No drafting tasks available for {modeDisplay} mode.</p>
              )}
            </Card>
          )}

          {stage === 'fact_generation_loading' && (
            <Card className="text-center h-64 flex items-center justify-center"> 
                <LoadingSpinner text="Generating scenario facts..." size="lg" spinnerColor="text-brand-accent" />
            </Card>
          )}

          {currentTask && stage !== 'task_selection' && stage !== 'fact_generation_loading' && (
            <Card className="flex flex-col lg:sticky lg:top-24 lg:max-h-[calc(100vh-12rem)] overflow-y-auto custom-scrollbar">
              <div className="flex justify-between items-center mb-3 pb-3 border-b border-[var(--neumorphic-shadow-dark-var)] opacity-60 flex-shrink-0">
                <h3 className="text-lg font-semibold text-brand-accent truncate" title={currentTask.title}>{currentTask.title}</h3>
                <Button onClick={resetTaskStateFull} variant="ghost" size="sm" className="text-xs py-1 px-2 shadow-none" disabled={isLoading}>
                    Reset Task
                </Button>
              </div>
              <div ref={instructionPanelRef} className="space-y-3 overflow-y-auto flex-grow custom-scrollbar pr-2 min-h-[250px] lg:min-h-0">
                {messages.map(msg => (
                  <div key={msg.id} className={`p-2.5 rounded-md text-sm whitespace-pre-line break-words shadow-neumorphic-flat ${msg.sender === 'user' ? 'bg-brand-accent text-brand-accent-text ml-auto w-11/12 text-right' : 'bg-brand-bg-secondary text-brand-text-primary mr-auto w-full'}`}>
                    <p className={`font-semibold mb-1 ${msg.sender === 'user' ? 'text-red-200': 'text-brand-accent'}`}>
                      {msg.sender === 'user' ? 'You' : (msg.text.toLowerCase().includes("ai mentor feedback") ? "AI Mentor" : msg.text.toLowerCase().includes("filing procedure") ? "Procedural Guide" : msg.text.toLowerCase().includes("ai generated facts") ? "Fact Scenario" : "System")}
                    </p>
                    {msg.text.replace(/^(AI Mentor Feedback:|System Instructions:|Task Selected:|AI Generated Facts:|Objective:|Relevant Laws:|Difficulty:|Filing Procedure for.*?:|Generating unique facts for your scenario...|Selected Document Type:|Preparing scenario for.*?:|Selected:)/gmi, '').trim()}
                  </div>
                ))}
                {isLoadingAiInteraction && <LoadingSpinner text="AI is processing..." size="sm" className="my-3" spinnerColor="text-brand-accent" />}
              </div>
              {stage === 'task_details_display' && !isLoading && (
                   <div className="pt-4 mt-auto border-t border-[var(--neumorphic-shadow-dark-var)] opacity-60 flex-shrink-0">
                      <Button onClick={handleProceedToDrafting} variant="primary" fullWidth disabled={isLoading}>
                          Proceed to Drafting
                      </Button>
                  </div>
              )}
            </Card>
          )}
        </div>

        {currentTask && stage !== 'task_selection' && stage !== 'fact_generation_loading' && (
          <Card className="lg:col-span-2 flex flex-col lg:max-h-[calc(100vh-12rem)] overflow-y-auto custom-scrollbar"> 
            <h3 className="text-xl font-semibold text-brand-accent mb-4 pb-3 border-b border-[var(--neumorphic-shadow-dark-var)] opacity-60 flex-shrink-0">Your Draft for: <span className="font-normal">{currentTask.type}</span></h3> 
            
            <textarea
              value={userDraft}
              onChange={(e) => setUserDraft(e.target.value)}
              placeholder={
                (stage === 'task_details_display' && !userDraft.trim()) ? "Review facts & instructions. Click 'Proceed to Drafting' or start typing here to enable submission." :
                (stage === 'drafting' || (stage === 'task_details_display' && userDraft.trim() !== '') || stage === 'feedback_review') ? 
                `Start drafting your ${currentTask.type} here...\nObjective: ${currentTask.objective}\nConsider the AI-generated facts and relevant ${practiceMode} laws from the instruction panel.`
                : "Please wait or select a new task."
              }
              className="w-full flex-grow p-3 bg-brand-bg-primary text-brand-text-primary rounded-md shadow-neumorphic-pressed focus:ring-2 focus:ring-brand-accent focus:outline-none resize-none custom-scrollbar placeholder-brand-text-secondary text-sm leading-relaxed min-h-[300px] lg:min-h-[400px] overflow-y-auto"
              rows={15}
              disabled={isLoading || (stage !== 'drafting' && stage !== 'task_details_display' && stage !== 'feedback_review')}
              aria-label={`Drafting area for ${currentTask.type}`}
            />
            {sectionOptions.length > 0 && (stage === 'drafting' || stage === 'feedback_review' || (stage === 'task_details_display' && userDraft.trim() !== '')) && (
                 <div className="py-4 border-t border-[var(--neumorphic-shadow-dark-var)] opacity-60 mt-4 flex-shrink-0">
                    <SelectInput
                        label="Focus Feedback on Section (Optional)"
                        options={[{value: "", label: "-- Review Entire Draft --"}, ...sectionOptions]}
                        value={selectedSectionId || ""}
                        onChange={(e) => setSelectedSectionId(e.target.value || null)}
                        disabled={isLoading}
                        containerClassName="mb-0"
                    />
                </div>
            )}
            <div className="pt-4 mt-auto border-t border-[var(--neumorphic-shadow-dark-var)] opacity-60 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3 flex-shrink-0">
              <Button 
                onClick={handleSubmitForReview} 
                disabled={!canSubmitForReview}
                className="w-full sm:w-auto flex-grow sm:flex-grow-0"
                variant="primary"
                aria-label={submitButtonText}
              >
                {submitButtonText}
              </Button>
              {canGetFilingInfo && (
                <Button 
                  onClick={handleGetFilingInfo} 
                  disabled={isLoading}
                  variant="secondary" 
                  className="w-full sm:w-auto flex-grow sm:flex-grow-0"
                  aria-label={messages.some(m => m.text.toLowerCase().includes("filing procedure")) ? 'Re-check filing information' : 'Learn filing procedure for this document type'}
                >
                  {messages.some(m => m.text.toLowerCase().includes("filing procedure")) ? 'Re-Check Filing Info' : 'Learn Filing Procedure'}
                </Button>
              )}
            </div>
            {stage === 'task_details_display' && !isLoading && !userDraft.trim() && (
                <div className="pt-4 text-center text-brand-text-secondary flex-grow flex items-center justify-center flex-shrink-0">
                    <p>Review task details and AI-generated facts in the left panel. Click "Proceed to Drafting" or start typing above when ready.</p>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DraftingStudioScreen;
