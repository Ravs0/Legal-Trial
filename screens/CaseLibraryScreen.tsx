import React, { useState, useContext, ChangeEvent, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { TrialSimContext } from '../App';
import {
  CASES, CASE_CATEGORIES,
  JUDGE_PERSONALITIES, OPPOSING_COUNSEL_PERSONALITIES,
  INTERNATIONAL_CASES, INTERNATIONAL_CASE_CATEGORIES,
  INTERNATIONAL_JUDGE_PERSONALITIES, INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES,
} from '../constants';
import { ROUTES } from '../routes';
import { CaseCategory, CaseCategoryId, CaseDetail, CaseDifficulty, JudgePersonality, OpposingCounselPersonality, SessionSettings, SessionType } from '../types';
import { SelectInput } from '../components/SelectInput';
import { Modal } from '../components/Modal';
import { usePrecedentSearch } from '../hooks/usePrecedentSearch';
import { getCategoryColorClasses } from '../services/colorUtils';
import { PhotoHero } from '../components/PhotoHero';
import { PatternPanel } from '../components/SurfacePattern';
import { screenMedia } from '../assets';

/** Specialty keyword map for auto-picking opposing counsel from a case category. */
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

const recommendedCounsel = (categoryId: CaseCategoryId | string, counsel: OpposingCounselPersonality[]) => {
  if (!counsel.length) return null;
  const terms = COUNSEL_MATCH_TERMS[categoryId as CaseCategoryId] || [];
  return counsel.find((candidate) => terms.some((term) => candidate.specialty.toLowerCase().includes(term))) || counsel[0];
};

const safeLegalIssues = (caseDetail: CaseDetail): string[] =>
  Array.isArray(caseDetail.legalIssues) ? caseDetail.legalIssues : [];


const DifficultyBadge: React.FC<{ difficulty: CaseDifficulty; categoryId?: string }> = ({ difficulty, categoryId }) => {
  const colors = categoryId ? getCategoryColorClasses(categoryId) : null;
  let bgColor = 'bg-brand-bg-secondary';
  let borderColor = colors ? colors.border : 'border-brand-text-primary/30';
  let textColor = colors ? colors.text : 'text-brand-text-secondary';

  if (difficulty === CaseDifficulty.ADVANCED) {
    bgColor = 'bg-brand-bg-primary';
    borderColor = colors ? colors.border : 'border-brand-accent';
    textColor = colors ? colors.text : 'text-brand-accent';
  }

  return (
    <span
      className={`px-3 py-1.5 text-[10px] font-mono tracking-widest uppercase border ${borderColor} ${textColor} ${bgColor} rounded-xl transition-colors duration-300`}
    >
      {difficulty}
    </span>
  );
};

const CitationGraph: React.FC<{ caseTitle: string }> = ({ caseTitle }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set dimensions
    canvas.width = 300;
    canvas.height = 140;

    // Training scaffold only: never imply that a generic case card carries
    // real citation relationships before a source-backed search is run.
    const nodes = [
      { id: 'target', label: caseTitle.split(' v. ')[0] || 'Selected Case', x: 150, y: 70, size: 7, color: '#FF5A1F' },
      { id: 'ref1', label: 'Material facts', x: 60, y: 35, size: 4.5, color: '#3f51b5' },
      { id: 'ref2', label: 'Legal issues', x: 70, y: 105, size: 4.5, color: '#3f51b5' },
      { id: 'ref3', label: 'Rule to verify', x: 240, y: 40, size: 4.5, color: '#3f51b5' },
      { id: 'ref4', label: 'Relief sought', x: 230, y: 100, size: 4.5, color: '#3f51b5' },
    ];

    const links = [
      { source: 'ref1', target: 'target' },
      { source: 'ref2', target: 'target' },
      { source: 'target', target: 'ref3' },
      { source: 'target', target: 'ref4' },
    ];

    let t = 0;
    let animId: number;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.05;

      // Draw background grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < canvas.width; i += 20) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let j = 0; j < canvas.height; j += 20) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(canvas.width, j);
        ctx.stroke();
      }

      // Draw links
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      for (const link of links) {
        const sourceNode = nodes.find(n => n.id === link.source);
        const targetNode = nodes.find(n => n.id === link.target);
        if (sourceNode && targetNode) {
          ctx.beginPath();
          ctx.moveTo(sourceNode.x, sourceNode.y);
          ctx.lineTo(targetNode.x, targetNode.y);
          ctx.stroke();

          // Draw an animated pulse particle moving along the link
          const distFraction = (t % 2) / 2;
          const px = sourceNode.x + (targetNode.x - sourceNode.x) * distFraction;
          const py = sourceNode.y + (targetNode.y - sourceNode.y) * distFraction;
          ctx.fillStyle = '#FF5A1F';
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw nodes
      for (const node of nodes) {
        // Floating effect
        const oy = Math.sin(t + node.x) * 2;
        
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y + oy, node.size, 0, Math.PI * 2);
        ctx.fill();

        // Node ring
        ctx.strokeStyle = node.color;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y + oy, node.size + 4 + Math.sin(t * 2) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Label
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '6px ui-monospace, monospace';
        ctx.fillText(node.label, node.x - 20, node.y + oy + node.size + 8);
      }

      if (!reduceMotion) animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [caseTitle]);

  return (
    <div className="relative border border-brand-text-primary/20 bg-brand-bg-secondary p-3">
      <div className="text-[7px] text-brand-text-secondary font-mono tracking-widest uppercase mb-1">Training argument map · not case law</div>
      <canvas ref={canvasRef} className="w-full h-[140px]" />
    </div>
  );
};

