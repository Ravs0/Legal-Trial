import React, { useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, BrainCircuit, ChevronRight, FilePenLine, Gavel, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Search, ShieldCheck, Sparkles, Swords, X } from 'lucide-react';
import { ROUTES } from '../routes';
import { TrialSimContext } from '../App';
import { loadActiveSession } from '../services/storageService';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { Brand } from './Brand';
import { Modal } from './Modal';
import { Button } from './Button';

const GROUPS: Array<{ label: string; items: Array<{ to: string; label: string; icon: typeof Gavel }> }> = [
  { label: 'Your practice', items: [
    { to: ROUTES.HOME, label: 'Overview', icon: LayoutDashboard },
    { to: ROUTES.SETUP, label: 'New hearing', icon: Gavel },
    { to: ROUTES.ANALYSIS, label: 'Performance', icon: Sparkles },
  ] },
  { label: 'The workbench', items: [
    { to: ROUTES.LIBRARY, label: 'Case library', icon: BookOpen },
    { to: ROUTES.DRAFTING_STUDIO, label: 'Drafting studio', icon: FilePenLine },
    { to: ROUTES.RESEARCH_IDE, label: 'Research desk', icon: Search },
    { to: ROUTES.BENCH, label: 'Bench & counsel', icon: ShieldCheck },
  ] },
  { label: 'Think further', items: [
    { to: ROUTES.STRATEGY, label: 'Strategy room', icon: BrainCircuit },
    { to: ROUTES.PERSONAS, label: 'AI personas', icon: Sparkles },
    { to: ROUTES.DREADLER, label: 'Deception arena', icon: Swords },
  ] },
];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const context = useContext(TrialSimContext);
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile, viewportHeight } = useVisualViewport();
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('sidebarOpen') !== 'false'; } catch { return true; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [activeCase, setActiveCase] = useState<string | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const sidebarId = useId();
  const mode = context?.practiceMode;
  const isArena = location.pathname === ROUTES.DREADLER;
  const hiddenPaths: string[] = [ROUTES.PRACTICE, ROUTES.LANDING];
  const showShell = Boolean(mode) && !hiddenPaths.includes(location.pathname);
  const currentItem = GROUPS.flatMap(group => group.items).find(item => item.to === location.pathname);
  const closeMenu = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    try { localStorage.setItem('sidebarOpen', String(expanded)); } catch { /* Storage can be unavailable. */ }
  }, [expanded]);

  useEffect(() => {
    setMobileOpen(false);
    const sync = () => setActiveCase(loadActiveSession()?.settings.caseDetail.title || null);
    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', sync);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => asideRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(asideRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || []).filter(el => el.offsetParent !== null);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
      (previousFocus || menuRef.current)?.focus();
    };
  }, [mobileOpen, closeMenu]);

  useEffect(() => {
    if (isMobile && !mobileOpen) return;
    const frame = requestAnimationFrame(() => {
      asideRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, mobileOpen, isMobile]);

  const leave = () => {
    setLeaveOpen(false);
    context?.endPracticeMode();
    navigate(ROUTES.LANDING, { replace: true });
  };

  if (!showShell) return <main id="main-content" className="bare-workspace">{children}</main>;

  return (
    <div className={['app-shell', expanded ? '' : 'is-collapsed', isArena ? 'has-arena' : ''].join(' ')} style={isMobile ? { height: viewportHeight } : undefined}>
      <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
      {mobileOpen && <div className="nav-backdrop" onClick={closeMenu} aria-hidden="true" />}
      <aside ref={asideRef} id={sidebarId} className={'workspace-sidebar ' + (mobileOpen ? 'is-mobile-open' : '')}
        role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen || undefined} aria-label="Workspace navigation"
        inert={isMobile && !mobileOpen ? true : undefined}>
        <div className="sidebar-brand">
          <Link to={ROUTES.HOME} aria-label="LexForge overview"><Brand compact={!expanded && !mobileOpen} /></Link>
          <button className="icon-button sidebar-close" onClick={closeMenu} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <button className="sidebar-search" onClick={() => window.dispatchEvent(new CustomEvent('cmd-palette-open'))} aria-label="Search workspace">
          <Search size={16} /><span>Search anything</span><kbd>⌘ K</kbd>
        </button>
        <nav className="sidebar-navigation" aria-label="Main">
          {GROUPS.map(group => <div className="nav-group" key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            {group.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end aria-label={label} className={({ isActive }) => 'sidebar-link ' + (isActive ? 'is-active' : '')} title={!expanded ? label : undefined}>
                <Icon size={17} strokeWidth={1.65} aria-hidden="true" /><span>{label}</span>
                <ChevronRight size={13} className="nav-current-marker" aria-hidden="true" />
              </NavLink>
            ))}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          {activeCase && <Link to={ROUTES.PRACTICE} className="resume-shortcut"><span className="resume-dot" /><span>Hearing in progress</span><ArrowRight size={15} /></Link>}
          <div className="workspace-jurisdiction">
            <div className="jurisdiction-monogram">{mode === 'indian' ? 'IN' : 'IL'}</div>
            <div><strong>{mode === 'indian' ? 'Indian practice' : 'International law'}</strong><span>Personal workspace</span></div>
          </div>
          <div className="sidebar-footer-actions">
            <button onClick={() => activeCase ? setLeaveOpen(true) : leave()} aria-label="Leave workspace">Leave workspace <ArrowRight size={13} /></button>
            <button className="icon-button collapse-navigation" onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}>
              {expanded ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div className="topbar-location">
            <button ref={menuRef} className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls={sidebarId}><Menu size={20} /></button>
            <span className="topbar-parent">Workspace</span><ChevronRight size={13} aria-hidden="true" /><span>{currentItem?.label || 'Overview'}</span>
          </div>
          <div className="topbar-actions">
            <span className="local-workspace-label"><span />Saved in this browser</span>
            <button className="topbar-coach" onClick={() => window.dispatchEvent(new CustomEvent('lexforge-open-coach'))}><Sparkles size={15} />Ask coach</button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="workspace-main">{children}</main>
      </div>
      <Modal isOpen={leaveOpen} onClose={() => setLeaveOpen(false)} title="Leave this hearing?" size="sm">
        <p className="text-sm leading-relaxed text-brand-text-secondary">Leaving the workspace clears your active hearing. Completed hearings and saved documents stay in this browser.</p>
        <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setLeaveOpen(false)}>Stay here</Button><Button onClick={leave}>Leave workspace</Button></div>
      </Modal>
    </div>
  );
};
