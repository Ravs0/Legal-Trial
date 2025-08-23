
import React, { useState, useContext, useEffect, ChangeEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { SelectInput } from '../components/SelectInput';
import { Card } from '../components/Card'; 
import { TrialSimContext } from '../App';
import {
  CASE_CATEGORIES, CASES, JUDGE_PERSONALITIES, OPPOSING_COUNSEL_PERSONALITIES, 
  INTERNATIONAL_CASE_CATEGORIES, INTERNATIONAL_CASES, 
  // Fix: Import separate international personality arrays
  INTERNATIONAL_JUDGE_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES,
  ROUTES,
} from '../constants';
import { CaseCategoryId, CaseDetail, JudgePersonality, JudgePersonalityId, SessionType, CaseDifficulty, SessionSettings, OpposingCounselPersonalityId, OpposingCounselPersonality, PracticeMode } from '../types';
import { DocumentTextIcon } from '../components/icons/DocumentTextIcon';
import { GavelIcon } from '../components/icons/GavelIcon';
import { BriefcaseIcon } from '../components/icons/BriefcaseIcon';

const SetupScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);

  if (!context) throw new Error("TrialSimContext not found");
  const { setCurrentSessionSettings, setIsLoading: setGlobalLoading, practiceMode } = context;

  const currentCases = practiceMode === 'international' ? INTERNATIONAL_CASES : CASES;
  const currentCaseCategories = practiceMode === 'international' ? INTERNATIONAL_CASE_CATEGORIES : CASE_CATEGORIES;
  const currentJudges = practiceMode === 'international' ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES;
  const currentOCs = practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES;
  const modeDisplay = practiceMode ? (practiceMode.charAt(0).toUpperCase() + practiceMode.slice(1)) : '';


  const [selectedCategoryId, setSelectedCategoryId] = useState<CaseCategoryId | ''>(currentCaseCategories[0]?.id || '');
  const [availableCases, setAvailableCases] = useState<CaseDetail[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [selectedJudgeId, setSelectedJudgeId] = useState<JudgePersonalityId | ''>(currentJudges[0]?.id || '');
  const [selectedOpposingCounselId, setSelectedOpposingCounselId] = useState<OpposingCounselPersonalityId | ''>(currentOCs[0]?.id || '');
  const [selectedSessionType, setSelectedSessionType] = useState<SessionType>(SessionType.STANDARD);
  const [selectedDifficulty, setSelectedDifficulty] = useState<CaseDifficulty>(CaseDifficulty.INTERMEDIATE);
  
  const [selectedCaseDetails, setSelectedCaseDetails] = useState<CaseDetail | null>(null);
  const [selectedJudgeDetails, setSelectedJudgeDetails] = useState<JudgePersonality | null>(null);
  const [selectedOpposingCounselDetails, setSelectedOpposingCounselDetails] = useState<OpposingCounselPersonality | null>(null);

  useEffect(() => {
    setSelectedCategoryId(currentCaseCategories[0]?.id || '');
    setSelectedJudgeId(currentJudges[0]?.id || '');
    setSelectedOpposingCounselId(currentOCs[0]?.id || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceMode]);


  useEffect(() => {
    if (selectedCategoryId) {
      const filteredCases = currentCases.filter(c => c.categoryId === selectedCategoryId);
      setAvailableCases(filteredCases);
      if (filteredCases.length > 0) {
        setSelectedCaseId(filteredCases[0].id);
      } else {
        setSelectedCaseId('');
      }
    } else {
      setAvailableCases([]);
      setSelectedCaseId('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId, practiceMode]); 

  useEffect(() => {
    if (selectedCaseId) {
        const caseDetail = currentCases.find(c => c.id === selectedCaseId);
        setSelectedCaseDetails(caseDetail || null);
        if (caseDetail) {
          setSelectedDifficulty(caseDetail.difficulty); 
        }
    } else {
        setSelectedCaseDetails(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaseId, practiceMode]);

  useEffect(() => {
    if (selectedJudgeId) {
        setSelectedJudgeDetails(currentJudges.find(j => j.id === selectedJudgeId) || null);
    } else {
        setSelectedJudgeDetails(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJudgeId, practiceMode]);

  useEffect(() => { 
    if (selectedOpposingCounselId) {
        setSelectedOpposingCounselDetails(currentOCs.find(oc => oc.id === selectedOpposingCounselId) || null);
    } else {
        setSelectedOpposingCounselDetails(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOpposingCounselId, practiceMode]);

  if (!practiceMode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }


  const handleStartSession = () => {
    if (!selectedCaseDetails || !selectedJudgeDetails || !selectedOpposingCounselDetails || !practiceMode) { 
      alert("Please select a case, a judge personality, and an opposing counsel. Practice mode must also be selected.");
      return;
    }
    
    setGlobalLoading(true);

    const sessionSettings: SessionSettings = {
      caseDetail: selectedCaseDetails,
      judgePersonality: selectedJudgeDetails,
      opposingCounselPersonality: selectedOpposingCounselDetails, 
      sessionType: selectedSessionType,
      difficulty: selectedDifficulty, 
      practiceMode: practiceMode, 
    };
    
    setCurrentSessionSettings(sessionSettings);
    
    setTimeout(() => {
        setGlobalLoading(false);
        navigate(ROUTES.PRACTICE);
    }, 500); 
  };

  const caseCategoryOptions = currentCaseCategories.map(cat => ({ value: cat.id, label: cat.name }));
  const caseOptions = availableCases.map(c => ({ value: c.id, label: c.title }));
  const judgeOptions = currentJudges.map(j => ({ value: j.id, label: j.name }));
  const opposingCounselOptions = currentOCs.map(oc => ({ value: oc.id, label: `${oc.name} (${oc.specialty})` })); 
  const sessionTypeOptions = Object.values(SessionType).map(st => ({ value: st, label: st }));
  const difficultyOptions = Object.values(CaseDifficulty).map(d => ({ value: d, label: d }));

  return (
    <div className="max-w-7xl mx-auto animate-slideInUp"> 
        {/* Title uses new red gradient */}
        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-brand-gradient-from via-brand-gradient-mid to-brand-gradient-to text-center mb-10 font-serif">
          Setup New {modeDisplay} Practice Session
        </h2>
        <div className="grid md:grid-cols-3 gap-x-8 gap-y-8"> 
          {/* Selection Card is now standard neumorphic */}
          <Card className="flex flex-col md:col-span-1 space-y-5"> 
            <SelectInput
              label="Case Category"
              options={caseCategoryOptions}
              value={selectedCategoryId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedCategoryId(e.target.value as CaseCategoryId)}
              placeholder={currentCaseCategories.length === 0 ? "No categories for mode" : "Select Category"}
              disabled={currentCaseCategories.length === 0}
            />
            <SelectInput
              label="Specific Case"
              options={caseOptions}
              value={selectedCaseId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedCaseId(e.target.value)}
              disabled={!selectedCategoryId || availableCases.length === 0}
              placeholder={availableCases.length === 0 ? "No cases in category" : "Select a case"}
            />
            <SelectInput
              label="Judge Personality"
              options={judgeOptions}
              value={selectedJudgeId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedJudgeId(e.target.value as JudgePersonalityId)}
              placeholder={currentJudges.length === 0 ? "No judges for mode" : "Select Judge"}
              disabled={currentJudges.length === 0}
            />
            <SelectInput 
              label="Opposing Counsel"
              options={opposingCounselOptions}
              value={selectedOpposingCounselId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedOpposingCounselId(e.target.value as OpposingCounselPersonalityId)}
              placeholder={currentOCs.length === 0 ? "No OCs for mode" : "Select Opposing Counsel"}
              disabled={currentOCs.length === 0}
            />
             <SelectInput
              label="Session Type"
              options={sessionTypeOptions}
              value={selectedSessionType}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedSessionType(e.target.value as SessionType)}
            />
            <SelectInput
              label="Difficulty Level (from case)"
              options={difficultyOptions}
              value={selectedDifficulty}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedDifficulty(e.target.value as CaseDifficulty)}
              disabled 
              className="opacity-70 cursor-not-allowed"
            />
          </Card>

          <div className="md:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {selectedCaseDetails && (
              // Detail cards are standard neumorphic, titles inside are red
              <Card className="flex flex-col h-full"> 
                <div className="flex items-center mb-3">
                    <DocumentTextIcon className="h-7 w-7 text-brand-accent mr-3 flex-shrink-0" />
                    <h4 className="font-semibold text-brand-accent text-xl">Selected Case</h4>
                </div>
                <p className="font-bold text-brand-text-primary text-lg mb-1.5">{selectedCaseDetails.title} <span className="text-sm font-normal text-brand-text-secondary">({selectedCaseDetails.difficulty})</span></p>
                <p className="text-brand-text-secondary text-sm mb-3 flex-grow leading-relaxed">{selectedCaseDetails.briefFacts}</p>
                
                <h5 className="font-medium text-brand-text-primary mt-2 mb-1.5 text-sm">Key Legal Issues:</h5>
                <ul className="list-disc list-inside text-brand-text-secondary text-sm space-y-1">
                    {selectedCaseDetails.legalIssues.map(issue => <li key={issue}>{issue}</li>)}
                </ul>

                <h5 className="font-medium text-brand-text-primary mt-3 mb-1.5 text-sm">{practiceMode === 'indian' ? "Relevant Articles/Sections:" : "Relevant Instruments/Principles:"}</h5>
                <p className="text-brand-text-secondary text-sm">{selectedCaseDetails.relevantArticlesSections}</p>
              </Card>
            )}
            
            <div className="space-y-8">
                {selectedJudgeDetails && (
                    <Card className="flex flex-col">  
                        <div className="flex items-center mb-3">
                            <GavelIcon className="h-7 w-7 text-brand-accent mr-3 flex-shrink-0" />
                            <h4 className="font-semibold text-brand-accent text-xl">Selected Judge</h4>
                        </div>
                        <p className="font-bold text-brand-text-primary text-lg mb-1.5">{selectedJudgeDetails.name}</p>
                        <p className="text-brand-text-secondary text-sm line-clamp-5 leading-relaxed">{selectedJudgeDetails.description}</p>
                    </Card>
                )}
                {selectedOpposingCounselDetails && ( 
                    <Card className="flex flex-col"> 
                        <div className="flex items-center mb-3">
                            <BriefcaseIcon className="h-7 w-7 text-brand-accent mr-3 flex-shrink-0" />
                            <h4 className="font-semibold text-brand-accent text-xl">Opposing Counsel</h4>
                        </div>
                        <p className="font-bold text-brand-text-primary text-lg mb-1.5">{selectedOpposingCounselDetails.name} <span className="text-sm font-normal text-brand-text-secondary">({selectedOpposingCounselDetails.specialty})</span></p>
                        <p className="text-brand-text-secondary text-sm line-clamp-5 leading-relaxed">{selectedOpposingCounselDetails.description}</p>
                    </Card>
                )}
            </div>
            {(!selectedCaseDetails || !selectedJudgeDetails || !selectedOpposingCounselDetails) && !currentCases.length && (
                <Card className="md:col-span-2 lg:col-span-1"> 
                     <p className="text-brand-text-secondary text-center">Please make your selections from the panel on the left. If dropdowns are empty, no data is configured for the current mode: <span className="font-semibold text-brand-accent">{modeDisplay}</span>.</p>
                </Card>
            )}
          </div>
        </div>
        
        <div className="mt-10 pt-8 border-t border-[var(--neumorphic-shadow-dark-var)] opacity-60">
            {selectedCaseDetails && selectedJudgeDetails && selectedOpposingCounselDetails ? ( 
                 <Button 
                    onClick={handleStartSession} 
                    fullWidth 
                    size="lg"
                    variant="primary" // Primary button is solid red
                    disabled={!selectedCaseDetails || !selectedJudgeDetails || !selectedOpposingCounselDetails}
                    className="py-3.5 text-xl"
                  >
                    Start {modeDisplay} Session: {selectedCaseDetails.title.substring(0,20)}{selectedCaseDetails.title.length > 20 ? '...' : ''}
                     <span className="hidden sm:inline"> (vs. {selectedJudgeDetails.name.split(' ').pop()} & {selectedOpposingCounselDetails.name.split(' ').pop()})</span>
                </Button>
            ) : (
                 <p className="text-center text-brand-text-secondary">Please complete all selections (Case, Judge, Opposing Counsel) for the {modeDisplay.toLowerCase()} arena to start the session.</p>
            )}
        </div>
    </div>
  );
};

export default SetupScreen;
