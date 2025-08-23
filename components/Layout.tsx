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
  // Determine if NavLink is active
  const getIsActive = ({ isActive }: { isActive: boolean }): boolean => isActive;
  
  const navLinkClass = (isActive: boolean): string =>
    `flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 ease-in-out group relative
     ${isActive
      ? 'bg-brand-bg-primary shadow-neumorphic-pressed text-brand-accent' // Active: pressed, red text
      : 'text-brand-text-secondary bg-brand-bg-primary shadow-neumorphic-flat hover:text-brand-accent hover:shadow-neumorphic-raised active:shadow-neumorphic-pressed' // Inactive: flat, hover raises + red text
    }`;
  
  // Manual isActive check for button version or cases where NavLink's detection might be tricky
  const manualIsActive = location.pathname === to || (!end && location.pathname.startsWith(to) && to !== ROUTES.HOME) || (end && location.pathname === to && to === ROUTES.HOME);

  const commonContent = (
    <>
      {icon && <span className={`h-5 w-5 flex-shrink-0 transition-colors group-hover:text-brand-accent ${manualIsActive ? 'text-brand-accent' : ''} ${isSidebarOpen ? 'mr-3' : 'mx-auto'}`}>{icon}</span>}
      {isSidebarOpen && <span className="truncate">{label}</span>}
      {!isSidebarOpen && (
        <span className="absolute left-full ml-3 px-2 py-1 text-xs font-medium text-brand-text-primary bg-brand-bg-secondary rounded-md shadow-neumorphic-raised opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
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
    <div className="min-h-screen flex bg-brand-bg-primary text-brand-text-primary overflow-x-hidden">
      {showSidebar && (
        <aside 
          className={`fixed inset-y-0 left-0 z-30 bg-brand-bg-primary shadow-neumorphic-raised flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-20'}`}
        >
          {/* Sidebar Header - Updated to red gradient */}
          <div className={`flex items-center justify-between h-20 flex-shrink-0 px-4 bg-gradient-to-br from-brand-gradient-from via-brand-gradient-mid to-brand-gradient-to text-brand-accent-text shadow-lg`}>
            {isSidebarOpen && (
              <Link to={ROUTES.HOME} className="flex items-center hover:opacity-80 transition-opacity">
                <CourtIcon className="h-10 w-10 mr-2" /> {/* Icon color will be white due to parent text-brand-accent-text */}
                <div>
                  <h1 className="text-xl font-bold font-serif leading-tight">{APP_NAME}</h1>
                  {modeDisplay && <p className="text-xs opacity-80 -mt-1">{modeDisplay} Arena</p>}
                </div>
              </Link>
            )}
             <button 
                onClick={toggleSidebar} 
                className="p-2 rounded-lg hover:bg-brand-accent-hover/30 focus:outline-none focus:ring-2 focus:ring-brand-accent-text neumorphic-interactive shadow-neumorphic-flat hover:shadow-neumorphic-raised active:shadow-neumorphic-pressed" // Interactive style for neumorphism
                aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
                {isSidebarOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
          </div>
          {/* Navigation */}
          <nav className="flex-grow p-3 space-y-2 overflow-y-auto overflow-x-hidden custom-scrollbar">
            <NavItem to={ROUTES.HOME} label="Dashboard" icon={<HomeIcon />} end={true} isSidebarOpen={isSidebarOpen}/>
            <NavItem to={ROUTES.SETUP} label="New Trial" icon={<PlusCircleIcon />} isSidebarOpen={isSidebarOpen}/>
            <NavItem to={ROUTES.DRAFTING_STUDIO} label="Drafting Studio" icon={<QuillIcon />} isSidebarOpen={isSidebarOpen}/>
            <NavItem to={ROUTES.LIBRARY} label="Case Library" icon={<DocumentTextIcon />} isSidebarOpen={isSidebarOpen}/>
            <NavItem to={ROUTES.JUDGES} label="Judges" icon={<GavelIcon />} isSidebarOpen={isSidebarOpen}/>
            <NavItem to={ROUTES.OPPOSING_COUNSEL} label="Opposing Counsel" icon={<UsersIcon />} isSidebarOpen={isSidebarOpen}/>
          </nav>
          {/* Footer Actions */}
          <div className={`p-3 border-t border-[var(--neumorphic-shadow-dark-var)] opacity-60 flex-shrink-0 space-y-3 ${!isSidebarOpen ? 'flex flex-col items-center' : ''}`}>
             <NavItem 
                to={ROUTES.LANDING} 
                label="Change Mode" 
                icon={<ArrowLeftOnRectangleIcon />} 
                onClick={() => {
                    context?.setPracticeMode(null);
                    if (window.innerWidth < 768) setIsSidebarOpen(false); 
                }}
                isSidebarOpen={isSidebarOpen}
             />
             {isSidebarOpen && (
                <p className="text-xs text-brand-text-secondary text-center px-2">
                    &copy; {new Date().getFullYear()} {APP_NAME}.
                </p>
             )}
          </div>
        </aside>
      )}
      
      <main className={`flex-grow ${showSidebar ? (isSidebarOpen ? 'md:pl-64' : 'md:pl-20') : ''} flex flex-col transition-all duration-300 ease-in-out overflow-y-auto`}>
        <div className="flex-grow p-4 sm:p-6 lg:p-8"> {/* Ensure main content area can scroll if its content overflows */}
          {children}
        </div>

        {showSidebar && ( 
          <footer className="bg-brand-bg-primary py-3 text-center border-t border-[var(--neumorphic-shadow-dark-var)] opacity-60 text-xs text-brand-text-secondary flex-shrink-0">
            <p>Disclaimer: AI responses are for simulation purposes only and not legal advice.</p>
          </footer>
        )}
      </main>
    </div>
  );
};