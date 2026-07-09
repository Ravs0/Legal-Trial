import React, { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { TrialSimContext } from '../App';
import { PerformanceMetrics, SessionRecord } from '../types';
import { ROUTES } from '../constants';
import { CheckCircleIcon } from '../components/icons/CheckCircleIcon';
import { loadCompletedSessionById, loadLatestCompletedSession } from '../services/storageService';
import {
  buildScorecardMarkdown,
  buildTranscriptMarkdown,
  downloadMarkdown,
  scorecardFilename,
  transcriptFilename,
} from '../services/exportService';
import { trackEvent } from '../services/analyticsService';
import { PhotoHero } from '../components/PhotoHero';
import { PatternPanel, SurfacePattern } from '../components/SurfacePattern';
import counselScales from '../assets/counsel_scales.jpg';
import judgeGavel from '../assets/judge_gavel.jpg';

const PerformanceScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const context = useContext(TrialSimContext);

  if (!context) throw new Error('TrialSimContext not found');
  const { setIsLoading: setGlobalLoading, setError: setGlobalError, practiceMode } = context;

  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setGlobalLoading(true);

    const routerState = location.state as { sessionRecord?: SessionRecord } | null;
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('sessionId');
    const recordFromState = routerState?.sessionRecord;
    const recordFromStorage = loadCompletedSessionById(sessionId) || loadLatestCompletedSession();
    const resolvedRecord = recordFromState || recordFromStorage;

    if (resolvedRecord) {
      setSessionRecord(resolvedRecord);
      setPerformanceMetrics(resolvedRecord.performance || null);
      trackEvent('analysis_viewed', {
        mode: resolvedRecord.settings.practiceMode,
        caseId: resolvedRecord.settings.caseDetail.id,
        hasAnalysis: resolvedRecord.performance ? 'yes' : 'no',
      });

      if (resolvedRecord.analysisStatus?.state === 'unavailable') {
        setGlobalError('Performance analysis for this session was unavailable.');
      } else if (!resolvedRecord.performance) {
        setGlobalError('Performance metrics are missing for this session.');
      }
    } else if (!practiceMode) {
      setGlobalError('No session data found and no practice mode selected.');
      navigate(ROUTES.LANDING);
    } else {
      setGlobalError('No session data found to display performance. Please start a new session.');
      navigate(ROUTES.HOME);
    }

    setIsLoading(false);
    setGlobalLoading(false);
  }, [location.state, location.search, navigate, practiceMode, setGlobalError, setGlobalLoading]);

  const renderScoreBar = (label: string, score: number, outOf: number = 10) => (
    <div className="mb-5 group">
      <div className="flex justify-between mb-2">
        <span className="text-sm font-medium text-brand-text-secondary group-hover:text-brand-text-primary transition-colors">{label}</span>
        <span className="text-sm font-mono tracking-wider font-semibold text-brand-accent">{score} <span className="opacity-50 font-normal">/ {outOf}</span></span>
      </div>
      <div className="w-full bg-brand-bg-secondary h-2.5 overflow-hidden border border-brand-text-primary/30">
        <div
          className="bg-brand-accent h-full transition-all duration-1000 ease-out relative"
          style={{ width: `${(score / outOf) * 100}%` }}
        />
      </div>
    </div>
  );

  if (isLoading || !sessionRecord) {
    return <div className="flex justify-center items-center h-[50vh]"><LoadingSpinner text="Analyzing session performance..." spinnerColor="text-brand-accent" textColor="text-brand-text-secondary" /></div>;
  }

  if (!performanceMetrics) {
    return (
      <Card title="Analysis Unavailable" className="text-center max-w-lg mx-auto mt-20">
        <p className="text-brand-text-secondary mb-8 font-light leading-relaxed">
          {sessionRecord.analysisStatus?.state === 'unavailable'
            ? 'Performance analysis could not be generated for this session. The transcript and session details are still available below.'
            : 'Performance data for this session could not be generated or retrieved.'}
        </p>
        <Button onClick={() => navigate(ROUTES.HOME)} variant="outline" className="px-8">Return to Dashboard</Button>
      </Card>
    );
  }

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar animate-fadeIn relative z-10">
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6 pb-12">
      <PhotoHero
        image={counselScales}
        size="md"
        eyebrow="Post-session review"
        title="Performance analysis"
        subtitle={`${sessionRecord.settings.caseDetail.title} · score ${performanceMetrics.overallScore}/10`}
        actions={
          <>
            <Button variant="primary" onClick={() => navigate(ROUTES.SETUP)}>New trial</Button>
            <Button variant="secondary" className="!border-white/25 !text-white hover:!bg-white/10" onClick={() => navigate(ROUTES.HOME)}>
              Dashboard
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="lg:col-span-1 space-y-4 sm:space-y-5">
          <PatternPanel pattern="dots" className="p-0 overflow-hidden">
            <div className="relative h-16 border-b border-brand-border overflow-hidden">
              <img src={judgeGavel} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/70" />
              <div className="relative z-10 h-full flex items-center px-4">
                <h3 className="text-[15px] font-medium text-white">Session details</h3>
              </div>
            </div>
            <div className="p-4 sm:p-5 space-y-3.5 text-[13px]">
              {[
                { k: 'Mode', v: sessionRecord.settings.practiceMode.charAt(0).toUpperCase() + sessionRecord.settings.practiceMode.slice(1) },
                { k: 'Case', v: sessionRecord.settings.caseDetail.title },
                { k: 'Bench', v: sessionRecord.settings.judgePersonality.name },
                {
                  k: 'Counsel',
                  v: `${sessionRecord.settings.opposingCounselPersonality.name} · ${sessionRecord.settings.opposingCounselPersonality.specialty}`,
                },
                { k: 'Phase', v: sessionRecord.activePhase?.replace('_', ' ') || 'opening' },
                {
                  k: 'When',
                  v: `${new Date(sessionRecord.startTime).toLocaleDateString()}${
                    sessionRecord.endTime
                      ? ` · ${new Date(sessionRecord.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : ''
                  }`,
                },
              ].map((row) => (
                <div key={row.k}>
                  <span className="block text-[11px] uppercase tracking-wide text-brand-text-secondary mb-0.5">{row.k}</span>
                  <span className="text-brand-text-primary font-medium">{row.v}</span>
                </div>
              ))}
            </div>
          </PatternPanel>

          <PatternPanel pattern="grid" className="p-4 sm:p-5">
            <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary mb-4">Score breakdown</p>
            <div className="space-y-1">
              {renderScoreBar('Argument Strength', performanceMetrics.argumentStrength)}
              {renderScoreBar('Precedent Usage', performanceMetrics.precedentUsage)}
              {renderScoreBar('Legal Grounding', performanceMetrics.legalGrounding)}
              {renderScoreBar('Response Quality', performanceMetrics.responseQuality)}
              {renderScoreBar('Objection Handling', performanceMetrics.objectionHandling)}
              {renderScoreBar('Courtroom Presence', performanceMetrics.courtroomPresence)}
            </div>
            <div className="mt-6 pt-5 border-t border-brand-border relative">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[13px] text-brand-text-secondary">Overall</span>
                <span className="text-2xl font-mono font-semibold text-brand-text-primary tabular-nums">
                  {performanceMetrics.overallScore}
                  <span className="text-sm opacity-50 font-normal"> / 10</span>
                </span>
              </div>
              <div className="w-full bg-brand-bg-primary h-2.5 overflow-hidden border border-brand-border">
                <div
                  className="bg-brand-accent h-full transition-all duration-1000 ease-out"
                  style={{ width: `${(performanceMetrics.overallScore / 10) * 100}%` }}
                />
              </div>
            </div>
          </PatternPanel>
        </div>

        <div className="lg:col-span-2 space-y-4 sm:space-y-5">
          <PatternPanel pattern="lines" className="p-4 sm:p-6 h-full">
            <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary mb-3">Detailed feedback</p>
            <div className="text-brand-text-primary text-[14px] leading-relaxed">
              <p>{performanceMetrics.feedback || 'No specific feedback available from the bench.'}</p>
            </div>

            <div className="mt-8 pt-6 border-t border-brand-border">
              <p className="text-[11px] uppercase tracking-wide text-brand-text-secondary mb-4">Areas to improve</p>
              {performanceMetrics.improvementAreas &&
              performanceMetrics.improvementAreas.length > 0 &&
              !performanceMetrics.improvementAreas[0].toLowerCase().includes('error') ? (
                <ul className="space-y-2.5">
                  {performanceMetrics.improvementAreas.map((area, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg border border-brand-border bg-brand-bg-primary"
                    >
                      <CheckCircleIcon className="h-4 w-4 text-white/50 mt-0.5 flex-shrink-0" />
                      <span className="text-brand-text-primary/90 text-[13px] leading-relaxed">{area}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-brand-text-secondary text-[13px] px-3 py-2.5 rounded-lg border border-brand-border bg-brand-bg-primary">
                  {performanceMetrics.improvementAreas?.[0] || 'No specific improvement areas identified.'}
                </p>
              )}
            </div>
          </PatternPanel>
        </div>
      </div>

      <PatternPanel pattern="dots" className="p-0 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-brand-border flex justify-between items-center">
          <h3 className="text-[15px] font-medium text-brand-text-primary">Transcript</h3>
          <span className="text-[11px] uppercase tracking-wide text-brand-text-secondary border border-brand-border px-2 py-0.5 rounded">
            Record
          </span>
        </div>
        <div className="max-h-[560px] overflow-y-auto p-4 sm:p-5 space-y-5 custom-scrollbar">
          {sessionRecord.transcript.map((msg) => {
            let senderName = 'You (Counsel)';
            const isUser = msg.sender === 'user';

            if (msg.sender === 'judge') {
              senderName = sessionRecord.settings.judgePersonality.name;
            } else if (msg.sender === 'opposingCounsel') {
              const oc = sessionRecord.settings.opposingCounselPersonality;
              senderName = `${oc.name} (${oc.specialty})`;
            }

            return (
              <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full`}>
                <span className="text-[10px] uppercase tracking-wide text-brand-text-secondary mb-1 opacity-80">
                  {senderName}
                </span>
                <div
                  className={`p-3.5 rounded-lg max-w-[85%] sm:max-w-[75%] leading-relaxed text-[13px] sm:text-[14px] border ${
                    isUser
                      ? 'bg-brand-bg-primary border-white/20 text-brand-text-primary'
                      : 'bg-brand-bg-primary border-brand-border text-brand-text-primary'
                  }`}
                >
                  <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                </div>
              </div>
            );
          })}
        </div>
      </PatternPanel>

      <div className="relative pt-6 border-t border-brand-border flex flex-col sm:flex-row flex-wrap justify-center items-center gap-3">
        <SurfacePattern variant="lines" className="opacity-50 !absolute inset-x-0 -top-0 h-20" />
        <Button onClick={() => navigate(ROUTES.SETUP)} variant="primary" className="relative z-10 w-full sm:w-auto">
          New trial
        </Button>
        <Button onClick={() => navigate(ROUTES.HOME)} variant="outline" className="relative z-10 w-full sm:w-auto">
          Dashboard
        </Button>
        <Button
          variant="ghost"
          className="relative z-10 w-full sm:w-auto border border-white/10"
          onClick={async () => {
            if (sessionRecord) {
              try {
                await navigator.clipboard.writeText(buildScorecardMarkdown(sessionRecord));
                trackEvent('scorecard_copied', {
                  mode: sessionRecord.settings.practiceMode,
                  caseId: sessionRecord.settings.caseDetail.id,
                });
              } catch {
                const textarea = document.createElement('textarea');
                textarea.value = buildScorecardMarkdown(sessionRecord);
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                  document.execCommand('copy');
                } catch {
                  /* ignore */
                }
                document.body.removeChild(textarea);
                trackEvent('scorecard_copied', {
                  mode: sessionRecord.settings.practiceMode,
                  caseId: sessionRecord.settings.caseDetail.id,
                });
              }
            }
          }}
        >
          Copy scorecard
        </Button>
        <Button
          variant="ghost"
          className="relative z-10 w-full sm:w-auto border border-white/10"
          onClick={() => {
            if (sessionRecord) {
              downloadMarkdown(scorecardFilename(sessionRecord), buildScorecardMarkdown(sessionRecord));
              trackEvent('scorecard_downloaded', {
                mode: sessionRecord.settings.practiceMode,
                caseId: sessionRecord.settings.caseDetail.id,
              });
            }
          }}
        >
          Download scorecard
        </Button>
        {sessionRecord && sessionRecord.transcript.length > 0 && (
          <Button
            variant="ghost"
            className="relative z-10 w-full sm:w-auto border border-white/10"
            onClick={() => {
              downloadMarkdown(transcriptFilename(sessionRecord), buildTranscriptMarkdown(sessionRecord));
              trackEvent('transcript_downloaded', {
                mode: sessionRecord.settings.practiceMode,
                caseId: sessionRecord.settings.caseDetail.id,
              });
            }}
          >
            Download transcript
          </Button>
        )}
      </div>
    </div>
    </div>
  );
};

export default PerformanceScreen;
