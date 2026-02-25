
import React, { useState, useContext, ChangeEvent, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { TrialSimContext } from '../App';
import {
  CASES, CASE_CATEGORIES,
  JUDGE_PERSONALITIES, OPPOSING_COUNSEL_PERSONALITIES,
  INTERNATIONAL_CASES, INTERNATIONAL_CASE_CATEGORIES,
  INTERNATIONAL_JUDGE_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES,
  ROUTES
} from '../constants';
import { CaseCategory, CaseDetail, CaseDifficulty, JudgePersonality, OpposingCounselPersonality, SessionSettings, SessionType, PracticeMode } from '../types';
import { SelectInput } from '../components/SelectInput';
import { Modal } from '../components/Modal';
import { DocumentTextIcon } from '../components/icons/DocumentTextIcon';

const DifficultyBadge: React.FC<{ difficulty: CaseDifficulty }> = ({ difficulty }) => {
  let bgColor = 'bg-brand-navy/60';
  let borderColor = 'border-brand-border-light';
  let textColor = 'text-brand-text-secondary';
  let glow = '';

  if (difficulty === CaseDifficulty.ADVANCED) {
    bgColor = 'bg-brand-accent/10';
    borderColor = 'border-brand-accent/40';
    textColor = 'text-brand-accent';
    glow = 'shadow-[0_0_10px_rgba(201,168,76,0.2)]';
  }

  return (
    <span
      className={`px-3 py-1.5 text-[10px] font-mono tracking-widest uppercase border ${borderColor} ${textColor} ${bgColor} rounded border backdrop-blur-sm ${glow} transition-colors duration-300`}
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
    <div className="space-y-16 animate-fadeIn pb-12 overflow-x-hidden relative">
      <div className="absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] bg-brand-accent/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>

      <div className="text-center pt-8 relative z-10 max-w-4xl mx-auto px-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-brand-navy border border-brand-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-glow-gold-sm">
          <DocumentTextIcon className="h-8 w-8 sm:h-10 sm:w-10 text-brand-accent drop-shadow-md" />
        </div>
        <div className="inline-flex items-center justify-center space-x-2 mb-3 opacity-80">
          <div className="h-px w-8 bg-brand-accent/50"></div>
          <span className="text-[10px] font-mono text-brand-accent tracking-widest uppercase">{modeDisplay} Context</span>
          <div className="h-px w-8 bg-brand-accent/50"></div>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-shimmer font-serif tracking-tight drop-shadow-md mb-4">Case Library</h1>
        <p className="text-brand-text-secondary font-light max-w-2xl mx-auto leading-relaxed">
          An exclusive archive of procedural and substantive legal scenarios. Review the docket and select a matter to commence practice.
        </p>
      </div>

      <div className="space-y-16 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {activeCaseCategories.map((category: CaseCategory) => {
          const categoryCases = activeCases.filter(c => c.categoryId === category.id);

          return (
            <section key={category.id} aria-labelledby={`category-title-${category.id}`} className="scroll-mt-24 relative">
              <div className="mb-8 flex items-end justify-between border-b border-brand-accent/20 pb-4">
                <div className="flex items-center">
                  <div className="w-1.5 h-8 bg-brand-accent mr-4 shadow-[0_0_10px_rgba(201,168,76,0.5)]"></div>
                  <div>
                    <h2 id={`category-title-${category.id}`} className="text-3xl font-semibold text-brand-text-primary font-serif tracking-tight">{category.name}</h2>
                    <p className="text-sm font-light text-brand-text-secondary mt-1">{category.description}</p>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <span className="text-xs font-mono text-brand-text-secondary/50 uppercase tracking-widest">{categoryCases.length} Matters</span>
                </div>
              </div>

              {categoryCases.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                  {categoryCases.map((caseDetail: CaseDetail) => (
                    <Card
                      key={caseDetail.id}
                      className="flex flex-col h-full overflow-hidden group border border-brand-accent/10 hover:border-brand-accent/30 transition-all duration-300 bg-brand-navy/40 backdrop-blur-sm p-0"
                      onClick={() => handlePracticeCase(caseDetail)}
                    >
                      <div className="p-6 pb-0 flex-grow">
                        <div className="flex justify-between items-start mb-5">
                          <DifficultyBadge difficulty={caseDetail.difficulty} />
                          <div className="w-8 h-8 rounded-full bg-brand-accent/5 border border-brand-accent/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <svg className="w-4 h-4 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                          </div>
                        </div>

                        <h4 className="text-xl font-serif font-semibold text-brand-text-primary mb-3 line-clamp-2 leading-tight group-hover:text-brand-accent transition-colors duration-300" title={caseDetail.title}>{caseDetail.title}</h4>

                        <p className="text-sm font-light text-brand-text-secondary/80 mb-6 line-clamp-3 leading-relaxed">{caseDetail.briefFacts}</p>

                        <div className="mb-6">
                          <h5 className="text-[10px] font-mono font-semibold text-brand-accent uppercase tracking-widest mb-2 flex items-center">
                            <span className="w-3 h-px bg-brand-accent/50 mr-2"></span>Key Legal Issues
                          </h5>
                          <ul className="text-xs text-brand-text-primary/90 space-y-2 font-light">
                            {caseDetail.legalIssues.slice(0, 3).map((issue, idx) => (
                              <li key={idx} className="flex items-start">
                                <span className="text-brand-accent/50 mr-2 mt-0.5">•</span>
                                <span className="line-clamp-2 leading-snug">{issue}</span>
                              </li>
                            ))}
                            {caseDetail.legalIssues.length > 3 && <li className="text-brand-text-secondary/60 italic text-[11px] pl-3">+{caseDetail.legalIssues.length - 3} additional issues</li>}
                          </ul>
                        </div>
                      </div>

                      <div className="p-6 pt-0 mt-auto">
                        <Button variant="outline" size="sm" fullWidth className="group-hover:bg-brand-accent group-hover:text-brand-accent-text group-hover:border-brand-accent transition-all duration-300 shadow-none border-brand-accent/20 text-brand-text-primary py-2.5">
                          Review Case File
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="p-12 border border-dashed border-brand-accent/20 rounded-2xl bg-brand-navy/20 flex items-center justify-center">
                  <p className="text-brand-text-secondary font-light">No cases currently available in this docket for {modeDisplay} mode.</p>
                </div>
              )}
            </section>
          )
        })}
      </div>

      {selectedCaseForPractice && selectedJudge && selectedOpposingCounsel && (
        <Modal
          isOpen={!!selectedCaseForPractice}
          onClose={() => setSelectedCaseForPractice(null)}
          title="Case Setup Configuration"
          size="xl"
        >
          <div className="space-y-8">
            <div className="bg-brand-navy/50 p-5 rounded-xl border border-brand-accent/10">
              <div className="flex items-center space-x-3 mb-2">
                <DifficultyBadge difficulty={selectedCaseForPractice.difficulty} />
                <span className="text-[10px] font-mono tracking-widest uppercase text-brand-text-secondary/60">{modeDisplay} Arena</span>
              </div>
              <h3 className="text-2xl font-serif font-semibold text-brand-text-primary leading-tight">{selectedCaseForPractice.title}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
              <div className="space-y-4">
                <SelectInput
                  label="The Bench (Judge)"
                  options={judgeOptions}
                  value={selectedJudge.id}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    const judge = currentJudges.find(j => j.id === e.target.value);
                    if (judge) setSelectedJudge(judge);
                  }}
                  containerClassName="mb-1"
                />
                <div className="p-4 bg-brand-bg-primary/50 border border-brand-border-light rounded-xl shadow-inner-subtle min-h-[140px] flex flex-col">
                  <h5 className="font-semibold text-brand-accent text-sm mb-1">{selectedJudge.name}</h5>
                  <p className="text-xs font-light text-brand-text-secondary leading-relaxed line-clamp-4 flex-grow">{selectedJudge.description}</p>
                </div>
              </div>

              <div className="space-y-4">
                <SelectInput
                  label="Opposing Counsel"
                  options={opposingCounselOptions}
                  value={selectedOpposingCounsel.id}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    const oc = currentOCs.find(o => o.id === e.target.value);
                    if (oc) setSelectedOpposingCounsel(oc);
                  }}
                  containerClassName="mb-1"
                />
                <div className="p-4 bg-brand-bg-primary/50 border border-brand-border-light rounded-xl shadow-inner-subtle min-h-[140px] flex flex-col">
                  <div className="mb-1">
                    <h5 className="font-semibold text-brand-accent text-sm inline-block mr-2">{selectedOpposingCounsel.name}</h5>
                    <span className="text-[10px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">({selectedOpposingCounsel.specialty})</span>
                  </div>
                  <p className="text-xs font-light text-brand-text-secondary leading-relaxed line-clamp-4 flex-grow">{selectedOpposingCounsel.description}</p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-brand-accent/10 flex justify-end space-x-4">
              <Button variant="outline" onClick={() => setSelectedCaseForPractice(null)} className="px-6 border-brand-text-secondary/30 text-brand-text-secondary hover:text-brand-text-primary">Cancel</Button>
              <Button variant="primary" onClick={confirmPractice} className="px-8 shadow-glow-gold-sm hover:-translate-y-0.5">Commence Practice</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default CaseLibraryScreen;
