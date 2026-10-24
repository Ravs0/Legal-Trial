import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, FilePenLine, Gavel, Scale, ShieldCheck } from 'lucide-react';
import { TrialSimContext } from '../App';
import { ROUTES } from '../routes';
import { clearActiveSession, clearStoredLexForgeData, loadActiveSession, savePendingSettings } from '../services/storageService';
import { trackDemoTrialStarted, trackEvent } from '../services/analyticsService';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Brand } from '../components/Brand';
import { heroCourtroom } from '../assets';
import type { PracticeMode, SessionRecord } from '../types';

const LandingScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);
  if (!context) throw new Error('LexForge context is unavailable.');
  const [activeSession, setActiveSession] = useState<SessionRecord | null>(null);
  const [showModes, setShowModes] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [dataCleared, setDataCleared] = useState(false);
  const [starting, setStarting] = useState(false);
  const [destination, setDestination] = useState<string>(ROUTES.HOME);

  useEffect(() => { trackEvent('landing_viewed'); setActiveSession(loadActiveSession()); }, []);

  const chooseWorkspace = (target: string = ROUTES.HOME) => {
    if (context.practiceMode) { navigate(target); return; }
    setDestination(target);
    setShowModes(true);
    trackEvent('landing_modes_opened', { source: 'revamp' });
  };
  const enterWorkspace = (mode: PracticeMode) => {
    context.setPracticeMode(mode);
    trackEvent('practice_mode_selected', { mode, source: 'landing' });
    navigate(destination);
  };
  const startDemo = async (replace = false) => {
    if (starting) return;
    setStarting(true);
    try {
      const { createDemoSessionSettings } = await import('../services/demoSessionService');
      const settings = createDemoSessionSettings();
      if (replace) clearActiveSession();
      trackDemoTrialStarted({ source: 'landing', mode: settings.practiceMode, caseId: settings.caseDetail.id, caseTitle: settings.caseDetail.title, replacedActiveSession: replace });
      context.setPracticeMode(settings.practiceMode);
      context.setCurrentSessionSettings(settings);
      savePendingSettings(settings);
      navigate(ROUTES.PRACTICE);
    } catch (error) {
      context.setError(error instanceof Error ? error.message : 'Unable to start the practice hearing.');
    } finally { setStarting(false); }
  };

  const enterPractice = () => {
    const saved = loadActiveSession();
    if (saved) {
      setActiveSession(saved);
      context.setPracticeMode(saved.settings.practiceMode);
      context.setCurrentSessionSettings(saved.settings);
      navigate(ROUTES.PRACTICE);
    } else {
      void startDemo();
    }
  };

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a href="#/landing" aria-label="LexForge home"><Brand /></a>
        <nav aria-label="Explore LexForge"><a href="#the-practice" onClick={event => { event.preventDefault(); document.getElementById('the-practice')?.scrollIntoView({ block: 'start' }); }}>The practice</a><a href="#the-workbench" onClick={event => { event.preventDefault(); document.getElementById('the-workbench')?.scrollIntoView({ block: 'start' }); }}>The workbench</a></nav>
        <Button variant="outline" onClick={() => chooseWorkspace()}>Open workspace <ArrowUpRight size={15} /></Button>
      </header>
      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="eyebrow"><span className="eyebrow-rule" />A workspace for the considered advocate</p>
            <h1 id="landing-title">Better arguments.<br />Built by <em>practice.</em></h1>
            <p className="landing-introduction">Find your footing before you take the floor. Rehearse a hearing, develop your argument, and learn from every exchange.</p>
            <div className="landing-primary-actions">
              <Button size="lg" isLoading={starting} onClick={enterPractice}>{activeSession ? 'Resume hearing' : 'Start practicing'}<ArrowRight size={17} /></Button>
              <span>{activeSession ? activeSession.settings.caseDetail.title : 'A 15-minute hearing. No setup needed.'}</span>
            </div>
            <div className="landing-proof"><ShieldCheck size={15} /><span>Indian & international law</span><span className="proof-separator" /><span>Training, not legal advice</span></div>
          </div>
          <div className="landing-study" aria-hidden="true">
            <div className="study-topline"><span>THE ADVOCATE’S WORKSPACE</span><span>EST. IN PRACTICE</span></div>
            <div className="study-photo"><img src={heroCourtroom} alt="" /><span className="study-photo-caption">Room to find your voice.</span></div>
            <div className="practice-document">
              <div className="document-meta"><span>YOUR NEXT HEARING</span><Scale size={22} strokeWidth={1.1} /></div>
              <p className="document-title">A case to make.<br />A point to prove.</p>
              <div className="document-rule" />
              <div className="document-item"><span>01</span>Identify the issue.<Check size={13} /></div>
              <div className="document-item"><span>02</span>Build the argument.<Check size={13} /></div>
              <div className="document-item"><span>03</span>Answer the bench.<span className="document-cursor" /></div>
              <span className="document-footnote">A practice brief, ready for your perspective.</span>
            </div>
            <div className="study-bottomline"><span>PREPARE WITH PURPOSE</span><ArrowDown size={15} /></div>
          </div>
        </section>

        <section className="practice-section" id="the-practice" aria-labelledby="practice-title">
          <div className="section-introduction"><p className="eyebrow">A better way to prepare</p><h2 id="practice-title">Make the room<br />your rehearsal.</h2><p>Good judgment comes from doing the work. Here’s a place to do it again.</p></div>
          <ol className="practice-method">
            {[
              ['01', 'Take a position.', 'Choose a case and make your submissions to an AI bench and opposing counsel.'],
              ['02', 'Meet the challenge.', 'Respond to questions, consider objections, and sharpen your reasoning in the moment.'],
              ['03', 'Find your next step.', 'Review your transcript and feedback. Take one thing into your next hearing.'],
            ].map(([number, title, description]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}
          </ol>
        </section>

        <section className="landing-workbench" id="the-workbench" aria-labelledby="workbench-title">
          <div className="section-heading"><div><p className="eyebrow">Beyond the hearing</p><h2 id="workbench-title">Your argument starts here.</h2></div><span className="section-side-note">One connected legal workbench</span></div>
          <div className="workbench-feature-grid">
            {[
              { icon: Gavel, number: 'I', title: 'Rehearse with intention', text: 'A case, a bench, and a reason to think on your feet.', target: ROUTES.SETUP, action: 'Prepare a hearing' },
              { icon: FilePenLine, number: 'II', title: 'Put it into words', text: 'From the facts to a considered draft, with space to revise.', target: ROUTES.DRAFTING_STUDIO, action: 'Open drafting studio' },
              { icon: BookOpen, number: 'III', title: 'Follow the authority', text: 'Research, organize sources, and build a manuscript you can defend.', target: ROUTES.RESEARCH_IDE, action: 'Open research desk' },
            ].map(({ icon: Icon, number, title, text, target, action }) => <button className="workbench-feature" onClick={() => chooseWorkspace(target)} key={number} aria-label={action}><div className="feature-top"><Icon size={24} strokeWidth={1.3} /><span>{number}</span></div><h3>{title}</h3><p>{text}</p><span className="feature-link">{action}<ArrowUpRight size={17} /></span></button>)}
          </div>
        </section>
        <section className="landing-closing"><p className="eyebrow">The next argument is yours.</p><h2>Show up better prepared.</h2><Button size="lg" onClick={() => chooseWorkspace()}>Enter workspace <ArrowRight size={17} /></Button></section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <details className="privacy-details"><summary>Training & privacy</summary><div><p>Use fictional or anonymized material. Workspace data stays in this browser; AI requests are sent to the configured provider. Verify legal sources before real-world use.</p><button onClick={() => setShowClearConfirm(true)}>{dataCleared ? 'Local data cleared' : 'Clear local data'}</button></div></details>
        <span>Made for the work of getting better.</span>
      </footer>

      <Modal isOpen={showModes} onClose={() => setShowModes(false)} title="Choose your practice" size="lg">
        <p className="text-sm text-brand-text-secondary mb-6">Your jurisdiction sets the cases, bench, and drafting instruments.</p>
        <div className="jurisdiction-options">
          <button onClick={() => enterWorkspace('indian')}><span className="jurisdiction-monogram">IN</span><h3>Indian practice</h3><p>Constitutional, criminal, civil & commercial law.</p><span>Enter workspace <ArrowRight size={16} /></span></button>
          <button onClick={() => enterWorkspace('international')}><span className="jurisdiction-monogram">IL</span><h3>International law</h3><p>Arbitration, human rights, treaties & trade.</p><span>Enter workspace <ArrowRight size={16} /></span></button>
        </div>
      </Modal>
      <Modal isOpen={showClearConfirm} onClose={() => setShowClearConfirm(false)} title="Clear your local work?" size="sm">
        <p className="text-sm text-brand-text-secondary">This removes saved hearings and LexForge workspace data from this browser.</p>
        <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowClearConfirm(false)}>Keep work</Button><Button variant="danger" onClick={() => { clearStoredLexForgeData(); context.endPracticeMode(); setActiveSession(null); setDataCleared(true); setShowClearConfirm(false); }}>Clear data</Button></div>
      </Modal>
    </div>
  );
};
export default LandingScreen;
