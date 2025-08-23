
import React, { useState, useContext, ChangeEvent, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { TrialSimContext } from '../App';
import { 
  CASES, CASE_CATEGORIES, 
  JUDGE_PERSONALITIES, OPPOSING_COUNSEL_PERSONALITIES, 
  INTERNATIONAL_CASES, INTERNATIONAL_CASE_CATEGORIES,
  // Fix: Import separate international personality arrays
  INTERNATIONAL_JUDGE_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES,
  ROUTES 
} from '../constants';
import { CaseCategory, CaseDetail, CaseDifficulty, JudgePersonality, OpposingCounselPersonality, SessionSettings, SessionType, PracticeMode } from '../types';
import { SelectInput } from '../components/SelectInput';
import { Modal } from '../components/Modal';
import { DocumentTextIcon } from '../components/icons/DocumentTextIcon';

const DifficultyBadge: React.FC<{ difficulty: CaseDifficulty }> = ({ difficulty }) => {
  let bgColor = 'bg-brand-bg-secondary'; // Neutral neumorphic base for non-advanced
  let textColor = 'text-brand-text-primary'; // White/light text on dark neumorphic base
  
  if (difficulty === CaseDifficulty.ADVANCED) {
    bgColor = 'bg-brand-accent'; // Red for advanced
    textColor = 'text-brand-accent-text'; // White text on red
  }
  
  return (
    <span 
      // Standard flat neumorphic shadow for badges
      className={`px-2.5 py-1 text-xs font-semibold ${textColor} ${bgColor} rounded-md shadow-neumorphic-flat`}
    >
      {difficulty}
    </span>
  );
};

const CaseLibraryScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);

  if (!context) throw new Error("TrialSimContext not found");
  const { setCurrentSessionSettings, setIsLoading: setGlobalLoading, practiceMode } = context;

  const [selectedCaseForPractice, setSelectedCaseForPractice] = useState<CaseDetail | null>(null);
  
  const [currentJudges, setCurrentJudges] = useState<JudgePersonality[]>(practiceMode === 'international' ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES);
  const [currentOCs, setCurrentOCs] = useState<OpposingCounselPersonality[]>(practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES);
  
  const [selectedJudge, setSelectedJudge] = useState<JudgePersonality>(currentJudges[0]);
  const [selectedOpposingCounsel, setSelectedOpposingCounsel] = useState<OpposingCounselPersonality>(currentOCs[0]);

  useEffect(() => {
    const judges = practiceMode === 'international' ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES;
    const ocs = practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES;
    setCurrentJudges(judges);
    setCurrentOCs(ocs);
    setSelectedJudge(judges[0] || null); 
    setSelectedOpposingCounsel(ocs[0] || null); 
  }, [practiceMode]);


  if (!practiceMode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }

  const activeCases = practiceMode === 'international' ? INTERNATIONAL_CASES : CASES;
  const activeCaseCategories = practiceMode === 'international' ? INTERNATIONAL_CASE_CATEGORIES : CASE_CATEGORIES;
  const modeDisplay = practiceMode.charAt(0).toUpperCase() + practiceMode.slice(1);


  const handlePracticeCase = (caseDetail: CaseDetail) => {
    setSelectedCaseForPractice(caseDetail);
    const currentJudgesList = practiceMode === 'international' ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES;
    const currentOCList = practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES;
    setSelectedJudge(currentJudgesList[0] || null);
    setSelectedOpposingCounsel(currentOCList[0] || null);
  };

  const confirmPractice = () => {
    if (!selectedCaseForPractice || !selectedJudge || !selectedOpposingCounsel) {
        alert("Please ensure a case, judge, and opposing counsel are selected.");
        return;
    }
    setGlobalLoading(true);
    const sessionSettings: SessionSettings = {
      caseDetail: selectedCaseForPractice,
      judgePersonality: selectedJudge,
      opposingCounselPersonality: selectedOpposingCounsel,
      sessionType: selectedCaseForPractice.difficulty === CaseDifficulty.ADVANCED ? SessionType.DEEP : (selectedCaseForPractice.difficulty === CaseDifficulty.INTERMEDIATE ? SessionType.STANDARD : SessionType.QUICK),
      difficulty: selectedCaseForPractice.difficulty,
      practiceMode: practiceMode, 
    };
    setCurrentSessionSettings(sessionSettings);
    
    setTimeout(() => {
        setGlobalLoading(false);
        setSelectedCaseForPractice(null); 
        navigate(ROUTES.PRACTICE);
    }, 500);
  };

  const judgeOptions = currentJudges.map(j => ({ value: j.id, label: j.name }));
  const opposingCounselOptions = currentOCs.map(oc => ({ value: oc.id, label: `${oc.name} (${oc.specialty})` }));

  return (
    <div className="space-y-10 animate-fadeIn">
      {/* Main title card uses new red gradient */}
      <Card 
        className="bg-gradient-to-br from-brand-gradient-from via-brand-gradient-mid to-brand-gradient-to text-center shadow-neumorphic-raised"
        titleGradient={false} // Gradient is on the card itself, not the text
      >
        <div className="py-8">
          {/* Icon color updated for visibility on red gradient */}
          <DocumentTextIcon className="h-16 w-16 text-brand-accent-text opacity-80 mx-auto mb-4" />
          {/* Text color updated for visibility on red gradient */}
          <h1 className="text-4xl font-bold text-brand-accent-text mb-2 font-serif">Case Library: <span className="italic">{modeDisplay}</span></h1>
          <p className="text-red-100 max-w-xl mx-auto opacity-90"> 
            Browse legal scenarios for the {practiceMode.toLowerCase()} context. Select any case to begin your mock trial practice.
          </p>
        </div>
      </Card>

      {activeCaseCategories.map((category: CaseCategory) => (
        <section key={category.id} aria-labelledby={`category-title-${category.id}`}>
          <div className="mb-6 pb-3 border-b-2 border-brand-accent">
             {/* Section title color updated to red brand-accent */}
            <h2 id={`category-title-${category.id}`} className="text-3xl font-semibold text-brand-accent font-serif">{category.name}</h2>
            <p className="text-sm text-brand-text-secondary mt-1">{category.description}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {activeCases.filter(c => c.categoryId === category.id).map((caseDetail: CaseDetail) => (
              <Card 
                key={caseDetail.id} 
                className="flex flex-col justify-between" 
                hoverEffect 
                onClick={() => handlePracticeCase(caseDetail)}
                title={caseDetail.title} 
                // Card title will default to red brand-accent
              >
                <div>
                  <div className="flex justify-between items-start mb-3 pt-0 px-5">
                    <DifficultyBadge difficulty={caseDetail.difficulty} />
                  </div>
                  <div className="px-5"> 
                    <p className="text-sm text-brand-text-secondary mb-4 line-clamp-3 leading-relaxed">{caseDetail.briefFacts}</p>
                    <div className="mb-4">
                      <h4 className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider mb-1.5">Key Legal Issues:</h4>
                      <ul className="list-disc list-inside text-xs text-brand-text-primary space-y-1">
                        {caseDetail.legalIssues.slice(0,3).map(issue => <li key={issue} className="truncate">{issue}</li>)}
                        {caseDetail.legalIssues.length > 3 && <li className="text-brand-text-secondary italic">...and more</li>}
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="p-5 pt-0"> 
                   {/* Button uses secondary style (red text on hover) */}
                  <Button variant="secondary" size="sm" fullWidth onClick={(e) => { e.stopPropagation(); handlePracticeCase(caseDetail); }} className="mt-auto">
                    Practice This Case
                  </Button>
                </div>
              </Card>
            ))}
            {activeCases.filter(c => c.categoryId === category.id).length === 0 && (
                 <p className="text-brand-text-secondary md:col-span-2 lg:col-span-3 text-center py-4">No cases currently available in this category for the {practiceMode} mode.</p>
            )}
          </div>
        </section>
      ))}

      {selectedCaseForPractice && selectedJudge && selectedOpposingCounsel && (
        <Modal
          isOpen={!!selectedCaseForPractice}
          onClose={() => setSelectedCaseForPractice(null)}
          title={`Quick Setup: ${selectedCaseForPractice.title}`} // Modal title will be red
          size="xl" 
        >
            <p className="text-sm text-brand-text-secondary mb-6">
                You are about to practice the case: <strong>{selectedCaseForPractice.title}</strong> ({selectedCaseForPractice.difficulty}).
                <br/> Configure your session for the {practiceMode} arena.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <SelectInput
                    label="Choose Judge Personality"
                    options={judgeOptions}
                    value={selectedJudge.id}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                        const judge = currentJudges.find(j => j.id === e.target.value);
                        if (judge) setSelectedJudge(judge);
                    }}
                    containerClassName="mb-3"
                />
                <div className="mt-1 p-3 bg-brand-bg-secondary rounded-md text-xs shadow-neumorphic-flat"> {/* Flat neumorphic for inner detail */}
                    {/* Sub-title in red */}
                    <h5 className="font-semibold text-brand-accent mb-0.5">Judge: {selectedJudge.name}</h5>
                    <p className="text-brand-text-secondary line-clamp-3">{selectedJudge.description}</p>
                </div>
              </div>
              <div>
                <SelectInput
                    label="Choose Opposing Counsel"
                    options={opposingCounselOptions}
                    value={selectedOpposingCounsel.id}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                        const oc = currentOCs.find(o => o.id === e.target.value);
                        if (oc) setSelectedOpposingCounsel(oc);
                    }}
                    containerClassName="mb-3"
                />
                <div className="mt-1 p-3 bg-brand-bg-secondary rounded-md text-xs shadow-neumorphic-flat"> {/* Flat neumorphic */}
                     {/* Sub-title in red */}
                    <h5 className="font-semibold text-brand-accent mb-0.5">Opposing Counsel: {selectedOpposingCounsel.name} ({selectedOpposingCounsel.specialty})</h5>
                    <p className="text-brand-text-secondary line-clamp-3">{selectedOpposingCounsel.description}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end space-x-3">
              {/* Buttons use new neumorphic styles */}
              <Button variant="secondary" onClick={() => setSelectedCaseForPractice(null)}>Cancel</Button>
              <Button variant="primary" onClick={confirmPractice}>Start Practice</Button>
            </div>
        </Modal>
      )}
    </div>
  );
};

export default CaseLibraryScreen;
