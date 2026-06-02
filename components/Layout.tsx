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
    `flex items-center px-4 py-3 rounded-lg text-[13px] font-medium transition-all group relative overflow-hidden
     ${isActive
      ? 'bg-brand-accent/10 text-brand-accent border border-brand-accent/20'
      : 'text-brand-text-secondary border border-transparent hover:bg-white/5 hover:text-brand-text-primary'
    }`;

  const manualIsActive = location.pathname === to || (!end && location.pathname.startsWith(to) && to !== ROUTES.HOME) || (end && location.pathname === to && to === ROUTES.HOME);

  const commonContent = (
    <>
      {icon && <span className={`h-4 w-4 flex-shrink-0 transition-opacity ${manualIsActive ? 'text-brand-accent opacity-100' : 'opacity-70 group-hover:opacity-100'} ${isSidebarOpen ? 'mr-3' : 'mx-auto'}`}>{icon}</span>}
      {isSidebarOpen && <span className="truncate tracking-wide">{label}</span>}
      {!isSidebarOpen && (
        <span className="absolute left-full ml-4 px-2 py-1 text-[11px] font-medium text-brand-bg-primary bg-brand-accent rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none md:block hidden">
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
    return savedState ? JSON.parse(savedState) : window.innerWidth > 1024;
  });

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebarOpen', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const toggleDesktopSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const toggleMobileSidebar = () => setIsMobileOpen(!isMobileOpen);

  const hideSidebarOnPaths = [ROUTES.PRACTICE, ROUTES.LANDING];
  const showSidebar = !hideSidebarOnPaths.includes(location.pathname) && practiceMode;

  return (
    <div className="min-h-screen flex bg-brand-bg-primary text-brand-text-primary overflow-x-hidden relative">

      {/* Mobile Top Bar */}
      {showSidebar && (
        <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-brand-bg-primary/95 backdrop-blur-xl border-b border-white/5 z-40 flex items-center justify-between px-4">
          <Link to={ROUTES.HOME} className="flex items-center space-x-2">
            <CourtIcon className="h-5 w-5 text-brand-accent" />
            <h1 className="text-[17px] font-semibold text-brand-text-primary">{APP_NAME}</h1>
          </Link>
          <button onClick={toggleMobileSidebar} className="p-2 -mr-2 text-brand-text-secondary hover:text-brand-text-primary transition-colors">
            <Bars3Icon className="h-6 w-6" />
          </button>
        </div>
      )}

      {/* Overlay for mobile sidebar */}
      {showSidebar && isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      {showSidebar && (
        <aside
          className={`fixed inset-y-0 left-0 z-50 bg-brand-bg-secondary border-r border-white/5 flex flex-col transition-all duration-300 ease-in-out
            ${isSidebarOpen ? 'md:w-64' : 'md:w-[72px]'}
            ${isMobileOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full md:translate-x-0'}
          `}
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between h-16 flex-shrink-0 px-4 border-b border-white/5">
            <div className={`flex items-center overflow-hidden transition-all ${(!isSidebarOpen && !isMobileOpen) ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 flex-1'}`}>
              <CourtIcon className="h-4 w-4 text-brand-accent mr-2" />
              <div className="flex flex-col">
                <h1 className="text-[15px] font-semibold text-brand-text-primary leading-tight truncate">{APP_NAME}</h1>
              </div>
            </div>
            <button
              onClick={() => isMobileOpen ? toggleMobileSidebar() : toggleDesktopSidebar()}
              className={`p-1.5 rounded-md hover:bg-white/5 text-brand-text-secondary hover:text-brand-text-primary transition-colors ${!isSidebarOpen && !isMobileOpen ? 'mx-auto' : ''}`}
            >
              {isMobileOpen ? <XMarkIcon className="h-5 w-5" /> : (isSidebarOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />)}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-grow py-4 px-3 space-y-1.5 overflow-y-auto custom-scrollbar">
            <NavItem to={ROUTES.HOME} label="Dashboard" icon={<HomeIcon />} end={true} isSidebarOpen={isSidebarOpen || isMobileOpen} />
            <div className="h-px bg-white/5 my-2 mx-2"></div>
            <NavItem to={ROUTES.SETUP} label="New Trial" icon={<PlusCircleIcon />} isSidebarOpen={isSidebarOpen || isMobileOpen} />
            <NavItem to={ROUTES.DRAFTING_STUDIO} label="Drafting Studio" icon={<QuillIcon />} isSidebarOpen={isSidebarOpen || isMobileOpen} />
            <NavItem 
              to={ROUTES.COUNCIL} 
              label="AI Council Chamber" 
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3 15l5.096-.813L9 9l.813 5.187L15 15l-5.187.813zM18 10.5l-.562-3.563L14 6.5l3.438-.437L18 2.5l.438 3.563L22 6.5l-3.562.438L18 10.5z" />
                </svg>
              } 
              isSidebarOpen={isSidebarOpen || isMobileOpen} 
            />
            <div className="h-px bg-white/5 my-2 mx-2"></div>
            <NavItem to={ROUTES.LIBRARY} label="Case Library" icon={<DocumentTextIcon />} isSidebarOpen={isSidebarOpen || isMobileOpen} />
            <NavItem to={ROUTES.JUDGES} label="Judges Roster" icon={<GavelIcon />} isSidebarOpen={isSidebarOpen || isMobileOpen} />
            <NavItem to={ROUTES.OPPOSING_COUNSEL} label="Opposing Counsel" icon={<UsersIcon />} isSidebarOpen={isSidebarOpen || isMobileOpen} />
          </nav>

          {/* Footer Actions */}
          <div className={`p-4 border-t border-white/5 flex-shrink-0 space-y-3 ${(!isSidebarOpen && !isMobileOpen) ? 'flex flex-col items-center px-2' : ''}`}>
            <NavItem
              to={ROUTES.LANDING}
              label="End Session"
              icon={<ArrowLeftOnRectangleIcon />}
              onClick={() => {
                context?.setPracticeMode(null);
                if (window.innerWidth < 768) setIsMobileOpen(false);
              }}
              isSidebarOpen={isSidebarOpen || isMobileOpen}
            />
          </div>
        </aside>
      )}

      <main className={`flex-grow z-10 transition-all duration-300 ease-in-out min-h-screen flex flex-col 
        ${showSidebar ? (isSidebarOpen ? 'md:ml-64' : 'md:ml-[72px]') : ''}
        ${showSidebar ? 'pt-14 md:pt-0' : ''}
      `}>
        <div className="flex-grow p-4 sm:p-8 lg:p-10 mb-8 max-w-[1400px] mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
};