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
  let bgColor = 'bg-brand-bg-secondary';
  let borderColor = 'border-brand-text-primary/30';
  let textColor = 'text-brand-text-secondary';

  if (difficulty === CaseDifficulty.ADVANCED) {
    bgColor = 'bg-brand-bg-primary';
    borderColor = 'border-brand-accent';
    textColor = 'text-brand-accent';
  }

  return (
    <span
      className={`px-3 py-1.5 text-[10px] font-mono tracking-widest uppercase border ${borderColor} ${textColor} ${bgColor} rounded-none transition-colors duration-300`}
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

  // Custom case state variables
  const [customTitle, setCustomTitle] = useState('');
  const [customBriefFacts, setCustomBriefFacts] = useState('');
  const [customRelevantLaws, setCustomRelevantLaws] = useState('');
  const [customLegalIssues, setCustomLegalIssues] = useState('');
  const [customDifficulty, setCustomDifficulty] = useState<CaseDifficulty>(CaseDifficulty.INTERMEDIATE);
  const [customCategoryId, setCustomCategoryId] = useState<string>('');
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const [fileUploadSuccess, setFileUploadSuccess] = useState<string | null>(null);

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

    const categories = practiceMode === 'international' ? INTERNATIONAL_CASE_CATEGORIES : CASE_CATEGORIES;
    if (categories.length > 0) {
      setCustomCategoryId(categories[0].id);
    }
    setFileUploadError(null);
    setFileUploadSuccess(null);
  }, [practiceMode]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileUploadError(null);
    setFileUploadSuccess(null);

    const reader = new FileReader();

    if (file.name.endsWith('.json')) {
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          
          if (!parsed.briefFacts) {
            setFileUploadError("JSON file must contain at least 'briefFacts' field.");
            return;
          }

          setCustomTitle(parsed.title || file.name.replace('.json', ''));
          setCustomBriefFacts(parsed.briefFacts || '');
          setCustomRelevantLaws(parsed.relevantArticlesSections || parsed.relevantLaws || '');
          setCustomLegalIssues(
            Array.isArray(parsed.legalIssues) 
              ? parsed.legalIssues.join(', ') 
              : (parsed.legalIssues || '')
          );
          if (parsed.difficulty && Object.values(CaseDifficulty).includes(parsed.difficulty)) {
            setCustomDifficulty(parsed.difficulty);
          }
          if (parsed.categoryId) {
            setCustomCategoryId(parsed.categoryId);
          }

          setFileUploadSuccess(`Successfully imported JSON: ${file.name}`);
        } catch (err) {
          setFileUploadError("Failed to parse JSON file.");
        }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCustomBriefFacts(text);
        setCustomTitle(file.name.replace(/\.(txt|md)$/, ''));
        setFileUploadSuccess(`Successfully imported text: ${file.name}`);
      };
      reader.readAsText(file);
    } else {
      setFileUploadError("Unsupported file type. Please upload a .txt, .md, or .json file.");
    }
  };

  const handleLaunchCustomCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customBriefFacts.trim()) {
      alert("Please provide at least the Brief Facts for your custom case.");
      return;
    }

    const categories = practiceMode === 'international' ? INTERNATIONAL_CASE_CATEGORIES : CASE_CATEGORIES;
    const finalCategoryId = customCategoryId || categories[0]?.id || '';

    const customCaseDetail: CaseDetail = {
      id: `custom-case-${Date.now()}`,
      title: customTitle.trim() || "Bespoke Simulated Case",
      categoryId: finalCategoryId as any,
      briefFacts: customBriefFacts.trim(),
      legalIssues: customLegalIssues.split(',').map(x => x.trim()).filter(Boolean),
      relevantArticlesSections: customRelevantLaws.trim() || "Applicable legal principles.",
      precedentCases: "Custom user-supplied context.",
      difficulty: customDifficulty,
    };

    handlePracticeCase(customCaseDetail);
  };


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
      <div className="text-center pt-8 relative z-10 max-w-4xl mx-auto px-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-none flex items-center justify-center mx-auto mb-6">
          <DocumentTextIcon className="h-8 w-8 sm:h-10 sm:w-10 text-brand-accent" />
        </div>
        <div className="inline-flex items-center justify-center space-x-2 mb-3 opacity-80">
          <div className="h-px w-8 bg-brand-text-primary/30"></div>
          <span className="text-[10px] font-mono text-brand-text-primary tracking-widest uppercase">{modeDisplay} Context</span>
          <div className="h-px w-8 bg-brand-text-primary/30"></div>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-brand-text-primary font-serif tracking-tight mb-4">Case Library</h1>
        <p className="text-brand-text-secondary font-light max-w-2xl mx-auto leading-relaxed">
          An exclusive archive of procedural and substantive legal scenarios. Review the docket and select a matter to commence practice.
        </p>
      </div>

      {/* Custom Case Simulator Section */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="p-6 sm:p-8 bg-brand-bg-primary border border-brand-text-primary/30 rounded-none relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-brand-text-primary/30 pb-4 mb-6 gap-4">
            <div className="space-y-1 text-left">
              <h3 className="text-xl sm:text-2xl font-serif font-bold text-brand-text-primary flex items-center">
                <svg className="w-6 h-6 mr-2.5 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                Bespoke Custom Case Simulator
              </h3>
              <p className="text-xs text-brand-text-secondary font-light">
                Upload legal briefs, copy-paste custom facts, and configure your own mock trial simulation instantly.
              </p>
            </div>
            
            <div className="flex-shrink-0">
              <label className="inline-flex items-center px-4 py-2 border border-brand-text-primary/30 rounded-none bg-brand-bg-secondary text-xs font-mono text-brand-text-primary hover:bg-brand-bg-primary cursor-pointer transition-all">
                <span>[ Import .txt, .md, .json ]</span>
                <input 
                  type="file" 
                  accept=".txt,.md,.json" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
              </label>
            </div>
          </div>

          {fileUploadError && (
            <div className="p-3 mb-5 bg-brand-error/15 border border-brand-error/30 text-brand-error rounded-none text-xs text-left animate-fadeIn">
              [ Error ] {fileUploadError}
            </div>
          )}

          {fileUploadSuccess && (
            <div className="p-3 mb-5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-none text-xs text-left animate-fadeIn">
              [ Success ] {fileUploadSuccess}
            </div>
          )}

          <form onSubmit={handleLaunchCustomCase} className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-left">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-mono text-brand-text-primary uppercase tracking-wider">Case Title</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. State of Karnataka v. Ramesh Kumar"
                  className="w-full p-3.5 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-none focus:outline-none focus:ring-1 focus:ring-brand-accent text-sm text-brand-text-primary placeholder-brand-text-secondary/40 font-light"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono text-brand-text-primary uppercase tracking-wider">Docket Category</label>
                  <select
                    value={customCategoryId}
                    onChange={(e) => setCustomCategoryId(e.target.value)}
                    className="w-full p-3.5 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-none focus:outline-none focus:ring-1 focus:ring-brand-accent text-xs text-brand-text-primary font-mono"
                  >
                    {activeCaseCategories.map(cat => (
                      <option key={cat.id} value={cat.id} className="bg-brand-bg-secondary text-brand-text-primary">{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-mono text-brand-text-primary uppercase tracking-wider">Simulation Complexity</label>
                  <select
                    value={customDifficulty}
                    onChange={(e) => setCustomDifficulty(e.target.value as CaseDifficulty)}
                    className="w-full p-3.5 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-none focus:outline-none focus:ring-1 focus:ring-brand-accent text-xs text-brand-text-primary font-mono"
                  >
                    <option value={CaseDifficulty.BEGINNER} className="bg-brand-bg-secondary text-brand-text-primary">Beginner</option>
                    <option value={CaseDifficulty.INTERMEDIATE} className="bg-brand-bg-secondary text-brand-text-primary">Intermediate</option>
                    <option value={CaseDifficulty.ADVANCED} className="bg-brand-bg-secondary text-brand-text-primary">Advanced</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-mono text-brand-text-primary uppercase tracking-wider">Rules of Law / Relevant Statutes</label>
                <input
                  type="text"
                  value={customRelevantLaws}
                  onChange={(e) => setCustomRelevantLaws(e.target.value)}
                  placeholder="e.g. Section 138 of NI Act; Article 14 of Constitution"
                  className="w-full p-3.5 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-none focus:outline-none focus:ring-1 focus:ring-brand-accent text-sm text-brand-text-primary placeholder-brand-text-secondary/40 font-light"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-mono text-brand-text-primary uppercase tracking-wider">Key Legal Issues (comma-separated)</label>
                <input
                  type="text"
                  value={customLegalIssues}
                  onChange={(e) => setCustomLegalIssues(e.target.value)}
                  placeholder="e.g. Burden of proof, validity of notice, signature dispute"
                  className="w-full p-3.5 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-none focus:outline-none focus:ring-1 focus:ring-brand-accent text-sm text-brand-text-primary placeholder-brand-text-secondary/40 font-light"
                />
              </div>
            </div>

            <div className="flex flex-col h-full space-y-4">
              <div className="space-y-1.5 flex-grow flex flex-col">
                <label className="block text-xs font-mono text-brand-text-primary uppercase tracking-wider">Brief Facts of the Case</label>
                <textarea
                  value={customBriefFacts}
                  onChange={(e) => setCustomBriefFacts(e.target.value)}
                  placeholder="Paste or write the absolute facts of your custom dispute here..."
                  className="w-full flex-grow p-4 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-none focus:outline-none focus:ring-1 focus:ring-brand-accent text-sm text-brand-text-primary placeholder-brand-text-secondary/40 font-light resize-none min-h-[160px] custom-scrollbar"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!customBriefFacts.trim()}
                  className="w-full py-4 text-xs tracking-widest font-mono uppercase bg-brand-accent hover:bg-brand-accent-hover text-brand-navy font-bold rounded-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Configure Custom Simulation
                </button>
              </div>
            </div>
          </form>
        </Card>
      </div>

      <div className="space-y-16 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {activeCaseCategories.map((category: CaseCategory) => {
          const categoryCases = activeCases.filter(c => c.categoryId === category.id);

          return (
            <section key={category.id} aria-labelledby={`category-title-${category.id}`} className="scroll-mt-24 relative">
              <div className="mb-8 flex items-end justify-between border-b border-brand-text-primary/30 pb-4">
                <div className="flex items-center">
                  <div className="w-1.5 h-8 bg-brand-accent mr-4"></div>
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
                      className="flex flex-col h-full overflow-hidden group border border-brand-text-primary/30 hover:bg-brand-bg-secondary transition-all duration-300 bg-brand-bg-primary p-0 rounded-none cursor-pointer"
                      onClick={() => handlePracticeCase(caseDetail)}
                    >
                      <div className="p-6 pb-0 flex-grow">
                        <div className="flex justify-between items-start mb-5">
                          <DifficultyBadge difficulty={caseDetail.difficulty} />
                          <div className="w-8 h-8 rounded-none bg-brand-bg-secondary border border-brand-text-primary/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <svg className="w-4 h-4 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                          </div>
                        </div>

                        <h4 className="text-xl font-serif font-semibold text-brand-text-primary mb-3 line-clamp-2 leading-tight group-hover:text-brand-accent transition-colors duration-300" title={caseDetail.title}>{caseDetail.title}</h4>

                        <p className="text-sm font-light text-brand-text-secondary/80 mb-6 line-clamp-3 leading-relaxed">{caseDetail.briefFacts}</p>

                        <div className="mb-6">
                          <h5 className="text-[10px] font-mono font-semibold text-brand-accent uppercase tracking-widest mb-2 flex items-center">
                            <span className="w-3 h-px bg-brand-text-primary/30 mr-2"></span>Key Legal Issues
                          </h5>
                          <ul className="text-xs text-brand-text-primary/90 space-y-2 font-light">
                            {caseDetail.legalIssues.slice(0, 3).map((issue, idx) => (
                              <li key={idx} className="flex items-start">
                                <span className="text-brand-accent mr-2 mt-0.5">•</span>
                                <span className="line-clamp-2 leading-snug">{issue}</span>
                              </li>
                            ))}
                            {caseDetail.legalIssues.length > 3 && <li className="text-brand-text-secondary/60 italic text-[11px] pl-3">+{caseDetail.legalIssues.length - 3} additional issues</li>}
                          </ul>
                        </div>
                      </div>

                      <div className="p-6 pt-0 mt-auto">
                        <Button variant="outline" size="sm" fullWidth className="group-hover:bg-brand-accent group-hover:text-brand-accent-text group-hover:border-brand-accent transition-all duration-300 shadow-none border-brand-text-primary/30 text-brand-text-primary py-2.5">
                          Review Case File
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="p-12 border border-dashed border-brand-text-primary/30 rounded-none bg-brand-bg-secondary flex items-center justify-center">
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
            <div className="bg-brand-bg-secondary p-5 rounded-none border border-brand-text-primary/30">
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
                <div className="p-4 bg-brand-bg-primary border border-brand-text-primary/30 rounded-none min-h-[140px] flex flex-col">
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
                <div className="p-4 bg-brand-bg-primary border border-brand-text-primary/30 rounded-none min-h-[140px] flex flex-col">
                  <div className="mb-1">
                    <h5 className="font-semibold text-brand-accent text-sm inline-block mr-2">{selectedOpposingCounsel.name}</h5>
                    <span className="text-[10px] font-mono text-brand-text-secondary/70 uppercase tracking-wider">({selectedOpposingCounsel.specialty})</span>
                  </div>
                  <p className="text-xs font-light text-brand-text-secondary leading-relaxed line-clamp-4 flex-grow">{selectedOpposingCounsel.description}</p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-brand-text-primary/30 flex justify-end space-x-4">
              <Button variant="outline" onClick={() => setSelectedCaseForPractice(null)} className="px-6 border-brand-text-secondary/30 text-brand-text-secondary hover:text-brand-text-primary">Cancel</Button>
              <Button variant="primary" onClick={confirmPractice} className="px-8">Commence Practice</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default CaseLibraryScreen;
