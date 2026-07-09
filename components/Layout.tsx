import React, { useContext, useState, useEffect, useMemo } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME, ROUTES } from '../constants';
import { TrialSimContext } from '../App';
import { CourtIcon } from './icons/CourtIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';
import { HomeIcon } from './icons/HomeIcon';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { GavelIcon } from './icons/GavelIcon';
import { QuillIcon } from './icons/QuillIcon';
import { Bars3Icon } from './icons/Bars3Icon';
import { XMarkIcon } from './icons/XMarkIcon';
import { BackgroundGeometry } from './BackgroundGeometry';
import { loadActiveSession } from '../services/storageService';
import { useVisualViewport } from '../hooks/useVisualViewport';

interface LayoutProps {
  children: React.ReactNode;
}

// ─── Section Header (only shows when sidebar is open) ─────────────────────────
const SectionLabel: React.FC<{ label: string; isOpen: boolean }> = ({ label, isOpen }) => {
  if (!isOpen) return <div className="h-px bg-white/10 my-2 mx-2" />;
  return (
    <div className="px-4 pt-4 pb-1.5">
      <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-brand-accent font-semibold">{label}</span>
    </div>
  );
};

// ─── Nav Item ─────────────────────────────────────────────────────────────────
const NavItem: React.FC<{
  to: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  end?: boolean;
  onClick?: () => void;
  isSidebarOpen: boolean;
}> = ({ to, label, icon, badge, end = false, onClick, isSidebarOpen }) => {
  const location = useLocation();

  const navLinkClass = (isActive: boolean): string =>
    `flex items-center px-2.5 py-2 rounded-lg text-[12px] font-medium transition-colors duration-150 group relative
     ${isActive
      ? 'bg-brand-accent/12 text-brand-accent shadow-[inset_3px_0_0_0] shadow-brand-accent'
      : 'text-white/55 hover:bg-white/[0.06] hover:text-white/90'
    }`;

  const manualIsActive = location.pathname === to || (!end && location.pathname.startsWith(to) && to !== ROUTES.HOME) || (end && location.pathname === to && to === ROUTES.HOME);

  const commonContent = (
    <>
      {icon && <span className={`h-4 w-4 flex-shrink-0 transition-opacity ${manualIsActive ? 'text-brand-accent opacity-100' : 'text-white/60 opacity-80 group-hover:opacity-100'} ${isSidebarOpen ? 'mr-2.5' : 'mx-auto'}`}>{icon}</span>}
      {isSidebarOpen && (
        <span className="truncate tracking-wide flex-grow">{label}</span>
      )}
      {isSidebarOpen && badge && (
        <span className="text-[8px] font-mono px-1.5 py-0.5 bg-brand-accent/15 text-brand-accent border border-brand-accent/30 tracking-wider uppercase ml-auto flex-shrink-0">{badge}</span>
      )}
      {!isSidebarOpen && (
        <span className="absolute left-full ml-4 px-2 py-1 text-[11px] font-medium text-brand-bg-primary bg-brand-accent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none md:block hidden">
          {label}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className={`w-full ${navLinkClass(manualIsActive)}`}>
        {commonContent}
      </button>
    )
  }

  return (
    <NavLink to={to} className={() => navLinkClass(manualIsActive)} end={end}>
      {commonContent}
    </NavLink>
  );
};

const ArrowLeftOnRectangleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  </svg>
);

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────
const SparklesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3 15l5.096-.813L9 9l.813 5.187L15 15l-5.187.813zM18 10.5l-.562-3.563L14 6.5l3.438-.437L18 2.5l.438 3.563L22 6.5l-3.562.438L18 10.5z" />
  </svg>
);

const BrainIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
  </svg>
);

const ChartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
  </svg>
);

const TargetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
    <circle cx="12" cy="12" r="10" stroke="currentColor" />
    <circle cx="12" cy="12" r="6" stroke="currentColor" />
    <circle cx="12" cy="12" r="2" stroke="currentColor" fill="currentColor" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m0 16v2M2 12h2m16 0h2" />
  </svg>
);
const ResumeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6.75 16.5 12l-6 5.25V6.75Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75v10.5" />
  </svg>
);

const SearchIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.6-5.4a6.75 6.75 0 1 1-13.5 0 6.75 6.75 0 0 1 13.5 0Z" />
  </svg>
);

const formatModeLabel = (mode: string | null | undefined) => {
  if (!mode) return '';
  return `${mode.charAt(0).toUpperCase()}${mode.slice(1)} Mode`;
};


