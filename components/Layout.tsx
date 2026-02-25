import React, { useContext, useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { APP_NAME, ROUTES } from '../constants';
import { TrialSimContext } from '../App';
import { CourtIcon } from './icons/CourtIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';
import { HomeIcon } from './icons/HomeIcon';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { GavelIcon } from './icons/GavelIcon';
import { UsersIcon } from './icons/UsersIcon';
import { QuillIcon } from './icons/QuillIcon';
import { Bars3Icon } from './icons/Bars3Icon';
import { XMarkIcon } from './icons/XMarkIcon';


interface LayoutProps {
  children: React.ReactNode;
}

const NavItem: React.FC<{
  to: string;
  label: string;
  icon?: React.ReactNode;
  end?: boolean;
  onClick?: () => void;
  isSidebarOpen: boolean;
}> = ({ to, label, icon, end = false, onClick, isSidebarOpen }) => {
  const location = useLocation();
  const getIsActive = ({ isActive }: { isActive: boolean }): boolean => isActive;

  const navLinkClass = (isActive: boolean): string =>
    `flex items-center px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-300 ease-out group relative overflow-hidden backdrop-blur-sm
     ${isActive
      ? 'bg-brand-accent/15 text-brand-accent border border-brand-accent/30 shadow-glow-gold-sm'
      : 'text-brand-text-secondary border border-transparent hover:bg-brand-bg-secondary/80 hover:text-brand-text-primary hover:border-brand-border'
    }`;

  const manualIsActive = location.pathname === to || (!end && location.pathname.startsWith(to) && to !== ROUTES.HOME) || (end && location.pathname === to && to === ROUTES.HOME);

  const commonContent = (
    <>
      {manualIsActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-accent rounded-r-md shadow-[0_0_10px_rgba(201,168,76,0.5)]"></div>}
      {icon && <span className={`h-5 w-5 flex-shrink-0 transition-all duration-300 ${manualIsActive ? 'text-brand-accent drop-shadow-md' : 'group-hover:text-brand-text-primary group-hover:drop-shadow-sm'} ${isSidebarOpen ? 'mr-3.5' : 'mx-auto'}`}>{icon}</span>}
      {isSidebarOpen && <span className="truncate tracking-wide">{label}</span>}
      {!isSidebarOpen && (
        <span className="absolute left-full ml-4 px-3 py-1.5 text-xs font-semibold tracking-wider text-brand-bg-primary bg-brand-accent rounded-lg shadow-glow-gold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
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
    <NavLink to={to} className={({ isActive }) => navLinkClass(getIsActive({ isActive }))} end={end}>
      {commonContent}
    </NavLink>
  );
};

const ArrowLeftOnRectangleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  </svg>
);


export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const context = useContext(TrialSimContext);
  const practiceMode = context?.practiceMode;
  const modeDisplay = practiceMode ? (practiceMode.charAt(0).toUpperCase() + practiceMode.slice(1)) : '';

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const savedState = localStorage.getItem('sidebarOpen');
    return savedState ? JSON.parse(savedState) : window.innerWidth > 768;
  });

  useEffect(() => {
    localStorage.setItem('sidebarOpen', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const hideSidebarOnPaths = [ROUTES.PRACTICE, ROUTES.LANDING];
  const showSidebar = !hideSidebarOnPaths.includes(location.pathname) && practiceMode;

  return (
    <div className="min-h-screen flex bg-transparent text-brand-text-primary overflow-x-hidden relative">
      {/* Decorative background lines for layout */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden flex justify-center opacity-30">
        <div className="w-[1px] h-full bg-gradient-to-b from-transparent via-brand-accent/10 to-transparent mx-[20%]"></div>
        <div className="w-[1px] h-full bg-gradient-to-b from-transparent via-brand-accent/10 to-transparent mx-[20%]"></div>
      </div>

      {showSidebar && (
        <aside
          className={`fixed inset-y-0 left-0 z-40 bg-brand-navy/95 backdrop-blur-xl border-r border-brand-accent/10 flex flex-col transition-all duration-300 ease-in-out shadow-[4px_0_24px_rgba(0,0,0,0.6)] ${isSidebarOpen ? 'w-72' : 'w-24'}`}
        >
          {/* Sidebar Header */}
          <div className={`flex items-center justify-between h-24 flex-shrink-0 px-6 border-b border-brand-accent/10 bg-brand-bg-primary/50 relative overflow-hidden`}>
            {/* Subtle glow behind logo */}
            <div className="absolute -left-10 -top-10 w-32 h-32 bg-brand-accent/10 rounded-full blur-[40px] pointer-events-none"></div>

            {isSidebarOpen && (
              <Link to={ROUTES.HOME} className="flex items-center hover:opacity-80 transition-opacity z-10 w-full">
                <div className="w-10 h-10 rounded-lg bg-brand-bg-secondary border border-brand-accent/20 flex items-center justify-center mr-3 shadow-inner-subtle flex-shrink-0">
                  <CourtIcon className="h-5 w-5 text-brand-accent" />
                </div>
                <div className="overflow-hidden">
                  <h1 className="text-xl font-bold font-serif leading-tight text-shimmer truncate">{APP_NAME}</h1>
                  {modeDisplay && <p className="text-[10px] font-mono tracking-widest text-brand-text-secondary uppercase mt-0.5 truncate">{modeDisplay} Arena</p>}
                </div>
              </Link>
            )}
            <button
              onClick={toggleSidebar}
              className={`p-2.5 rounded-xl hover:bg-brand-accent/10 focus:outline-none focus:ring-2 focus:ring-brand-accent transition-all duration-200 border border-transparent hover:border-brand-accent/20 flex-shrink-0 ${!isSidebarOpen ? 'mx-auto' : ''}`}
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {isSidebarOpen ? <XMarkIcon className="h-5 w-5 text-brand-text-secondary hover:text-brand-accent transition-colors" /> : <Bars3Icon className="h-6 w-6 text-brand-text-secondary hover:text-brand-accent transition-colors" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-grow p-4 space-y-2 overflow-y-auto overflow-x-hidden custom-scrollbar relative">
            <NavItem to={ROUTES.HOME} label="Dashboard" icon={<HomeIcon />} end={true} isSidebarOpen={isSidebarOpen} />
            <div className="h-px bg-gradient-to-r from-transparent via-brand-border-light to-transparent my-2 opacity-50"></div>
            <NavItem to={ROUTES.SETUP} label="New Trial" icon={<PlusCircleIcon />} isSidebarOpen={isSidebarOpen} />
            <NavItem to={ROUTES.DRAFTING_STUDIO} label="Drafting Studio" icon={<QuillIcon />} isSidebarOpen={isSidebarOpen} />
            <div className="h-px bg-gradient-to-r from-transparent via-brand-border-light to-transparent my-2 opacity-50"></div>
            <NavItem to={ROUTES.LIBRARY} label="Case Library" icon={<DocumentTextIcon />} isSidebarOpen={isSidebarOpen} />
            <NavItem to={ROUTES.JUDGES} label="Judges Roster" icon={<GavelIcon />} isSidebarOpen={isSidebarOpen} />
            <NavItem to={ROUTES.OPPOSING_COUNSEL} label="Opposing Counsel" icon={<UsersIcon />} isSidebarOpen={isSidebarOpen} />
          </nav>

          {/* Footer Actions */}
          <div className={`p-4 border-t border-brand-accent/10 bg-brand-bg-primary/30 flex-shrink-0 space-y-4 ${!isSidebarOpen ? 'flex flex-col items-center' : ''}`}>
            <NavItem
              to={ROUTES.LANDING}
              label="Switch Arena"
              icon={<ArrowLeftOnRectangleIcon />}
              onClick={() => {
                context?.setPracticeMode(null);
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              isSidebarOpen={isSidebarOpen}
            />
            {isSidebarOpen && (
              <div className="text-center w-full px-2">
                <div className="w-12 h-[1px] bg-brand-accent/30 mx-auto mb-3"></div>
                <p className="text-[10px] font-mono tracking-wider text-brand-text-secondary/50 uppercase">
                  &copy; {new Date().getFullYear()} {APP_NAME} <br /> Simulator
                </p>
              </div>
            )}
          </div>
        </aside>
      )}

      <main className={`flex-grow z-10 ${showSidebar ? (isSidebarOpen ? 'md:ml-72' : 'md:ml-24') : ''} flex flex-col transition-all duration-300 ease-in-out min-h-screen relative`}>
        {/* Subtle top gradient bar for all pages */}
        {showSidebar && <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-gradient-from via-brand-gradient-mid to-brand-gradient-to opacity-20 z-50"></div>}

        <div className="flex-grow p-4 sm:p-8 lg:p-10 mb-12">
          {children}
        </div>

        {showSidebar && (
          <footer className="absolute bottom-0 left-0 right-0 bg-brand-bg-primary/80 backdrop-blur-md py-4 text-center border-t border-brand-accent/10 text-[11px] font-mono tracking-wide text-brand-text-secondary transition-all">
            <p className="opacity-70"><span className="text-brand-accent mr-1">§</span> Disclaimer: AI responses are for simulation purposes only and do not constitute legal advice.</p>
          </footer>
        )}
      </main>
    </div>
  );
};