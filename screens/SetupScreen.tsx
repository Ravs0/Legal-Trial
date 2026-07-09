import React, { useState, useContext, useEffect, ChangeEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { SelectInput } from '../components/SelectInput';
import { TrialSimContext } from '../App';
import {
  CASE_CATEGORIES, CASES, JUDGE_PERSONALITIES, OPPOSING_COUNSEL_PERSONALITIES,
  INTERNATIONAL_CASE_CATEGORIES, INTERNATIONAL_CASES,
  INTERNATIONAL_JUDGE_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES,
  ROUTES,
} from '../constants';
import { CaseCategoryId, CaseDetail, JudgePersonality, JudgePersonalityId, SessionType, CaseDifficulty, SessionSettings, OpposingCounselPersonalityId, OpposingCounselPersonality } from '../types';
import { DocumentTextIcon } from '../components/icons/DocumentTextIcon';
import { GavelIcon } from '../components/icons/GavelIcon';
import { BriefcaseIcon } from '../components/icons/BriefcaseIcon';
import { savePendingSettings, loadCompletedSessions } from '../services/storageService';
import { trackEvent } from '../services/analyticsService';
import { PhotoHero } from '../components/PhotoHero';
import { PatternPanel, SurfacePattern } from '../components/SurfacePattern';
import courtroomLuxury from '../assets/courtroom_luxury.jpg';
import libraryBooks from '../assets/library_books.jpg';
import judgeGavel from '../assets/judge_gavel.jpg';
import counselScales from '../assets/counsel_scales.jpg';

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
  const [validationError, setValidationError] = useState<string | null>(null);

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
      setValidationError("Please select a case, a judge personality, and an opposing counsel. Practice mode must also be selected.");
      return;
    }
    setValidationError(null);

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
    savePendingSettings(sessionSettings);
    const completedCount = loadCompletedSessions().length;
    if (completedCount > 0) {
      trackEvent('second_session_started', { source: 'setup', completedSessions: completedCount });
    }
    trackEvent('setup_session_started', {
      mode: practiceMode,
      caseId: selectedCaseDetails.id,
      caseTitle: selectedCaseDetails.title,
      sessionType: selectedSessionType,
      difficulty: selectedDifficulty,
    });

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
    <div className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar animate-fadeIn relative z-10">
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6 pb-12">
        <PhotoHero
          image={courtroomLuxury}
          size="md"
          eyebrow={`${modeDisplay} mode · configuration`}
          title="New trial setup"
          subtitle="Pick case, bench, and session length. One path into the arena."
        />

        {/* Quick visual anchors */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { img: libraryBooks, label: 'Case' },
            { img: judgeGavel, label: 'Bench' },
            { img: counselScales, label: 'Counsel' },
          ].map((t) => (
            <div
              key={t.label}
              className="relative overflow-hidden rounded-lg border border-brand-border h-14 sm:h-16"
            >
              <img src={t.img} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/55" />
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(135deg, transparent, transparent 8px, rgba(255,255,255,0.06) 8px, rgba(255,255,255,0.06) 9px)',
                }}
              />
              <span className="relative z-10 flex h-full items-center justify-center text-[11px] sm:text-[12px] uppercase tracking-wide text-white/80">
                {t.label}
              </span>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-4 sm:gap-5">
          <PatternPanel pattern="dots" className="md:col-span-1 p-4 sm:p-5">
            <div className="space-y-4">
              <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">Controls</p>
              <SelectInput
                label="Case Category"
                options={caseCategoryOptions}
                value={selectedCategoryId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedCategoryId(e.target.value as CaseCategoryId)}
                placeholder={currentCaseCategories.length === 0 ? 'No categories for mode' : 'Select Category'}
                disabled={currentCaseCategories.length === 0}
              />
              <SelectInput
                label="Specific Case"
                options={caseOptions}
                value={selectedCaseId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedCaseId(e.target.value)}
                disabled={!selectedCategoryId || availableCases.length === 0}
                placeholder={availableCases.length === 0 ? 'No cases in category' : 'Select a case'}
              />
              <div className="h-px w-full bg-brand-border" />
              <SelectInput
                label="Judge Personality"
                options={judgeOptions}
                value={selectedJudgeId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedJudgeId(e.target.value as JudgePersonalityId)}
                placeholder={currentJudges.length === 0 ? 'No judges for mode' : 'Select Judge'}
                disabled={currentJudges.length === 0}
              />
              <SelectInput
                label="Opposing Counsel"
                options={opposingCounselOptions}
                value={selectedOpposingCounselId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedOpposingCounselId(e.target.value as OpposingCounselPersonalityId)}
                placeholder={currentOCs.length === 0 ? 'No OCs for mode' : 'Select Opposing Counsel'}
                disabled={currentOCs.length === 0}
              />
              <div className="h-px w-full bg-brand-border" />
              <SelectInput
                label="Session Type"
                options={sessionTypeOptions}
                value={selectedSessionType}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedSessionType(e.target.value as SessionType)}
              />
              <SelectInput
                label="Difficulty (from case)"
                options={difficultyOptions}
                value={selectedDifficulty}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedDifficulty(e.target.value as CaseDifficulty)}
                disabled
                className="opacity-50 cursor-not-allowed"
              />
            </div>
          </PatternPanel>

          <div className="md:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {selectedCaseDetails && (
              <PatternPanel pattern="lines" className="flex flex-col p-0 overflow-hidden">
                <div className="relative h-20 sm:h-24 overflow-hidden border-b border-brand-border">
                  <img src={libraryBooks} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/40" />
                  <div className="relative z-10 h-full flex items-center gap-3 px-4">
                    <div className="w-9 h-9 rounded-lg bg-black/40 border border-white/15 flex items-center justify-center">
                      <DocumentTextIcon className="h-4 w-4 text-white/80" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-white/50">Selected case</p>
                      <p className="text-[14px] font-medium text-white line-clamp-1">{selectedCaseDetails.title}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 sm:p-5 flex flex-col flex-grow">
                  <span className="self-start px-2 py-0.5 rounded border border-brand-border text-[11px] text-brand-text-secondary uppercase tracking-wide mb-3">
                    {selectedCaseDetails.difficulty}
                  </span>
                  <p className="text-brand-text-secondary text-[13px] mb-4 flex-grow leading-relaxed">
                    {selectedCaseDetails.briefFacts}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary mb-2">Key issues</p>
                  <ul className="space-y-1.5 mb-4 text-brand-text-secondary text-[13px]">
                    {selectedCaseDetails.legalIssues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-white/40 mt-0.5">·</span>
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary mb-1.5">
                    {practiceMode === 'indian' ? 'Articles / sections' : 'Instruments'}
                  </p>
                  <p className="text-brand-text-secondary text-[12px] p-2.5 rounded-lg bg-brand-bg-primary border border-brand-border">
                    {selectedCaseDetails.relevantArticlesSections}
                  </p>
                </div>
              </PatternPanel>
            )}

            <div className="space-y-4 sm:space-y-5 flex flex-col">
              {selectedJudgeDetails && (
                <PatternPanel pattern="grid" className="flex flex-col flex-1 p-0 overflow-hidden">
                  <div className="relative h-16 overflow-hidden border-b border-brand-border">
                    <img src={judgeGavel} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/70" />
                    <div className="relative z-10 h-full flex items-center gap-2.5 px-4">
                      <GavelIcon className="h-4 w-4 text-white/75" />
                      <span className="text-[13px] font-medium text-white">The bench</span>
                    </div>
                  </div>
                  <div className="p-4 flex flex-col flex-grow">
                    <p className="font-medium text-brand-text-primary text-[15px] mb-1.5">{selectedJudgeDetails.name}</p>
                    <p className="text-brand-text-secondary text-[13px] line-clamp-5 leading-relaxed flex-grow">
                      {selectedJudgeDetails.description}
                    </p>
                  </div>
                </PatternPanel>
              )}
              {selectedOpposingCounselDetails && (
                <PatternPanel pattern="dots" className="flex flex-col flex-1 p-0 overflow-hidden">
                  <div className="relative h-16 overflow-hidden border-b border-brand-border">
                    <img src={counselScales} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/70" />
                    <div className="relative z-10 h-full flex items-center gap-2.5 px-4">
                      <BriefcaseIcon className="h-4 w-4 text-white/75" />
                      <span className="text-[13px] font-medium text-white">Opposing counsel</span>
                    </div>
                  </div>
                  <div className="p-4 flex flex-col flex-grow">
                    <p className="font-medium text-brand-text-primary text-[15px] mb-0.5">{selectedOpposingCounselDetails.name}</p>
                    <p className="text-[11px] text-brand-text-secondary uppercase tracking-wide mb-2">
                      {selectedOpposingCounselDetails.specialty}
                    </p>
                    <p className="text-brand-text-secondary text-[13px] line-clamp-4 leading-relaxed">
                      {selectedOpposingCounselDetails.description}
                    </p>
                  </div>
                </PatternPanel>
              )}
            </div>

            {(!selectedCaseDetails || !selectedJudgeDetails || !selectedOpposingCounselDetails) && !currentCases.length && (
              <PatternPanel pattern="grid" className="md:col-span-2 p-10 text-center">
                <p className="text-brand-text-secondary text-[14px] max-w-sm mx-auto">
                  Make selections in the controls panel. Empty dropdowns mean no data for {modeDisplay} mode.
                </p>
              </PatternPanel>
            )}
          </div>
        </div>

        <div className="relative pt-6 border-t border-brand-border">
          <SurfacePattern variant="lines" className="opacity-60 !absolute -inset-x-0 top-0 h-24" />
          {validationError && (
            <div className="relative z-10 max-w-xl mx-auto mb-4 p-3 border border-brand-border bg-brand-bg-secondary text-brand-text-primary text-sm text-center rounded-lg">
              {validationError}
            </div>
          )}
          {selectedCaseDetails && selectedJudgeDetails && selectedOpposingCounselDetails ? (
            <div className="relative z-10 max-w-md mx-auto">
              <Button
                onClick={handleStartSession}
                fullWidth
                size="lg"
                variant="primary"
                disabled={!selectedCaseDetails || !selectedJudgeDetails || !selectedOpposingCounselDetails}
                categoryId={selectedCategoryId || undefined}
                className="py-3.5"
              >
                Enter the arena
              </Button>
              <p className="text-center mt-3 text-[12px] text-brand-text-secondary">
                {selectedCaseDetails.title.length > 40
                  ? `${selectedCaseDetails.title.slice(0, 40)}…`
                  : selectedCaseDetails.title}
              </p>
            </div>
          ) : (
            <p className="relative z-10 text-center text-[12px] text-brand-text-secondary uppercase tracking-wide">
              Complete configuration to enter {modeDisplay} arena
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupScreen;