export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);
  const { viewportHeight, isMobile } = useVisualViewport();
  const practiceMode = context?.practiceMode;

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const savedState = localStorage.getItem('sidebarOpen');
    return savedState ? JSON.parse(savedState) : window.innerWidth > 1024;
  });

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [activeSessionLabel, setActiveSessionLabel] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('sidebarOpen', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  useEffect(() => {
    const syncActiveSession = () => {
      const activeSession = loadActiveSession();
      if (!activeSession) {
        setActiveSessionLabel(null);
        return;
      }
      setActiveSessionLabel(activeSession.settings.caseDetail.title);
    };

    syncActiveSession();
    window.addEventListener('focus', syncActiveSession);
    window.addEventListener('storage', syncActiveSession);
    return () => {
      window.removeEventListener('focus', syncActiveSession);
      window.removeEventListener('storage', syncActiveSession);
    };
  }, [location.pathname]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const toggleDesktopSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const toggleMobileSidebar = () => setIsMobileOpen(!isMobileOpen);

  const hideSidebarOnPaths = [ROUTES.PRACTICE, ROUTES.LANDING];
  const showSidebar = !hideSidebarOnPaths.includes(location.pathname) && practiceMode;
  const isExpanded = isSidebarOpen || isMobileOpen;
  const shellStyle = useMemo(() => (
    isMobile
      ? { minHeight: `${viewportHeight}px`, height: `${viewportHeight}px` }
      : undefined
  ), [isMobile, viewportHeight]);
  const quickActions = useMemo(() => ([
    {
      id: 'start-trial',
      label: 'New Trial',
      icon: <PlusCircleIcon className="h-4 w-4" />,
      onClick: () => navigate(ROUTES.SETUP),
    },
    {
      id: 'resume-session',
      label: activeSessionLabel ? 'Resume Session' : 'No Active Session',
      icon: <ResumeIcon className="h-4 w-4" />,
      disabled: !activeSessionLabel,
      onClick: () => navigate(ROUTES.PRACTICE),
    },
    {
      id: 'search',
      label: 'Search',
      icon: <SearchIcon className="h-4 w-4" />,
      onClick: () => window.dispatchEvent(new CustomEvent('cmd-palette-open')),
    },
  ]), [activeSessionLabel, navigate]);

  return (
    <div className="min-h-screen flex bg-brand-bg-primary text-brand-text-primary overflow-hidden relative noise-overlay" style={shellStyle}>
      <BackgroundGeometry />

      {/* Mobile Top Bar — single row; quick actions live in the drawer */}
      {showSidebar && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-40 border-b border-white/8 bg-brand-bg-dark/95 backdrop-blur-xl">
          <div className="h-14 flex items-center justify-between px-4">
            <Link to={ROUTES.HOME} className="flex items-center gap-2 min-w-0">
              <CourtIcon className="h-5 w-5 text-brand-accent flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-[16px] font-semibold text-white/90 truncate">{APP_NAME}</h1>
                {practiceMode && <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-accent/80 truncate">{formatModeLabel(practiceMode)}</p>}
              </div>
            </Link>
            <button onClick={toggleMobileSidebar} className="p-2 -mr-2 text-white/50 hover:text-white/90 transition-colors" aria-label="Open menu">
              <Bars3Icon className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* Overlay for mobile sidebar */}
      {showSidebar && isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      {showSidebar && (
        <aside
          className={`fixed inset-y-0 left-0 z-50 bg-brand-bg-dark/98 backdrop-blur-xl border-r border-white/[0.06] flex flex-col transition-all duration-300 ease-in-out
            ${isSidebarOpen ? 'md:w-56' : 'md:w-[60px]'}
            ${isMobileOpen ? 'translate-x-0 w-[260px] shadow-2xl' : '-translate-x-full md:translate-x-0'}
          `}
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between h-14 flex-shrink-0 px-3 border-b border-white/8">
            <div className={`flex items-center overflow-hidden transition-all ${!isExpanded ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 flex-1'}`}>
              <CourtIcon className="h-4 w-4 text-brand-accent mr-2" />
              <div className="min-w-0">
                <h1 className="text-[13px] font-semibold text-white/90 leading-tight truncate">{APP_NAME}</h1>
                {practiceMode && <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-brand-accent/70 truncate">{formatModeLabel(practiceMode)}</p>}
              </div>
            </div>
            <button
              onClick={() => isMobileOpen ? toggleMobileSidebar() : toggleDesktopSidebar()}
              className={`p-1.5 rounded-xl hover:bg-white/10 text-white/50 hover:text-white/90 transition-colors ${!isExpanded ? 'mx-auto' : ''}`}
            >
              {isMobileOpen ? <XMarkIcon className="h-5 w-5" /> : (isSidebarOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />)}
            </button>
          </div>

          {isExpanded && (
            <div className="px-3 py-3 border-b border-white/8 space-y-2">
              <div className="grid grid-cols-1 gap-2">
                {quickActions.map(action => (
                  <button
                    key={action.id}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={`w-full min-h-[44px] px-3 rounded-xl border text-left text-[12px] font-medium flex items-center gap-2 transition-colors ${action.disabled ? 'border-white/8 text-white/25 bg-white/5' : 'border-white/10 text-white/80 hover:text-white hover:bg-white/8 hover:border-brand-accent/25'}`}
                  >
                    <span className="text-brand-accent">{action.icon}</span>
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
              {activeSessionLabel && (
                <div className="rounded-xl border border-brand-accent/20 bg-brand-accent/10 px-3 py-2">
                  <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-brand-accent/80">Active Session</p>
                  <p className="mt-1 text-[12px] text-white/80 line-clamp-2">{activeSessionLabel}</p>
                </div>
              )}
            </div>
          )}

          {/* Navigation — Practice first, then Workspace, then Advisors */}
          <nav className="flex-grow py-2 px-2 space-y-0.5 overflow-y-auto custom-scrollbar">
            <SectionLabel label="Practice" isOpen={isExpanded} />
            <NavItem to={ROUTES.HOME} label="Dashboard" icon={<HomeIcon />} end={true} isSidebarOpen={isExpanded} />
            <NavItem to={ROUTES.SETUP} label="New Trial" icon={<PlusCircleIcon />} isSidebarOpen={isExpanded} />
            <NavItem to={ROUTES.LIBRARY} label="Case Library" icon={<DocumentTextIcon />} isSidebarOpen={isExpanded} />
            <NavItem to={ROUTES.ANALYSIS} label="Review" icon={<ChartIcon />} isSidebarOpen={isExpanded} />

            <SectionLabel label="Workspace" isOpen={isExpanded} />
            <NavItem to={ROUTES.DRAFTING_STUDIO} label="Drafting Studio" icon={<QuillIcon />} isSidebarOpen={isExpanded} />
            <NavItem to={ROUTES.RESEARCH_IDE} label="Research IDE" icon={<DocumentTextIcon />} isSidebarOpen={isExpanded} />
            {practiceMode === 'indian' && (
              <NavItem to={ROUTES.COURT_SOURCES} label="Court Sources" icon={<CourtIcon />} isSidebarOpen={isExpanded} />
            )}

            <SectionLabel label="Advisors" isOpen={isExpanded} />
            <NavItem to={ROUTES.STRATEGY} label="Strategy Room" icon={<SparklesIcon />} isSidebarOpen={isExpanded} />
            <NavItem to={ROUTES.PERSONAS} label="AI Personas" icon={<BrainIcon />} isSidebarOpen={isExpanded} />
            <NavItem to={ROUTES.DREADLER} label="Deception Arena" icon={<TargetIcon />} isSidebarOpen={isExpanded} />

            <SectionLabel label="Reference" isOpen={isExpanded} />
            <NavItem to={ROUTES.BENCH} label="Bench & Counsel" icon={<GavelIcon />} isSidebarOpen={isExpanded} />
          </nav>

          {/* Mode Badge */}
          {isExpanded && (
            <div className="px-3 py-2 border-t border-white/8">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-accent/10 border border-brand-accent/20">
                <ChartIcon />
                <span className="text-[10px] font-mono text-brand-accent tracking-wider uppercase">{formatModeLabel(practiceMode)}</span>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className={`p-3 border-t border-white/8 flex-shrink-0 ${!isExpanded ? 'flex flex-col items-center px-2' : ''}`}>
            <NavItem
              to={ROUTES.LANDING}
              label="End Session"
              icon={<ArrowLeftOnRectangleIcon />}
              onClick={() => {
                context?.setPracticeMode(null);
                if (window.innerWidth < 768) setIsMobileOpen(false);
              }}
              isSidebarOpen={isExpanded}
            />
          </div>
        </aside>
      )}

      <main className={`flex-grow min-h-0 z-10 transition-all duration-300 ease-in-out flex flex-col overflow-hidden 
        ${showSidebar ? (isSidebarOpen ? 'md:ml-56' : 'md:ml-[60px]') : ''}
        ${showSidebar ? 'pt-14 md:pt-0' : ''}
      `}>
        {children}
      </main>
    </div>
  );
};