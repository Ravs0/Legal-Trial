import React, { useState, useContext, useEffect, useRef, useCallback, ChangeEvent } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { SelectInput } from '../components/SelectInput';
import { TrialSimContext } from '../App';
import {
  CASE_CATEGORIES, CASES, JUDGE_PERSONALITIES, OPPOSING_COUNSEL_PERSONALITIES,
  INTERNATIONAL_CASE_CATEGORIES, INTERNATIONAL_CASES,
  INTERNATIONAL_JUDGE_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES,
} from '../constants';
import { ROUTES } from '../routes';
import {
  CaseCategoryId,
  CaseDetail,
  JudgePersonality,
  JudgePersonalityId,
  SessionType,
  CaseDifficulty,
  SessionSettings,
  OpposingCounselPersonalityId,
  OpposingCounselPersonality,
  PracticeMode,
} from '../types';
import { ArrowRight, Check, FileText, Scale } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import {
  savePendingSettings,
  loadPendingSettings,
  loadCompletedSessions,
  isValidSessionSettings,
} from '../services/storageService';
import { trackEvent } from '../services/analyticsService';

const COUNSEL_MATCH_TERMS: Partial<Record<CaseCategoryId, string[]>> = {
  [CaseCategoryId.CONSTITUTIONAL]: ['constitutional', 'human rights'],
  [CaseCategoryId.CRIMINAL]: ['criminal'],
  [CaseCategoryId.COMMERCIAL]: ['commercial', 'corporate', 'arbitration'],
  [CaseCategoryId.LABOR]: ['labor', 'employment'],
  [CaseCategoryId.FAMILY]: ['family', 'gender'],
  [CaseCategoryId.PROPERTY]: ['property', 'civil'],
  [CaseCategoryId.ENVIRONMENTAL_IN]: ['environmental', 'public interest'],
  [CaseCategoryId.IPR_IN]: ['ip', 'intellectual property', 'technology'],
  [CaseCategoryId.PUBLIC_INTERNATIONAL_LAW]: ['public international', 'state disputes', 'state responsibility', 'use of force'],
  [CaseCategoryId.INTERNATIONAL_CRIMINAL_LAW]: ['international criminal', 'criminal law'],
  [CaseCategoryId.INTERNATIONAL_ARBITRATION]: ['arbitration', 'investment'],
  [CaseCategoryId.INTERNATIONAL_HUMAN_RIGHTS]: ['human rights'],
  [CaseCategoryId.LAW_OF_THE_SEA]: ['law of the sea', 'maritime', 'unclos'],
  [CaseCategoryId.INTERNATIONAL_TRADE_LAW]: ['trade', 'wto', 'investment'],
  [CaseCategoryId.INTERNATIONAL_ENVIRONMENTAL_LAW]: ['environmental', 'climate'],
  [CaseCategoryId.INTERNATIONAL_IP_LAW]: ['intellectual property', 'ip', 'trips', 'copyright', 'trademark', 'patent'],
};

const recommendedCounsel = (categoryId: CaseCategoryId, counsel: OpposingCounselPersonality[]) => {
  if (!counsel.length) return null;
  const terms = COUNSEL_MATCH_TERMS[categoryId] || [];
  return counsel.find((candidate) => terms.some((term) => candidate.specialty.toLowerCase().includes(term))) || counsel[0];
};

function resolveCatalog(mode: PracticeMode | null) {
  const isInternational = mode === 'international';
  return {
    cases: isInternational ? INTERNATIONAL_CASES : CASES,
    categories: isInternational ? INTERNATIONAL_CASE_CATEGORIES : CASE_CATEGORIES,
    judges: isInternational ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES,
    counsel: isInternational ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES,
  };
}

/** Prefer in-memory session, then pending local draft, only when mode matches. */
function loadLeaveSafeDraft(
  practiceMode: PracticeMode,
  current: SessionSettings | null,
): SessionSettings | null {
  if (current && isValidSessionSettings(current) && current.practiceMode === practiceMode) {
    return current;
  }
  const pending = loadPendingSettings();
  if (pending && pending.practiceMode === practiceMode) {
    return pending;
  }
  return null;
}

const SetupScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const context = useContext(TrialSimContext);

  if (!context) throw new Error('TrialSimContext not found');
  const {
    currentSessionSettings,
    setCurrentSessionSettings,
    setIsLoading: setGlobalLoading,
    practiceMode,
  } = context;

  const { cases: currentCases, categories: currentCaseCategories, judges: currentJudges, counsel: currentOCs } =
    resolveCatalog(practiceMode);
  const requestedCase = currentCases.find(item => item.id === searchParams.get('case'));
  const modeDisplay = practiceMode ? practiceMode.charAt(0).toUpperCase() + practiceMode.slice(1) : '';

  const initialDraft =
    practiceMode ? loadLeaveSafeDraft(practiceMode, currentSessionSettings) : null;

  const [selectedCategoryId, setSelectedCategoryId] = useState<CaseCategoryId | ''>(
    requestedCase?.categoryId || initialDraft?.caseDetail.categoryId || currentCaseCategories[0]?.id || '',
  );
  const [availableCases, setAvailableCases] = useState<CaseDetail[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(requestedCase?.id || initialDraft?.caseDetail.id || '');
  const [selectedJudgeId, setSelectedJudgeId] = useState<JudgePersonalityId | ''>(
    initialDraft?.judgePersonality.id || currentJudges[0]?.id || '',
  );
  const [selectedOpposingCounselId, setSelectedOpposingCounselId] = useState<OpposingCounselPersonalityId | ''>(
    initialDraft?.opposingCounselPersonality.id || currentOCs[0]?.id || '',
  );
  const [selectedSessionType, setSelectedSessionType] = useState<SessionType>(
    initialDraft?.sessionType || SessionType.STANDARD,
  );
  const [selectedDifficulty, setSelectedDifficulty] = useState<CaseDifficulty>(
    initialDraft?.difficulty || CaseDifficulty.INTERMEDIATE,
  );

  const [selectedCaseDetails, setSelectedCaseDetails] = useState<CaseDetail | null>(null);
  const [selectedJudgeDetails, setSelectedJudgeDetails] = useState<JudgePersonality | null>(null);
  const [selectedOpposingCounselDetails, setSelectedOpposingCounselDetails] =
    useState<OpposingCounselPersonality | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [draftSavedHint, setDraftSavedHint] = useState(false);

  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const hydrateModeRef = useRef<PracticeMode | null>(practiceMode);
  const skipCaseAutoPickRef = useRef(Boolean(requestedCase?.id || initialDraft?.caseDetail.id));
  const skipCounselAutoPickRef = useRef(Boolean(initialDraft?.opposingCounselPersonality.id));

  // Deep links from the library, overview, or palette can change on this route.
  useEffect(() => {
    if (!requestedCase) return;
    skipCaseAutoPickRef.current = true;
    setSelectedCategoryId(requestedCase.categoryId);
    setSelectedCaseId(requestedCase.id);
    setSelectedDifficulty(requestedCase.difficulty);
    // Catalog objects are stable; the selected id is the URL intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCase?.id]);

  // Mode switch: re-seed from leave-safe draft or catalog defaults.
  useEffect(() => {
    if (!practiceMode) return;
    if (hydrateModeRef.current === practiceMode && selectedCategoryId) {
      // Already hydrated for this mode (initial mount).
      return;
    }
    hydrateModeRef.current = practiceMode;
    const draft = loadLeaveSafeDraft(practiceMode, currentSessionSettings);
    const catalog = resolveCatalog(practiceMode);
    if (draft) {
      skipCaseAutoPickRef.current = true;
      skipCounselAutoPickRef.current = true;
      setSelectedCategoryId(draft.caseDetail.categoryId);
      setSelectedCaseId(draft.caseDetail.id);
      setSelectedJudgeId(draft.judgePersonality.id);
      setSelectedOpposingCounselId(draft.opposingCounselPersonality.id);
      setSelectedSessionType(draft.sessionType);
      setSelectedDifficulty(draft.difficulty);
    } else {
      skipCaseAutoPickRef.current = false;
      skipCounselAutoPickRef.current = false;
      setSelectedCategoryId(catalog.categories[0]?.id || '');
      setSelectedJudgeId(catalog.judges[0]?.id || '');
      setSelectedOpposingCounselId(catalog.counsel[0]?.id || '');
      setSelectedCaseId('');
      setSelectedSessionType(SessionType.STANDARD);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceMode]);

  useEffect(() => {
    if (selectedCategoryId) {
      const filteredCases = currentCases.filter((c) => c.categoryId === selectedCategoryId);
      setAvailableCases(filteredCases);
      const caseStillValid = filteredCases.some((c) => c.id === selectedCaseId);
      if (skipCaseAutoPickRef.current && caseStillValid) {
        skipCaseAutoPickRef.current = false;
        return;
      }
      skipCaseAutoPickRef.current = false;
      if (!caseStillValid) {
        if (filteredCases.length > 0) {
          setSelectedCaseId(filteredCases[0].id);
          if (!skipCounselAutoPickRef.current) {
            const match = recommendedCounsel(filteredCases[0].categoryId, currentOCs);
            setSelectedOpposingCounselId(match?.id || '');
          }
        } else {
          setSelectedCaseId('');
        }
      }
    } else {
      setAvailableCases([]);
      setSelectedCaseId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId, practiceMode]);

  useEffect(() => {
    if (selectedCaseId) {
      const caseDetail = currentCases.find((c) => c.id === selectedCaseId);
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
      setSelectedJudgeDetails(currentJudges.find((j) => j.id === selectedJudgeId) || null);
    } else {
      setSelectedJudgeDetails(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJudgeId, practiceMode]);

  useEffect(() => {
    if (selectedOpposingCounselId) {
      skipCounselAutoPickRef.current = false;
      setSelectedOpposingCounselDetails(currentOCs.find((oc) => oc.id === selectedOpposingCounselId) || null);
    } else {
      setSelectedOpposingCounselDetails(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOpposingCounselId, practiceMode]);

  const buildSessionSettings = useCallback((): SessionSettings | null => {
    if (!selectedCaseDetails || !selectedJudgeDetails || !selectedOpposingCounselDetails || !practiceMode) {
      return null;
    }
    return {
      caseDetail: selectedCaseDetails,
      judgePersonality: selectedJudgeDetails,
      opposingCounselPersonality: selectedOpposingCounselDetails,
      sessionType: selectedSessionType,
      difficulty: selectedDifficulty,
      practiceMode,
    };
  }, [
    selectedCaseDetails,
    selectedJudgeDetails,
    selectedOpposingCounselDetails,
    selectedSessionType,
    selectedDifficulty,
    practiceMode,
  ]);

  /** Persist a complete draft so leaving Setup / refreshing does not lose config. */
  const persistDraft = useCallback(
    (settings: SessionSettings | null) => {
      if (!settings || !isValidSessionSettings(settings)) return false;
      savePendingSettings(settings);
      return true;
    },
    [],
  );

  // Autosave leave-safe draft whenever configuration is complete.
  useEffect(() => {
    if (startingRef.current) return undefined;
    const settings = buildSessionSettings();
    if (!settings) return undefined;
    if (!persistDraft(settings)) return undefined;
    setDraftSavedHint(true);
    const t = window.setTimeout(() => setDraftSavedHint(false), 1600);
    return () => window.clearTimeout(t);
  }, [buildSessionSettings, persistDraft]);

  // Flush draft on hide / unload so mid-setup leave is durable.
  useEffect(() => {
    const flush = () => {
      if (startingRef.current) return;
      persistDraft(buildSessionSettings());
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [buildSessionSettings, persistDraft]);

  // Never leave the global loading spinner stuck if user navigates away mid-start.
  useEffect(() => {
    return () => {
      if (startTimerRef.current != null) {
        clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
        setGlobalLoading(false);
      }
    };
  }, [setGlobalLoading]);

  if (!practiceMode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }

  const handleStartSession = () => {
    const sessionSettings = buildSessionSettings();
    if (!sessionSettings) {
      setValidationError(
        'Please select a case, a judge personality, and an opposing counsel. Practice mode must also be selected.',
      );
      return;
    }
    setValidationError(null);
    startingRef.current = true;
    setGlobalLoading(true);

    setCurrentSessionSettings(sessionSettings);
    savePendingSettings(sessionSettings);
    const completedCount = loadCompletedSessions().length;
    if (completedCount > 0) {
      trackEvent('second_session_started', { source: 'setup', completedSessions: completedCount });
    }
    trackEvent('setup_session_started', {
      mode: practiceMode,
      caseId: sessionSettings.caseDetail.id,
      caseTitle: sessionSettings.caseDetail.title,
      sessionType: selectedSessionType,
      difficulty: selectedDifficulty,
    });

    if (startTimerRef.current != null) {
      clearTimeout(startTimerRef.current);
    }
    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      setGlobalLoading(false);
      navigate(ROUTES.PRACTICE);
    }, 500);
  };

  const caseCategoryOptions = currentCaseCategories.map((cat) => ({ value: cat.id, label: cat.name }));
  const caseOptions = availableCases.map((c) => ({ value: c.id, label: c.title }));
  const judgeOptions = currentJudges.map((j) => ({ value: j.id, label: j.name }));
  const opposingCounselOptions = currentOCs.map((oc) => ({ value: oc.id, label: `${oc.name} (${oc.specialty})` }));
  const sessionTypeOptions = Object.values(SessionType).map((st) => ({ value: st, label: st }));

  return (
    <div className="workspace-scroll">
      <div className="page-container setup-page">
        <PageHeader eyebrow={modeDisplay + ' practice / New hearing'} title="Prepare your hearing." description="Choose the case. Get to know the room." actions={<span className="setup-saved" role="status"><Check size={14} />{draftSavedHint ? 'Changes saved' : 'Your setup saves automatically'}</span>} />
        <form onSubmit={event => { event.preventDefault(); handleStartSession(); }}>
          <div className="setup-grid">
            <div className="setup-controls">
              <section className="setup-control-group" aria-labelledby="setup-case-heading">
                <div className="setup-group-heading"><span>01</span><h2 id="setup-case-heading">The case</h2></div>
                <SelectInput label="Practice area" options={caseCategoryOptions} value={selectedCategoryId}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedCategoryId(event.target.value as CaseCategoryId)}
                  placeholder="Choose a practice area" disabled={!currentCaseCategories.length} />
                <SelectInput label="Case file" options={caseOptions} value={selectedCaseId}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedCaseId(event.target.value)}
                  placeholder={availableCases.length ? 'Choose a case' : 'No cases in this area'} disabled={!availableCases.length} />
              </section>
              <section className="setup-control-group" aria-labelledby="setup-bench-heading">
                <div className="setup-group-heading"><span>02</span><h2 id="setup-bench-heading">The room</h2></div>
                <SelectInput label="Judge" options={judgeOptions} value={selectedJudgeId}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedJudgeId(event.target.value as JudgePersonalityId)}
                  placeholder="Choose the bench" disabled={!currentJudges.length} />
                <SelectInput label="Opposing counsel" options={opposingCounselOptions} value={selectedOpposingCounselId}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedOpposingCounselId(event.target.value as OpposingCounselPersonalityId)}
                  placeholder="Choose opposing counsel" disabled={!currentOCs.length} />
              </section>
              <section className="setup-control-group" aria-labelledby="setup-format-heading">
                <div className="setup-group-heading"><span>03</span><h2 id="setup-format-heading">The format</h2></div>
                <SelectInput label="Hearing length" options={sessionTypeOptions} value={selectedSessionType}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedSessionType(event.target.value as SessionType)} />
                <p className="text-xs text-brand-text-secondary">Difficulty follows the selected case: <strong className="font-medium">{selectedDifficulty}</strong>.</p>
              </section>
            </div>
            <div>
              {selectedCaseDetails ? (
                <article className="case-preview" aria-label="Selected case brief">
                  <div className="case-preview-meta"><span className="eyebrow"><FileText size={14} />The practice brief</span><span className="text-xs text-brand-text-secondary">{selectedCaseDetails.difficulty}</span></div>
                  <h2>{selectedCaseDetails.title}</h2>
                  <p className="case-preview-facts">{selectedCaseDetails.briefFacts}</p>
                  <section className="case-preview-section"><h3>Questions before the court</h3><ol>{selectedCaseDetails.legalIssues.map((issue, index) => <li key={issue}><span>{String(index + 1).padStart(2, '0')}</span>{issue}</li>)}</ol></section>
                  <section className="case-preview-section"><h3>{practiceMode === 'indian' ? 'Articles & sections to consider' : 'Relevant instruments'}</h3><p>{selectedCaseDetails.relevantArticlesSections}</p></section>
                </article>
              ) : <div className="case-preview"><FileText size={24} className="text-brand-text-secondary" /><h2>Your brief starts here.</h2><p className="text-sm text-brand-text-secondary">Choose a case file to see the facts and issues you will argue.</p></div>}
              <div className="bench-preview">
                <div><p className="eyebrow"><Scale size={14} />The bench</p><h3>{selectedJudgeDetails?.name || 'Choose a judge'}</h3><p>{selectedJudgeDetails?.description || 'The bench sets the questions and the tone.'}</p></div>
                <div><p className="eyebrow">Opposing counsel</p><h3>{selectedOpposingCounselDetails?.name || 'Choose your counterpart'}</h3><p>{selectedOpposingCounselDetails?.specialty || 'A different perspective to test your position.'}</p></div>
              </div>
              <p className="preparation-notice">Training simulation only. Profiles are fictionalized learning aids. Check scenario law against current primary sources before real-world use.</p>
            </div>
          </div>
          {validationError && <p className="validation-notice" role="alert">{validationError}</p>}
          <div className="setup-action-bar">
            <div><p>{selectedSessionType}</p><strong>{selectedCaseDetails ? 'Your brief is ready. Make your case.' : 'Choose a case to begin.'}</strong></div>
            <Button type="submit" size="lg" disabled={!selectedCaseDetails || !selectedJudgeDetails || !selectedOpposingCounselDetails}>Begin hearing <ArrowRight size={17} /></Button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default SetupScreen;