// Court Sources lives here as a tab (IA consolidation): one research surface.
const CourtSourcesPanel = React.lazy(() => import('./CourtSourcesScreen'));

const CaseLibraryScreen: React.FC<{ initialTab?: 'cases' | 'sources' }> = ({ initialTab = 'cases' }) => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);

  if (!context) throw new Error("TrialSimContext not found");
  const { setCurrentSessionSettings, setIsLoading: setGlobalLoading, practiceMode } = context;

  const [activeTab, setActiveTab] = useState<'cases' | 'sources'>(initialTab);
  const [selectedCaseForPractice, setSelectedCaseForPractice] = useState<CaseDetail | null>(null);
  const [isCustomSimExpanded, setIsCustomSimExpanded] = useState(false);

  // Custom case state variables
  const [customTitle, setCustomTitle] = useState('');
  const [customBriefFacts, setCustomBriefFacts] = useState('');
  const [customRelevantLaws, setCustomRelevantLaws] = useState('');
  const [customLegalIssues, setCustomLegalIssues] = useState('');
  const [customDifficulty, setCustomDifficulty] = useState<CaseDifficulty>(CaseDifficulty.INTERMEDIATE);
  const [customCategoryId, setCustomCategoryId] = useState<string>('');
  const [customAiConsent, setCustomAiConsent] = useState(false);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const [fileUploadSuccess, setFileUploadSuccess] = useState<string | null>(null);

  const [currentJudges, setCurrentJudges] = useState<JudgePersonality[]>(practiceMode === 'international' ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES);
  const [currentOCs, setCurrentOCs] = useState<OpposingCounselPersonality[]>(practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES);

  const [selectedJudge, setSelectedJudge] = useState<JudgePersonality | null>(currentJudges[0] ?? null);
  const [selectedOpposingCounsel, setSelectedOpposingCounsel] = useState<OpposingCounselPersonality | null>(currentOCs[0] ?? null);

  // Search / ranking controls must be declared before any conditional return (Rules of Hooks).
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPipeline, setSearchPipeline] = useState<'bm25' | 'legal-bert' | 'haystack-hybrid'>('legal-bert');
  const [weightSemantic, setWeightSemantic] = useState(0.5);
  const [weightAuthority, setWeightAuthority] = useState(0.3);
  const [weightRecency, setWeightRecency] = useState(0.2);
  const [isTuningExpanded, setIsTuningExpanded] = useState(false);

  const activeCases = practiceMode === 'international' ? INTERNATIONAL_CASES : CASES;
  const activeCaseCategories = practiceMode === 'international' ? INTERNATIONAL_CASE_CATEGORIES : CASE_CATEGORIES;
  const modeDisplay = practiceMode
    ? practiceMode.charAt(0).toUpperCase() + practiceMode.slice(1)
    : '';

  const searchResults = usePrecedentSearch(
    searchQuery,
    activeCases,
    searchPipeline,
    { semantic: weightSemantic, authority: weightAuthority, recency: weightRecency }
  );

  useEffect(() => {
    const judges = practiceMode === 'international' ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES;
    const ocs = practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES;
    setCurrentJudges(judges);
    setCurrentOCs(ocs);
    setSelectedJudge(judges[0] ?? null);
    setSelectedOpposingCounsel(ocs[0] ?? null);

    const categories = practiceMode === 'international' ? INTERNATIONAL_CASE_CATEGORIES : CASE_CATEGORIES;
    if (categories.length > 0) {
      setCustomCategoryId(categories[0].id);
    }
    setFileUploadError(null);
    setFileUploadSuccess(null);
    setCustomAiConsent(false);
  }, [practiceMode]);

  const handlePracticeCase = (caseDetail: CaseDetail) => {
    setSelectedCaseForPractice(caseDetail);
    const currentJudgesList = practiceMode === 'international' ? INTERNATIONAL_JUDGE_PERSONALITIES : JUDGE_PERSONALITIES;
    const currentOCList = practiceMode === 'international' ? INTERNATIONAL_OPPOSING_COUNSEL_PERSONALITIES : OPPOSING_COUNSEL_PERSONALITIES;
    setSelectedJudge(currentJudgesList[0] ?? null);
    setSelectedOpposingCounsel(recommendedCounsel(caseDetail.categoryId, currentOCList));
  };

  const confirmPractice = () => {
    if (!selectedCaseForPractice || !selectedJudge || !selectedOpposingCounsel) {
      alert('Please ensure a case, judge, and opposing counsel are selected.');
      return;
    }
    setGlobalLoading(true);
    const sessionSettings: SessionSettings = {
      caseDetail: selectedCaseForPractice,
      judgePersonality: selectedJudge,
      opposingCounselPersonality: selectedOpposingCounsel,
      sessionType: selectedCaseForPractice.difficulty === CaseDifficulty.ADVANCED
        ? SessionType.DEEP
        : (selectedCaseForPractice.difficulty === CaseDifficulty.INTERMEDIATE ? SessionType.STANDARD : SessionType.QUICK),
      difficulty: selectedCaseForPractice.difficulty,
      practiceMode: practiceMode!,
    };
    setCurrentSessionSettings(sessionSettings);

    setTimeout(() => {
      setGlobalLoading(false);
      setSelectedCaseForPractice(null);
      navigate(ROUTES.PRACTICE);
    }, 500);
  };

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
    if (!customBriefFacts.trim() || !customAiConsent) {
      setFileUploadError(!customBriefFacts.trim()
        ? 'Provide the brief facts before configuring a custom simulation.'
        : 'Confirm that this material is appropriate to send to the configured AI service.');
      return;
    }

    const categories = practiceMode === 'international' ? INTERNATIONAL_CASE_CATEGORIES : CASE_CATEGORIES;
    const finalCategoryId = customCategoryId || categories[0]?.id || '';

    const customCaseDetail: CaseDetail = {
      id: `custom-case-${Date.now()}`,
      title: customTitle.trim() || 'Bespoke Simulated Case',
      categoryId: (finalCategoryId || CaseCategoryId.CONSTITUTIONAL) as CaseCategoryId,
      briefFacts: customBriefFacts.trim(),
      legalIssues: customLegalIssues.split(',').map(x => x.trim()).filter(Boolean),
      relevantArticlesSections: customRelevantLaws.trim() || 'Applicable legal principles.',
      precedentCases: 'Custom user-supplied context.',
      difficulty: customDifficulty,
    };

    handlePracticeCase(customCaseDetail);
  };

  if (!practiceMode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }

  const judgeOptions = currentJudges.map(j => ({ value: j.id, label: j.name }));
  const opposingCounselOptions = currentOCs.map(oc => ({ value: oc.id, label: `${oc.name} (${oc.specialty})` }));

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar animate-fadeIn overflow-x-hidden relative">
    <div className="p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-5 pb-12">
      <PhotoHero
        image={screenMedia.caseLibrary.hero}
        size="md"
        eyebrow={`${modeDisplay} · practice`}
        title="Case library"
        subtitle="Pick a case. Or bring your own facts."
      />

      {/* Research surfaces consolidated: case files + official court sources. */}
      <div className="flex border-b border-brand-border font-mono text-xs">
        {([
          ['cases', 'Case files'],
          ['sources', 'Court sources'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-2.5 text-center uppercase tracking-widest transition-colors ${
              activeTab === id
                ? 'bg-brand-bg-secondary text-brand-accent border-b-2 border-b-brand-accent'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'sources' ? (
        <React.Suspense fallback={<div className="py-16 text-center font-mono text-xs text-brand-text-secondary">Loading court sources…</div>}>
          <CourtSourcesPanel />
        </React.Suspense>
      ) : (
      <>

      {/* Photo strip: docket / binders / theory */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { img: screenMedia.caseLibrary.stripCase, label: 'Docket' },
          { img: screenMedia.caseLibrary.stripBinders, label: 'Binders' },
          { img: screenMedia.caseLibrary.stripTheory, label: 'Theory' },
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
            <span className="relative z-10 flex h-full items-center justify-center text-[11px] sm:text-[12px] uppercase tracking-wide text-white/85">
              {t.label}
            </span>
          </div>
        ))}
      </div>

      <PatternPanel pattern="dots" className="p-4 sm:p-5">
        <div className="relative">
          <input
            type="text"
            placeholder="Search docket (copyright, contract, negligence…)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-3 sm:p-3.5 bg-brand-bg-primary border border-brand-border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1c1914]/20 text-[14px] text-brand-text-primary placeholder-brand-text-secondary/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-brand-text-secondary hover:text-brand-text-primary"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-2 text-right">
          <button
            onClick={() => setIsTuningExpanded(!isTuningExpanded)}
            type="button"
            className="text-[11px] text-brand-text-secondary hover:text-brand-text-primary uppercase tracking-wide"
          >
            {isTuningExpanded ? 'Hide search settings' : 'Search settings'}
          </button>
        </div>

        {isTuningExpanded && (
          <div className="mt-3 p-3.5 border border-brand-border bg-brand-bg-primary text-left text-[12px] space-y-4 rounded-lg">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-brand-text-secondary mb-2">Pipeline</label>
              <div className="flex border border-brand-border rounded-md overflow-hidden">
                {(['bm25', 'legal-bert', 'haystack-hybrid'] as const).map((pipe) => (
                  <button
                    key={pipe}
                    type="button"
                    onClick={() => setSearchPipeline(pipe)}
                    className={`flex-1 py-1.5 text-center text-[11px] transition-colors ${
                      searchPipeline === pipe ? 'bg-brand-text-primary text-brand-bg-primary' : 'text-brand-text-secondary hover:text-brand-text-primary'
                    }`}
                  >
                    {pipe === 'bm25' ? 'Keyword' : pipe === 'legal-bert' ? 'Weighted' : 'Hybrid'}
                  </button>
                ))}
              </div>
            </div>

            {searchPipeline === 'haystack-hybrid' && (
              <div className="space-y-3 pt-2 border-t border-brand-text-primary/20">
                <span className="block text-[10px] uppercase text-brand-text-secondary tracking-wider font-bold">Ranking Relevance Weights</span>
                
                {/* Semantic weight */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-brand-text-secondary">
                    <span>Semantic Weight</span>
                    <span className="text-brand-accent">{(weightSemantic * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={weightSemantic}
                    onChange={(e) => setWeightSemantic(parseFloat(e.target.value))}
                    className="w-full h-1 bg-brand-bg-tertiary rounded-lg appearance-none cursor-pointer accent-brand-accent"
                  />
                </div>

                {/* Authority weight */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-brand-text-secondary">
                    <span>Precedent Authority / Court Tier</span>
                    <span className="text-brand-accent">{(weightAuthority * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={weightAuthority}
                    onChange={(e) => setWeightAuthority(parseFloat(e.target.value))}
                    className="w-full h-1 bg-brand-bg-tertiary rounded-lg appearance-none cursor-pointer accent-brand-accent"
                  />
                </div>

                {/* Recency weight */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-brand-text-secondary">
                    <span>Decision Recency (Temporal)</span>
                    <span className="text-brand-accent">{(weightRecency * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={weightRecency}
                    onChange={(e) => setWeightRecency(parseFloat(e.target.value))}
                    className="w-full h-1 bg-brand-bg-tertiary rounded-lg appearance-none cursor-pointer accent-brand-accent"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </PatternPanel>

      {/* Custom Case Simulator Section */}
      <div>
        <button 
          onClick={() => setIsCustomSimExpanded(!isCustomSimExpanded)}
          className="w-full text-left p-4 border border-brand-border bg-brand-bg-secondary hover:bg-brand-bg-tertiary rounded-xl flex items-center justify-between transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-bg-primary border border-brand-border rounded-lg flex items-center justify-center text-brand-text-secondary group-hover:text-brand-text-primary transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
            </div>
            <div>
              <h3 className="text-[14px] font-medium text-brand-text-primary">
                Custom trial
              </h3>
              <p className="text-[12px] text-brand-text-secondary mt-0.5">
                Upload briefs or paste your own dispute facts
              </p>
            </div>
          </div>
          <span className="text-[12px] text-brand-text-secondary">
            {isCustomSimExpanded ? 'Collapse' : 'Expand'}
          </span>
        </button>

        {isCustomSimExpanded && (
          <div className="mt-4 animate-fadeIn">
            <Card className="p-6 sm:p-8 bg-brand-bg-primary border border-brand-text-primary/30 rounded-xl relative overflow-hidden">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-brand-text-primary/30 pb-4 mb-6 gap-4">
                <div className="space-y-1 text-left">
                  <h3 className="text-base sm:text-xl lg:text-2xl font-serif font-bold text-brand-text-primary flex items-center">
                    <svg className="w-5 h-5 lg:w-6 lg:h-6 mr-2 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    Bespoke Custom Case Simulator
                  </h3>
                  <p className="text-xs text-brand-text-secondary font-light">
                    Upload legal briefs, copy-paste custom facts, and configure your own mock trial simulation instantly.
                  </p>
                </div>
                
                <div className="flex-shrink-0">
                  <label className="inline-flex items-center px-4 py-2 border border-brand-text-primary/30 rounded-xl bg-brand-bg-secondary text-xs font-mono text-brand-text-primary hover:bg-brand-bg-primary cursor-pointer transition-all">
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
                <div className="p-3 mb-5 bg-brand-error/15 border border-brand-error/30 text-brand-error rounded-xl text-xs text-left animate-fadeIn">
                  [ Error ] {fileUploadError}
                </div>
              )}

              {fileUploadSuccess && (
                <div className="p-3 mb-5 bg-brand-success/10 border border-brand-success/40 text-brand-success rounded-xl text-xs text-left animate-fadeIn">
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
                      className="w-full p-3.5 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-accent text-sm text-brand-text-primary placeholder-brand-text-secondary/40 font-light"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-mono text-brand-text-primary uppercase tracking-wider">Docket Category</label>
                      <select
                        value={customCategoryId}
                        onChange={(e) => setCustomCategoryId(e.target.value)}
                        className="w-full p-3.5 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-accent text-xs text-brand-text-primary font-mono"
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
                        className="w-full p-3.5 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-accent text-xs text-brand-text-primary font-mono"
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
                      className="w-full p-3.5 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-accent text-sm text-brand-text-primary placeholder-brand-text-secondary/40 font-light"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono text-brand-text-primary uppercase tracking-wider">Key Legal Issues (comma-separated)</label>
                    <input
                      type="text"
                      value={customLegalIssues}
                      onChange={(e) => setCustomLegalIssues(e.target.value)}
                      placeholder="e.g. Burden of proof, validity of notice, signature dispute"
                      className="w-full p-3.5 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-accent text-sm text-brand-text-primary placeholder-brand-text-secondary/40 font-light"
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
                      className="w-full flex-grow p-4 bg-brand-bg-secondary border border-brand-text-primary/30 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-accent text-sm text-brand-text-primary placeholder-brand-text-secondary/40 font-light resize-none min-h-[160px] custom-scrollbar"
                      required
                    />
                  </div>

                  <label className="flex items-start gap-2.5 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-[11px] leading-5 text-[#7a5c12]/80">
                    <input
                      type="checkbox"
                      checked={customAiConsent}
                      onChange={(event) => setCustomAiConsent(event.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-brand-accent"
                    />
                    <span>I confirm these facts contain no privileged, confidential, or client-identifying material that I am not authorized to send to the configured AI service.</span>
                  </label>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={!customBriefFacts.trim() || !customAiConsent}
                      className="w-full py-4 text-xs tracking-widest font-mono uppercase bg-brand-accent hover:bg-brand-accent-hover text-brand-navy font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Configure Custom Simulation
                    </button>
                  </div>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>

      <div className="space-y-16 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {searchQuery.trim() ? (
          <section className="scroll-mt-24 relative">
            <div className="mb-8 flex items-end justify-between border-b border-brand-text-primary/30 pb-4">
              <div className="flex items-center">
                <div className="w-1.5 h-8 bg-brand-accent mr-4"></div>
                <div>
                  <h2 className="text-3xl font-semibold text-brand-text-primary font-serif tracking-tight">Search Results</h2>
                  <p className="text-sm font-light text-brand-text-secondary mt-1">Ranked by keyword matching and document relevance</p>
                </div>
              </div>
              <div>
                <span className="text-xs font-mono text-brand-text-secondary/50 uppercase tracking-widest">{searchResults.length} Match(es)</span>
              </div>
            </div>

            {searchResults.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                {searchResults.map(({ caseItem, score, matchedTerms }) => {
                  const catColors = getCategoryColorClasses(caseItem.categoryId);
                  return (
                    <Card
                      key={caseItem.id}
                      className={`flex flex-col h-full overflow-hidden group border border-brand-text-primary/30 ${catColors.accentGlow} hover:bg-brand-bg-secondary transition-all duration-300 bg-brand-bg-primary p-0 rounded-xl cursor-pointer`}
                      onClick={() => handlePracticeCase(caseItem)}
                    >
                      <div className="p-6 pb-0 flex-grow">
                        <div className="flex justify-between items-start mb-5">
                          <DifficultyBadge difficulty={caseItem.difficulty} categoryId={caseItem.categoryId} />
                          <div className="flex items-center space-x-2">
                            <span className={`text-[10px] font-mono ${catColors.text} bg-brand-bg-secondary px-2 py-1 border ${catColors.border}/25`}>Score: {score}</span>
                            <div className="w-8 h-8 rounded-xl bg-brand-bg-secondary border border-brand-text-primary/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <svg className={`w-4 h-4 ${catColors.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                            </div>
                          </div>
                        </div>

                        <h4 className="text-xl font-serif font-semibold text-brand-text-primary mb-3 line-clamp-2 leading-tight group-hover:text-brand-text-primary transition-colors duration-300" title={caseItem.title}>{caseItem.title}</h4>

                        <p className="text-sm font-light text-brand-text-secondary/80 mb-6 line-clamp-3 leading-relaxed">{caseItem.briefFacts}</p>

                        {matchedTerms.length > 0 && (
                          <div className="mb-4 flex flex-wrap gap-1.5">
                            {matchedTerms.map((term, i) => (
                              <span key={i} className={`text-[9px] font-mono ${catColors.bgMuted} ${catColors.text} border ${catColors.border}/20 px-1.5 py-0.5 uppercase`}>
                                {term}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mb-6">
                          <h5 className={`text-[10px] font-mono font-semibold ${catColors.text} uppercase tracking-widest mb-2 flex items-center`}>
                            <span className="w-3 h-px bg-brand-text-primary/30 mr-2"></span>Key Legal Issues
                          </h5>
                          <ul className="text-xs text-brand-text-primary/90 space-y-2 font-light">
                            {safeLegalIssues(caseItem).slice(0, 3).map((issue, idx) => (
                              <li key={idx} className="flex items-start">
                                <span className={`${catColors.text} mr-2 mt-0.5`}>•</span>
                                <span className="line-clamp-2 leading-snug">{issue}</span>
                              </li>
                            ))}
                            {safeLegalIssues(caseItem).length === 0 && (
                              <li className="text-brand-text-secondary/60 italic text-[11px]">No issues listed for this matter.</li>
                            )}
                          </ul>
                        </div>
                      </div>

                      <div className="p-6 pt-0 mt-auto">
                        <Button variant="outline" size="sm" fullWidth className="group-hover:bg-[#3a352c] group-hover:text-brand-bg-primary group-hover:border-brand-border transition-all duration-300 shadow-none border-brand-text-primary/30 text-brand-text-primary py-2.5">
                          Review Case File
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 border border-dashed border-brand-text-primary/30 rounded-xl bg-brand-bg-secondary flex items-center justify-center">
                <p className="text-brand-text-secondary font-light">No precedents match your search query.</p>
              </div>
            )}
          </section>
        ) : (
          activeCaseCategories.map((category: CaseCategory) => {
            const categoryCases = activeCases.filter(c => c.categoryId === category.id);
            const catColors = getCategoryColorClasses(category.id);

            return (
              <section key={category.id} aria-labelledby={`category-title-${category.id}`} className="scroll-mt-24 relative">
                <div className="mb-8 flex items-end justify-between border-b border-brand-text-primary/30 pb-4">
                  <div className="flex items-center">
                    <div className={`w-1.5 h-8 ${catColors.bg} mr-4`}></div>
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
                        className={`flex flex-col h-full overflow-hidden group border border-brand-text-primary/30 ${catColors.accentGlow} hover:bg-brand-bg-secondary transition-all duration-300 bg-brand-bg-primary p-0 rounded-xl cursor-pointer`}
                        onClick={() => handlePracticeCase(caseDetail)}
                      >
                        <div className="p-6 pb-0 flex-grow">
                          <div className="flex justify-between items-start mb-5">
                            <DifficultyBadge difficulty={caseDetail.difficulty} categoryId={caseDetail.categoryId} />
                            <div className="w-8 h-8 rounded-xl bg-brand-bg-secondary border border-brand-text-primary/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <svg className={`w-4 h-4 ${catColors.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                            </div>
                          </div>

                          <h4 className="text-xl font-serif font-semibold text-brand-text-primary mb-3 line-clamp-2 leading-tight group-hover:text-brand-text-primary transition-colors duration-300" title={caseDetail.title}>{caseDetail.title}</h4>

                          <p className="text-sm font-light text-brand-text-secondary/80 mb-6 line-clamp-3 leading-relaxed">{caseDetail.briefFacts}</p>

                          <div className="mb-6">
                            <h5 className={`text-[10px] font-mono font-semibold ${catColors.text} uppercase tracking-widest mb-2 flex items-center`}>
                              <span className="w-3 h-px bg-brand-text-primary/30 mr-2"></span>Key Legal Issues
                            </h5>
                            <ul className="text-xs text-brand-text-primary/90 space-y-2 font-light">
                              {safeLegalIssues(caseDetail).slice(0, 3).map((issue, idx) => (
                                <li key={idx} className="flex items-start">
                                  <span className={`${catColors.text} mr-2 mt-0.5`}>•</span>
                                  <span className="line-clamp-2 leading-snug">{issue}</span>
                                </li>
                              ))}
                              {safeLegalIssues(caseDetail).length > 3 && (
                                <li className="text-brand-text-secondary/60 italic text-[11px] pl-3">
                                  +{safeLegalIssues(caseDetail).length - 3} additional issues
                                </li>
                              )}
                              {safeLegalIssues(caseDetail).length === 0 && (
                                <li className="text-brand-text-secondary/60 italic text-[11px]">No issues listed for this matter.</li>
                              )}
                            </ul>
                          </div>
                        </div>

                        <div className="p-6 pt-0 mt-auto">
                          <Button variant="outline" size="sm" fullWidth className="group-hover:bg-[#3a352c] group-hover:text-brand-bg-primary group-hover:border-brand-border transition-all duration-300 shadow-none border-brand-text-primary/30 text-brand-text-primary py-2.5">
                            Review Case File
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 border border-dashed border-brand-text-primary/30 rounded-xl bg-brand-bg-secondary flex items-center justify-center">
                    <p className="text-brand-text-secondary font-light">No cases currently available in this docket for {modeDisplay} mode.</p>
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>


      {selectedCaseForPractice && selectedJudge && selectedOpposingCounsel && (
        <Modal
          isOpen={!!selectedCaseForPractice}
          onClose={() => setSelectedCaseForPractice(null)}
          title="Case Setup Configuration"
          size="xl"
        >
          <div className="space-y-8">
            <div className="bg-brand-bg-secondary p-5 rounded-xl border border-brand-text-primary/30">
              <div className="flex items-center space-x-3 mb-2">
                <DifficultyBadge difficulty={selectedCaseForPractice.difficulty} categoryId={selectedCaseForPractice.categoryId} />
                <span className="text-[10px] font-mono tracking-widest uppercase text-brand-text-secondary/60">{modeDisplay} Arena</span>
              </div>
              <h3 className="text-2xl font-serif font-semibold text-brand-text-primary leading-tight">{selectedCaseForPractice.title}</h3>
            </div>

            {/* Precedent Citation Graph */}
            <div className="space-y-2">
              <CitationGraph caseTitle={selectedCaseForPractice.title} />
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
                <div className="p-4 bg-brand-bg-primary border border-brand-text-primary/30 rounded-xl min-h-[140px] flex flex-col">
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
                <div className="p-4 bg-brand-bg-primary border border-brand-text-primary/30 rounded-xl min-h-[140px] flex flex-col">
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
      </>
      )}
    </div>
    </div>
  );
};

export default CaseLibraryScreen;
