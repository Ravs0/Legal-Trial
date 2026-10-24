import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BookOpen, Clock3, FilePenLine, Gavel, Search, Sparkles } from 'lucide-react';
import { TrialSimContext } from '../App';
import { ROUTES } from '../routes';
import { CASES, CASE_CATEGORIES, INTERNATIONAL_CASES, INTERNATIONAL_CASE_CATEGORIES } from '../constants';
import { loadActiveSession, loadCompletedSessions, savePendingSettings } from '../services/storageService';
import { createDemoSessionSettings } from '../services/demoSessionService';
import { trackDemoTrialStarted, trackEvent } from '../services/analyticsService';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import type { SessionRecord } from '../types';

const score = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : null;
const displayScore = (value: number | null) => value === null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1);
const sessionDate = (value: Date) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recent hearing' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);
  if (!context) throw new Error('LexForge context is unavailable.');
  const { practiceMode } = context;
  const [active, setActive] = useState<SessionRecord | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  useEffect(() => {
    trackEvent('dashboard_viewed', { mode: practiceMode || 'none' });
    const sync = () => {
      const current = loadActiveSession();
      setActive(current?.settings.practiceMode === practiceMode ? current : null);
      setSessions(loadCompletedSessions().filter(session => session.settings.practiceMode === practiceMode));
    };
    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('focus', sync); window.removeEventListener('storage', sync); };
  }, [practiceMode]);

  const analyzed = useMemo(() => sessions.filter(session => score(session.performance?.overallScore) !== null), [sessions]);
  const recentScores = analyzed.slice(0, 7).reverse().map(session => ({ id: session.id, title: session.settings.caseDetail.title, value: score(session.performance?.overallScore) as number }));
  const average = analyzed.length ? analyzed.reduce((sum, session) => sum + (score(session.performance?.overallScore) || 0), 0) / analyzed.length : null;
  const best = analyzed.length ? Math.max(...analyzed.map(session => score(session.performance?.overallScore) || 0)) : null;
  const cases = practiceMode === 'international' ? INTERNATIONAL_CASES : CASES;
  const categories = practiceMode === 'international' ? INTERNATIONAL_CASE_CATEGORIES : CASE_CATEGORIES;
  const suggested = [...cases].sort((a, b) => Number(b.difficulty === 'Beginner') - Number(a.difficulty === 'Beginner')).slice(0, 3);
  const focus = analyzed[0]?.performance?.improvementAreas?.find(value => typeof value === 'string' && value.trim());

  const startDemo = () => {
    if (active) { navigate(ROUTES.PRACTICE); return; }
    try {
      const settings = createDemoSessionSettings();
      trackDemoTrialStarted({ source: 'dashboard', mode: settings.practiceMode, caseId: settings.caseDetail.id, caseTitle: settings.caseDetail.title });
      context.setPracticeMode(settings.practiceMode);
      context.setCurrentSessionSettings(settings);
      savePendingSettings(settings);
      navigate(ROUTES.PRACTICE);
    } catch (error) { context.setError(error instanceof Error ? error.message : 'Unable to start the hearing.'); }
  };

  return (
    <div className="workspace-scroll">
      <div className="page-container dashboard-page">
        <PageHeader eyebrow={practiceMode === 'indian' ? 'Indian practice / Your overview' : 'International law / Your overview'} title={sessions.length ? 'Welcome back to the work.' : 'Every argument is a beginning.'} description="A little preparation. A stronger point of view." actions={<Button onClick={() => navigate(ROUTES.SETUP)}>New hearing <ArrowRight size={16} /></Button>} />
        <div className="dashboard-grid">
          <div className="dashboard-primary">
            <section className="next-hearing" aria-labelledby="next-hearing-title">
              <div className="next-hearing-copy"><p className="eyebrow">{active ? 'Pick up where you left off' : 'Your next step'}</p><h2 id="next-hearing-title">{active ? 'The floor is still yours.' : 'Find your voice in the courtroom.'}</h2><p>{active ? active.settings.caseDetail.title : 'Take a position, answer the bench, and learn from the exchange.'}</p><Button onClick={active ? () => navigate(ROUTES.PRACTICE) : () => navigate(ROUTES.SETUP)}>{active ? 'Resume hearing' : 'Prepare hearing'}<ArrowRight size={16} /></Button>{!active && practiceMode === 'indian' && <button className="text-link next-demo" onClick={startDemo}>Or try a 15-minute demo</button>}</div>
              <div className="hearing-illustration" aria-hidden="true"><Gavel size={75} strokeWidth={0.8} /><div /><span>PREPARATION<br />MEETS PRACTICE</span></div>
            </section>

            <section aria-labelledby="progress-heading">
              <div className="section-heading compact"><h2 id="progress-heading">The work adds up.</h2><span className="eyebrow">Your practice record</span></div>
              <div className="dashboard-stats"><div><span>Completed hearings</span><strong>{sessions.length.toString().padStart(2, '0')}</strong><small>{sessions.length ? 'Arguments put into practice' : 'Your first hearing is ahead'}</small></div><div><span>Average score</span><strong>{displayScore(average)}<i>/10</i></strong><small>{analyzed.length ? 'Across scored hearings' : 'Appears after your first review'}</small></div><div><span>Personal best</span><strong>{displayScore(best)}<i>/10</i></strong><small>{best === null ? 'A benchmark to build toward' : 'Something to build on'}</small></div></div>
            </section>

            <section className="recent-hearings" aria-labelledby="recent-heading">
              <div className="section-heading compact"><h2 id="recent-heading">Recent hearings</h2><button className="text-link" onClick={() => navigate(ROUTES.ANALYSIS)}>View performance <ArrowUpRight size={14} /></button></div>
              {sessions.length ? <div className="hearing-history">{sessions.slice(0, 4).map(session => <button key={session.id} onClick={() => navigate(ROUTES.ANALYSIS + '?sessionId=' + encodeURIComponent(session.id))}><span className="history-case-icon"><Gavel size={17} /></span><span className="history-title"><strong>{session.settings.caseDetail.title}</strong><small>{sessionDate(session.startTime)} · {session.settings.difficulty}</small></span><span className="history-score">{displayScore(score(session.performance?.overallScore))}<small>/10</small></span><ArrowUpRight size={16} /></button>)}</div> : <div className="empty-history"><div className="empty-history-mark"><BookOpen size={25} strokeWidth={1.2} /></div><h3>Your practice has a place here.</h3><p>Completed hearings, feedback, and transcripts will form your record.</p><button className="text-link" onClick={() => navigate(ROUTES.SETUP)}>Begin your first hearing <ArrowRight size={15} /></button></div>}
            </section>

            <section aria-labelledby="suggested-heading">
              <div className="section-heading compact"><h2 id="suggested-heading">A case worth considering.</h2><button className="text-link" onClick={() => navigate(ROUTES.LIBRARY)}>Case library <ArrowUpRight size={14} /></button></div>
              <div className="suggested-cases">{suggested.map((item, index) => <button key={item.id} onClick={() => navigate(ROUTES.SETUP + '?case=' + encodeURIComponent(item.id))} aria-label={'Prepare ' + item.title}><span className="case-number">0{index + 1}</span><span className="case-category">{categories.find(category => category.id === item.categoryId)?.name || 'Practice case'}</span><h3>{item.title}</h3><p>{item.briefFacts}</p><span className="case-card-foot"><span>{item.difficulty}</span><ArrowUpRight size={17} /></span></button>)}</div>
            </section>
          </div>

          <aside className="dashboard-secondary" aria-label="Your workbench">
            <section className="workbench-links"><div className="section-heading compact"><h2>The workbench</h2><span className="eyebrow">Open a desk</span></div>{[
              { to: ROUTES.DRAFTING_STUDIO, icon: FilePenLine, label: 'Drafting studio', description: 'Make every word count.' },
              { to: ROUTES.RESEARCH_IDE, icon: Search, label: 'Research desk', description: 'Find the thread. Follow it.' },
              { to: ROUTES.LIBRARY + '?tab=sources', icon: BookOpen, label: 'Court sources', description: 'Start with primary sources.' },
              { to: ROUTES.STRATEGY, icon: Sparkles, label: 'Strategy room', description: 'Think the argument through.' },
            ].map(({ to, icon: Icon, label, description }) => <button key={to} onClick={() => navigate(to)}><span className="workbench-link-icon"><Icon size={18} strokeWidth={1.5} /></span><span><strong>{label}</strong><small>{description}</small></span><ArrowUpRight size={15} /></button>)}</section>

            <section className="practice-focus"><span className="eyebrow"><Clock3 size={13} />Make the next one count</span><h3>{focus ? 'A point to work on.' : 'One clear point. Well made.'}</h3><p>{focus || 'Before you argue, write down the single proposition you want the bench to remember.'}</p><button className="text-link" onClick={() => window.dispatchEvent(new CustomEvent('lexforge-open-coach'))}>Think with your coach <ArrowRight size={14} /></button></section>

            <section className="progress-chart"><div className="section-heading compact"><h2>Your trajectory</h2><span className="eyebrow">/10</span></div>{recentScores.length ? <div className="score-chart" role="img" aria-label={recentScores.map((item, i) => 'Hearing ' + (i + 1) + ': ' + item.value + ' out of 10').join('; ')}>{recentScores.map((item, index) => <div key={item.id}><strong>{displayScore(item.value)}</strong><span style={{ height: Math.max(3, item.value * 9) }} /><small>{String(index + 1).padStart(2, '0')}</small></div>)}</div> : <div className="chart-empty"><div aria-hidden="true"><span /><span /><span /><span /><span /><span /></div><p>Each scored hearing adds a point to your progress.</p></div>}</section>
            <p className="workspace-privacy-note">Your practice record is stored in this browser. Keep confidential client information out of training.</p>
          </aside>
        </div>
      </div>
    </div>
  );
};
export default HomeScreen;
