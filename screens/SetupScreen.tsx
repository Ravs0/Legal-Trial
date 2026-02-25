
import React, { useState, useContext, useEffect, ChangeEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { SelectInput } from '../components/SelectInput';
import { Card } from '../components/Card';
import { TrialSimContext } from '../App';
import {
  CASE_CATEGORIES, CASES, JUDGE_PERSONALITIES, OPPOSING_COUNSEL_PERSONALITIES,
  INTERNATIONAL_CASE_CATEGORIES, INTERNATIONAL_CASES,
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
    <div className="max-w-7xl mx-auto animate-fadeIn relative z-10">
      <div className="absolute top-[-10%] right-[-5%] w-[30rem] h-[30rem] bg-brand-accent/5 rounded-full blur-[100px] pointer-events-none -z-10"></div>

      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center space-x-2 mb-4">
          <div className="h-px w-8 bg-brand-accent/50"></div>
          <span className="text-xs font-mono text-brand-accent tracking-widest uppercase">Configuration</span>
          <div className="h-px w-8 bg-brand-accent/50"></div>
        </div>
        <h2 className="text-4xl md:text-5xl font-bold text-shimmer font-serif tracking-tight drop-shadow-md">
          Setup New {modeDisplay} Practice Session
        </h2>
      </div>

      <div className="grid md:grid-cols-3 gap-x-8 gap-y-8">
        <Card className="flex flex-col md:col-span-1 space-y-6 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
          <div className="relative z-10 space-y-5">
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
            <div className="h-px w-full bg-gradient-to-r from-transparent via-brand-accent/20 to-transparent my-2"></div>
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
            <div className="h-px w-full bg-gradient-to-r from-transparent via-brand-accent/20 to-transparent my-2"></div>
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
              className="opacity-50 cursor-not-allowed filter grayscale"
            />
          </div>
        </Card>

        <div className="md:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {selectedCaseDetails && (
            <Card className="flex flex-col h-full bg-brand-navy/30 hover:bg-brand-navy/40 transition-colors">
              <div className="flex items-center mb-4 pb-4 border-b border-brand-accent/10">
                <div className="w-12 h-12 rounded-lg bg-brand-navy border border-brand-accent/20 flex items-center justify-center mr-4 shadow-inner-subtle">
                  <DocumentTextIcon className="h-6 w-6 text-brand-accent" />
                </div>
                <h4 className="font-semibold text-brand-text-primary text-xl font-serif">Selected Case</h4>
              </div>
              <p className="font-semibold text-brand-text-primary text-lg mb-2">{selectedCaseDetails.title}</p>
              <div className="inline-block px-2.5 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/20 self-start mb-4">
                <span className="text-xs font-mono text-brand-accent uppercase tracking-wider">{selectedCaseDetails.difficulty}</span>
              </div>
              <p className="text-brand-text-secondary text-sm mb-6 flex-grow leading-relaxed font-light">{selectedCaseDetails.briefFacts}</p>

              <h5 className="font-medium text-brand-text-primary mt-2 mb-2 text-sm uppercase tracking-wider font-mono">Key Legal Issues</h5>
              <ul className="space-y-2 mb-6 text-brand-text-secondary text-sm font-light">
                {selectedCaseDetails.legalIssues.map((issue, i) => (
                  <li key={i} className="flex items-start">
                    <span className="text-brand-accent mr-2 mt-0.5 opacity-70">◆</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>

              <h5 className="font-medium text-brand-text-primary mb-2 text-sm uppercase tracking-wider font-mono">{practiceMode === 'indian' ? "Articles/Sections" : "Instruments/Principles"}</h5>
              <p className="text-brand-text-secondary text-sm font-light p-3 rounded-lg bg-brand-bg-primary/50 border border-brand-border-light">{selectedCaseDetails.relevantArticlesSections}</p>
            </Card>
          )}

          <div className="space-y-8 flex flex-col h-full">
            {selectedJudgeDetails && (
              <Card className="flex flex-col flex-1 bg-brand-navy/30 hover:bg-brand-navy/40 transition-colors">
                <div className="flex items-center mb-4 pb-4 border-b border-brand-accent/10">
                  <div className="w-12 h-12 rounded-lg bg-brand-navy border border-brand-accent/20 flex items-center justify-center mr-4 shadow-inner-subtle">
                    <GavelIcon className="h-6 w-6 text-brand-accent" />
                  </div>
                  <h4 className="font-semibold text-brand-text-primary text-xl font-serif">The Bench</h4>
                </div>
                <p className="font-bold text-brand-text-primary text-lg mb-2">{selectedJudgeDetails.name}</p>
                <p className="text-brand-text-secondary text-sm line-clamp-6 leading-relaxed font-light flex-grow">{selectedJudgeDetails.description}</p>
              </Card>
            )}
            {selectedOpposingCounselDetails && (
              <Card className="flex flex-col flex-1 bg-brand-navy/30 hover:bg-brand-navy/40 transition-colors">
                <div className="flex items-center mb-4 pb-4 border-b border-brand-accent/10">
                  <div className="w-12 h-12 rounded-lg bg-brand-navy border border-brand-accent/20 flex items-center justify-center mr-4 shadow-inner-subtle">
                    <BriefcaseIcon className="h-6 w-6 text-brand-accent" />
                  </div>
                  <h4 className="font-semibold text-brand-text-primary text-xl font-serif">Opposing Counsel</h4>
                </div>
                <p className="font-bold text-brand-text-primary text-lg mb-1">{selectedOpposingCounselDetails.name}</p>
                <p className="text-xs font-mono text-brand-accent mb-3 tracking-widest uppercase">{selectedOpposingCounselDetails.specialty}</p>
                <p className="text-brand-text-secondary text-sm line-clamp-4 leading-relaxed font-light">{selectedOpposingCounselDetails.description}</p>
              </Card>
            )}
          </div>
          {(!selectedCaseDetails || !selectedJudgeDetails || !selectedOpposingCounselDetails) && !currentCases.length && (
            <Card className="md:col-span-2 lg:col-span-1 flex items-center justify-center p-12 text-center border-dashed border-2 border-brand-accent/20 bg-brand-bg-primary/20">
              <p className="text-brand-text-secondary max-w-sm">Please make your selections from the panel. If dropdowns are empty, no data is configured for <span className="font-semibold text-brand-accent">{modeDisplay}</span> mode.</p>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-12 pt-8 border-t border-brand-accent/10 relative">
        <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-brand-accent/30 to-transparent"></div>

        {selectedCaseDetails && selectedJudgeDetails && selectedOpposingCounselDetails ? (
          <div className="max-w-xl mx-auto">
            <Button
              onClick={handleStartSession}
              fullWidth
              size="lg"
              variant="primary"
              disabled={!selectedCaseDetails || !selectedJudgeDetails || !selectedOpposingCounselDetails}
              className="py-4 text-xl shadow-glow-gold hover:-translate-y-1 transition-all duration-300"
            >
              <span>Enter the Arena</span>
            </Button>
            <p className="text-center mt-4 text-xs font-mono text-brand-text-secondary/60">
              Case: {selectedCaseDetails.title.substring(0, 25)}{selectedCaseDetails.title.length > 25 ? '...' : ''}
            </p>
          </div>
        ) : (
          <p className="text-center text-sm font-mono text-brand-text-secondary/60 tracking-widest uppercase">
            Awaiting complete configuration for {modeDisplay} arena
          </p>
        )}
      </div>
    </div>
  );
};

export default SetupScreen;
