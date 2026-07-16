import React, { useContext, useState, useEffect, useMemo } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME, ROUTES } from '../routes';
import { TrialSimContext } from '../App';
import { CourtIcon } from './icons/CourtIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';
import { HomeIcon } from './icons/HomeIcon';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { GavelIcon } from './icons/GavelIcon';
import { QuillIcon } from './icons/QuillIcon';
import { Bars3Icon } from './icons/Bars3Icon';
import { XMarkIcon } from './icons/XMarkIcon';
import { loadActiveSession } from '../services/storageService';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { SurfacePattern } from './SurfacePattern';

interface LayoutProps {
  children: React.ReactNode;
}

const SectionLabel: React.FC<{ label: string; isOpen: boolean }> = ({ label, isOpen }) => {
  if (!isOpen) return <div className="h-px bg-brand-border my-2 mx-2" />;
  return (
    <div className="px-3 pt-4 pb-1.5">
      <span className="text-[11px] text-brand-text-secondary/70">{label}</span>
    </div>
  );
};

const NavItem: React.FC<{
  to: string;
  label: string;
  icon?: React.ReactNode;
  end?: boolean;
  onClick?: () => void;
  isSidebarOpen: boolean;
}> = ({ to, label, icon, end = false, onClick, isSidebarOpen }) => {
  const location = useLocation();

  const isActive =
    location.pathname === to
    || (!end && location.pathname.startsWith(to) && to !== ROUTES.HOME)
    || (end && location.pathname === to && to === ROUTES.HOME);

  const className = `flex items-center px-2.5 py-2 rounded-md text-[13px] transition-colors relative group
    ${isActive
      ? 'bg-brand-bg-tertiary text-brand-text-primary'
      : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-white/[0.03]'
    }`;

  const content = (
    <>
      {icon && (
        <span className={`h-4 w-4 flex-shrink-0 opacity-80 ${isSidebarOpen ? 'mr-2.5' : 'mx-auto'}`}>
          {icon}
        </span>
      )}
      {isSidebarOpen && <span className="truncate flex-grow">{label}</span>}
      {!isSidebarOpen && (
        <span className="absolute left-full ml-2 px-2 py-1 rounded-md text-[11px] bg-brand-bg-tertiary border border-brand-border text-brand-text-primary opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none hidden md:block">
          {label}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`w-full ${className}`} aria-label={label}>
        {content}
      </button>
    );
  }

  return (
    <NavLink to={to} className={className} end={end} aria-label={label}>
      {content}
    </NavLink>
  );
};

const ExitIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  </svg>
);

const ChartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
  </svg>
);

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

const TargetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
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
  return mode.charAt(0).toUpperCase() + mode.slice(1);
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
  const labRoutes: string[] = [ROUTES.STRATEGY, ROUTES.PERSONAS, ROUTES.DREADLER];
  const [labsExpanded, setLabsExpanded] = useState(() => labRoutes.includes(location.pathname));

  useEffect(() => {
    localStorage.setItem('sidebarOpen', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  useEffect(() => {
    const sync = () => {
      const active = loadActiveSession();
      setActiveSessionLabel(active?.settings.caseDetail.title || null);
    };
    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', sync);
    };
  }, [location.pathname]);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (labRoutes.includes(location.pathname)) setLabsExpanded(true);
  }, [location.pathname]);

  const hideSidebarOnPaths: string[] = [ROUTES.PRACTICE, ROUTES.LANDING];
  const showSidebar = !hideSidebarOnPaths.includes(location.pathname) && Boolean(practiceMode);
  const isExpanded = isSidebarOpen || isMobileOpen;
  const shellStyle = useMemo(
    () => (isMobile ? { minHeight: `${viewportHeight}px`, height: `${viewportHeight}px` } : undefined),
    [isMobile, viewportHeight],
  );

  const quickActions = useMemo(
    () => [
      {
        id: 'new',
        label: 'New trial',
        icon: <PlusCircleIcon className="h-4 w-4" />,
        disabled: false,
        onClick: () => navigate(ROUTES.SETUP),
      },
      {
        id: 'resume',
        label: activeSessionLabel ? 'Resume' : 'No session',
        icon: <ResumeIcon className="h-4 w-4" />,
        disabled: !activeSessionLabel,
        onClick: () => navigate(ROUTES.PRACTICE),
      },
      {
        id: 'search',
        label: 'Search',
        icon: <SearchIcon className="h-4 w-4" />,
        disabled: false,
        onClick: () => window.dispatchEvent(new CustomEvent('cmd-palette-open')),
      },
    ],
    [activeSessionLabel, navigate],
  );

  return (
    <div className="min-h-screen flex bg-brand-bg-primary text-brand-text-primary overflow-hidden" style={shellStyle}>
      {showSidebar && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-40 border-b border-brand-border bg-brand-bg-primary/95 backdrop-blur-md">
          <div className="h-12 flex items-center justify-between px-4">
            <Link to={ROUTES.HOME} className="flex items-center gap-2 min-w-0">
              <span className="text-[14px] font-medium truncate">{APP_NAME}</span>
              {practiceMode && (
                <span className="text-[12px] text-brand-text-secondary truncate">{formatModeLabel(practiceMode)}</span>
              )}
            </Link>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('lexforge-open-coach'))}
                className="px-2 py-1 text-[11px] text-brand-text-secondary hover:text-brand-text-primary"
              >
                Coach
              </button>
              <button type="button" onClick={() => setIsMobileOpen(true)} className="p-2 -mr-2 text-brand-text-secondary" aria-label="Menu">
                <Bars3Icon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showSidebar && isMobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsMobileOpen(false)} />
      )}

      {showSidebar && (
        <aside
          className={`fixed inset-y-0 left-0 z-50 bg-brand-bg-secondary border-r border-brand-border flex flex-col transition-all duration-200
            ${isSidebarOpen ? 'md:w-56' : 'md:w-14'}
            ${isMobileOpen ? 'flex translate-x-0 w-64 shadow-xl' : 'hidden -translate-x-full md:flex md:translate-x-0'}
          `}
          aria-hidden={isMobile && !isMobileOpen}
          inert={isMobile && !isMobileOpen}
        >
          {/* Subtle structure on chrome */}
          <SurfacePattern variant="dots" className="opacity-70" />

          <div className="relative z-10 flex items-center justify-between h-12 px-3 border-b border-brand-border flex-shrink-0">
            <div className={`min-w-0 ${!isExpanded ? 'hidden' : 'flex-1'}`}>
              <p className="text-[13px] font-medium truncate">{APP_NAME}</p>
              {practiceMode && (
                <p className="text-[11px] text-brand-text-secondary">{formatModeLabel(practiceMode)} mode</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => (isMobileOpen ? setIsMobileOpen(false) : setIsSidebarOpen(!isSidebarOpen))}
              className={`p-1.5 rounded-md text-brand-text-secondary hover:text-brand-text-primary hover:bg-white/[0.04] ${!isExpanded ? 'mx-auto' : ''}`}
              aria-label={isMobileOpen ? 'Close menu' : isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {isMobileOpen || isSidebarOpen ? <XMarkIcon className="h-4 w-4" /> : <Bars3Icon className="h-4 w-4" />}
            </button>
          </div>

          {isExpanded && (
            <div className="relative z-10 p-2 border-b border-brand-border space-y-1">
              {quickActions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={a.disabled}
                  onClick={a.onClick}
                  className={`w-full h-9 px-2.5 rounded-md text-left text-[12px] flex items-center gap-2 border border-brand-border
                    ${a.disabled ? 'text-brand-text-secondary/40' : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-white/[0.03]'}`}
                >
                  {a.icon}
                  <span>{a.label}</span>
                </button>
              ))}
              {activeSessionLabel && (
                <p className="px-2.5 pt-1 text-[11px] text-brand-text-secondary/80 line-clamp-2">{activeSessionLabel}</p>
              )}
            </div>
          )}

          <nav className="relative z-10 flex-grow py-2 px-2 space-y-0.5 overflow-y-auto custom-scrollbar">
            <SectionLabel label="Practice" isOpen={isExpanded} />
            <NavItem to={ROUTES.HOME} label="Home" icon={<HomeIcon />} end isSidebarOpen={isExpanded} />
            <NavItem to={ROUTES.SETUP} label="New trial" icon={<PlusCircleIcon />} isSidebarOpen={isExpanded} />
            <NavItem to={ROUTES.LIBRARY} label="Cases" icon={<DocumentTextIcon />} isSidebarOpen={isExpanded} />
            <NavItem to={ROUTES.ANALYSIS} label="Review" icon={<ChartIcon />} isSidebarOpen={isExpanded} />

            <SectionLabel label="Write" isOpen={isExpanded} />
            <NavItem to={ROUTES.DRAFTING_STUDIO} label="Drafting" icon={<QuillIcon />} isSidebarOpen={isExpanded} />

            <SectionLabel label="Research" isOpen={isExpanded} />
            <NavItem to={ROUTES.RESEARCH_IDE} label="Research" icon={<DocumentTextIcon />} isSidebarOpen={isExpanded} />
            {practiceMode === 'indian' && (
              <NavItem to={ROUTES.COURT_SOURCES} label="Court sources" icon={<CourtIcon />} isSidebarOpen={isExpanded} />
            )}

            <div className={`mt-3 ${isExpanded ? 'px-1' : ''}`}>
              <button
                type="button"
                onClick={() => setLabsExpanded((open) => !open)}
                aria-expanded={labsExpanded}
                className={`w-full flex items-center rounded-md px-2.5 py-2 text-[13px] text-brand-text-secondary hover:bg-white/[0.03] hover:text-brand-text-primary ${isExpanded ? 'justify-between' : 'justify-center'}`}
                aria-label="Toggle optional labs"
              >
                <span className={`flex items-center ${isExpanded ? 'gap-2.5' : ''}`}><SparklesIcon />{isExpanded && 'Optional labs'}</span>
                {isExpanded && <span className="text-[11px]" aria-hidden="true">{labsExpanded ? '−' : '+'}</span>}
              </button>
              {labsExpanded && (
                <div className={isExpanded ? 'mt-0.5 space-y-0.5' : 'space-y-0.5'}>
                  <NavItem to={ROUTES.STRATEGY} label="Strategy" icon={<SparklesIcon />} isSidebarOpen={isExpanded} />
                  <NavItem to={ROUTES.PERSONAS} label="Personas" icon={<BrainIcon />} isSidebarOpen={isExpanded} />
                  <NavItem to={ROUTES.DREADLER} label="Deception" icon={<TargetIcon />} isSidebarOpen={isExpanded} />
                </div>
              )}
            </div>

            <SectionLabel label="Reference" isOpen={isExpanded} />
            <NavItem to={ROUTES.BENCH} label="Bench" icon={<GavelIcon />} isSidebarOpen={isExpanded} />
          </nav>

          <div className={`relative z-10 p-2 border-t border-brand-border ${!isExpanded ? 'flex justify-center' : ''}`}>
            <NavItem
              to={ROUTES.LANDING}
              label="Leave mode"
              icon={<ExitIcon className="h-4 w-4" />}
              onClick={() => {
                context?.endPracticeMode();
                if (window.innerWidth < 768) setIsMobileOpen(false);
                navigate(ROUTES.LANDING, { replace: true });
              }}
              isSidebarOpen={isExpanded}
            />
          </div>
        </aside>
      )}

      <main
        className={`relative flex-grow min-h-0 flex flex-col overflow-hidden bg-brand-bg-primary
        ${showSidebar ? (isSidebarOpen ? 'md:ml-56' : 'md:ml-14') : ''}
        ${showSidebar ? 'pt-12 md:pt-0' : ''}
      `}
      >
        {/* Soft interior grid (not loud wallpaper) */}
        {showSidebar && <SurfacePattern variant="grid" className="opacity-40" />}
        <div className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden w-full">
          {children}
        </div>
      </main>
    </div>
  );
};
