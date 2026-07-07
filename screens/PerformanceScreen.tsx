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
    <div className="flex-grow p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full overflow-y-auto custom-scrollbar h-full space-y-8 animate-fadeIn pb-12 relative z-10">
      <div className="text-center mb-10 pt-4">
        <div className="inline-flex items-center justify-center space-x-2 mb-4 opacity-80">
          <div className="h-px w-8 bg-brand-text-primary/30"></div>
          <span className="text-xs font-mono text-brand-text-primary tracking-widest uppercase">Post-Session Review</span>
          <div className="h-px w-8 bg-brand-text-primary/30"></div>
        </div>
        <h2 className="text-4xl sm:text-5xl font-bold text-brand-text-primary font-serif tracking-tight mb-2">
          Performance Analysis
        </h2>
        <p className="text-brand-text-secondary font-light max-w-2xl mx-auto">
          A comprehensive breakdown of your argumentation, legal basis, and overall effectiveness in the arena.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <Card className="p-0 overflow-hidden group">
            <div className="bg-brand-bg-secondary p-6 border-b border-brand-text-primary/30 relative overflow-hidden">
              <h3 className="text-xl font-serif font-semibold text-brand-text-primary relative z-10">Session Details</h3>
            </div>
            <div className="p-6 bg-brand-bg-primary space-y-4 text-sm">
              <div>
                <span className="block text-[10px] font-mono uppercase tracking-widest text-brand-text-secondary/60 mb-1">Mode</span>
                <span className="font-semibold text-brand-text-primary">{sessionRecord.settings.practiceMode.charAt(0).toUpperCase() + sessionRecord.settings.practiceMode.slice(1)}</span>
              </div>
              <div className="h-px w-full bg-brand-text-primary/30"></div>
              <div>
                <span className="block text-[10px] font-mono uppercase tracking-widest text-brand-text-secondary/60 mb-1">Case</span>
                <span className="font-semibold text-brand-accent/90">{sessionRecord.settings.caseDetail.title}</span>
              </div>
              <div className="h-px w-full bg-brand-text-primary/30"></div>
              <div>
                <span className="block text-[10px] font-mono uppercase tracking-widest text-brand-text-secondary/60 mb-1">The Bench</span>
                <span className="text-brand-text-primary font-medium">{sessionRecord.settings.judgePersonality.name}</span>
              </div>
              <div className="h-px w-full bg-brand-text-primary/30"></div>
              <div>
                <span className="block text-[10px] font-mono uppercase tracking-widest text-brand-text-secondary/60 mb-1">Opposing Counsel</span>
                <span className="text-brand-text-primary font-medium">{sessionRecord.settings.opposingCounselPersonality.name}</span>
                <span className="block text-xs text-brand-text-secondary mt-0.5">{sessionRecord.settings.opposingCounselPersonality.specialty}</span>
              </div>
              <div className="h-px w-full bg-brand-text-primary/30"></div>
              <div>
                <span className="block text-[10px] font-mono uppercase tracking-widest text-brand-text-secondary/60 mb-1">Phase Reached</span>
                <span className="text-brand-text-primary font-medium">{sessionRecord.activePhase?.replace('_', ' ') || 'opening'}</span>
              </div>
              <div className="h-px w-full bg-brand-text-primary/30"></div>
              <div>
                <span className="block text-[10px] font-mono uppercase tracking-widest text-brand-text-secondary/60 mb-1">Timestamp</span>
                <span className="text-brand-text-secondary font-mono text-xs">{new Date(sessionRecord.startTime).toLocaleDateString()}
                  {sessionRecord.endTime ? ` • ${new Date(sessionRecord.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' (Inc)'}</span>
              </div>
            </div>
          </Card>

          <Card title="Score Breakdown">
            <div className="space-y-2">
              {renderScoreBar('Argument Strength', performanceMetrics.argumentStrength)}
              {renderScoreBar('Precedent Usage', performanceMetrics.precedentUsage)}
              {renderScoreBar('Legal Grounding', performanceMetrics.legalGrounding)}
              {renderScoreBar('Response Quality', performanceMetrics.responseQuality)}
              {renderScoreBar('Objection Handling', performanceMetrics.objectionHandling)}
              {renderScoreBar('Courtroom Presence', performanceMetrics.courtroomPresence)}
            </div>
            <div className="mt-8 pt-6 border-t border-brand-text-primary/30 relative">
              <div className="flex justify-between items-end mb-3">
                <span className="text-sm font-medium text-brand-text-primary font-serif italic text-lg opacity-90">Overall Verdict</span>
                <span className="text-3xl font-mono font-bold text-brand-text-primary">{performanceMetrics.overallScore} <span className="text-lg opacity-50 font-normal">/ 10</span></span>
              </div>
              <div className="w-full bg-brand-bg-secondary h-4 overflow-hidden border border-brand-text-primary/30">
                <div
                  className="bg-brand-accent h-full transition-all duration-1000 ease-out relative"
                  style={{ width: `${(performanceMetrics.overallScore / 10) * 100}%` }}
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <Card title="Detailed Feedback" className="h-full">
            <div className="prose prose-sm sm:prose-base prose-invert max-w-none text-brand-text-primary leading-relaxed font-light">
              <p className="first-letter:text-4xl first-letter:font-serif first-letter:text-brand-accent first-letter:mr-1 first-letter:float-left">{performanceMetrics.feedback || 'No specific feedback available from the bench.'}</p>
            </div>

            <div className="mt-10 pt-8 border-t border-brand-text-primary/30">
              <h4 className="text-sm font-mono uppercase tracking-widest text-brand-accent mb-6 flex items-center">
                <span className="w-6 h-px bg-brand-text-primary/30 mr-3"></span>
                Areas for Improvement
              </h4>

              {performanceMetrics.improvementAreas && performanceMetrics.improvementAreas.length > 0 && !performanceMetrics.improvementAreas[0].toLowerCase().includes('error') ? (
                <ul className="space-y-4">
                  {performanceMetrics.improvementAreas.map((area, index) => (
                    <li key={index} className="flex items-start p-4 bg-brand-bg-secondary rounded-xl border border-brand-text-primary/30 transition-colors group">
                      <div className="mt-0.5 mr-4 bg-brand-bg-primary rounded-xl p-1 group-hover:bg-brand-bg-secondary transition-colors">
                        <CheckCircleIcon className="h-5 w-5 text-brand-accent" />
                      </div>
                      <span className="text-brand-text-primary/90 font-light leading-relaxed">{area}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-brand-text-secondary font-light italic px-4 py-3 bg-brand-bg-secondary rounded-xl border border-brand-text-primary/30">{performanceMetrics.improvementAreas[0] || 'No specific improvement areas identified by the bench.'}</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-10 p-0 overflow-hidden">
        <div className="p-6 border-b border-brand-text-primary/30 bg-brand-bg-secondary flex justify-between items-center">
          <h3 className="text-xl font-serif font-semibold text-brand-text-primary">Official Transcript</h3>
          <span className="text-xs font-mono text-brand-text-secondary uppercase tracking-widest bg-brand-bg-primary/50 px-3 py-1 rounded-xl border border-brand-text-primary/30">Record</span>
        </div>
        <div className="max-h-[600px] overflow-y-auto p-6 bg-brand-bg-primary space-y-6 custom-scrollbar">
          {sessionRecord.transcript.map(msg => {
            let senderName = 'You (Counsel)';
            let isUser = msg.sender === 'user';

            if (msg.sender === 'judge') {
              senderName = sessionRecord.settings.judgePersonality.name;
            } else if (msg.sender === 'opposingCounsel') {
              const oc = sessionRecord.settings.opposingCounselPersonality;
              senderName = `${oc.name} (${oc.specialty})`;
            }

            return (
              <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full`}>
                <span className="text-[10px] font-mono tracking-widest uppercase text-brand-text-secondary mb-1.5 opacity-70">
                  {senderName}
                </span>
                <div className={`p-4 rounded-xl max-w-[85%] sm:max-w-[75%] font-light leading-relaxed text-sm sm:text-base border ${isUser
                    ? 'bg-brand-bg-secondary border-brand-accent text-brand-text-primary'
                    : 'bg-brand-bg-secondary border-brand-text-primary/30 text-brand-text-primary'
                  }`}>
                  <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-12 mb-8 flex flex-col sm:flex-row flex-wrap justify-center items-center gap-4 sm:gap-6 border-t border-brand-text-primary/30 pt-10">
        <Button onClick={() => navigate(ROUTES.SETUP)} variant="primary" size="lg" className="w-full sm:w-auto px-10">Return to Arena</Button>
        <Button onClick={() => navigate(ROUTES.HOME)} variant="outline" size="lg" className="w-full sm:w-auto px-10">Back to Quarters</Button>
        <Button
          variant="ghost"
          size="lg"
          className="w-full sm:w-auto px-6 border border-white/10"
          onClick={async () => {
            if (sessionRecord) {
              try {
                await navigator.clipboard.writeText(buildScorecardMarkdown(sessionRecord));
                trackEvent('scorecard_copied', { mode: sessionRecord.settings.practiceMode, caseId: sessionRecord.settings.caseDetail.id });
              } catch {
                // Fallback for non-secure contexts
                const textarea = document.createElement('textarea');
                textarea.value = buildScorecardMarkdown(sessionRecord);
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                try { document.execCommand('copy'); } catch { /* ignore */ }
                document.body.removeChild(textarea);
                trackEvent('scorecard_copied', { mode: sessionRecord.settings.practiceMode, caseId: sessionRecord.settings.caseDetail.id });
              }
            }
          }}
        >
          Copy Scorecard
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="w-full sm:w-auto px-6 border border-white/10"
          onClick={() => {
            if (sessionRecord) {
              downloadMarkdown(scorecardFilename(sessionRecord), buildScorecardMarkdown(sessionRecord));
              trackEvent('scorecard_downloaded', { mode: sessionRecord.settings.practiceMode, caseId: sessionRecord.settings.caseDetail.id });
            }
          }}
        >
          Download Scorecard
        </Button>
        {sessionRecord && sessionRecord.transcript.length > 0 && (
          <Button
            variant="ghost"
            size="lg"
            className="w-full sm:w-auto px-6 border border-white/10"
            onClick={() => {
              downloadMarkdown(transcriptFilename(sessionRecord), buildTranscriptMarkdown(sessionRecord));
              trackEvent('transcript_downloaded', { mode: sessionRecord.settings.practiceMode, caseId: sessionRecord.settings.caseDetail.id });
            }}
          >
            Download Transcript
          </Button>
        )}
      </div>
    </div>
  );
};

export default PerformanceScreen;
