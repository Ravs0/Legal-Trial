
import React, { useState, createContext, useEffect, useMemo, useContext } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import HomeScreen from './screens/HomeScreen';
import SetupScreen from './screens/SetupScreen';
import PracticeArena from './screens/PracticeArena';
import PerformanceScreen from './screens/PerformanceScreen';
import CaseLibraryScreen from './screens/CaseLibraryScreen';
import JudgesScreen from './screens/JudgesScreen';
import OpposingCounselScreen from './screens/OpposingCounselScreen';
import LandingScreen from './screens/LandingScreen';
import { ROUTES } from './constants';
import { SessionSettings, TrialSimContextType, PracticeMode } from './types';
import { LoadingSpinner } from './components/LoadingSpinner';
import { Chat } from './types';
import { OversightSpirit } from './components/OversightSpirit';
import { ConversationBridgeProvider } from './components/ConversationBridge';
import { CommandPalette } from './components/CommandPalette';
import { loadActiveSession, loadPendingSettings, clearPendingSettings } from './services/storageService';

const DraftingStudioScreen = React.lazy(() => import('./screens/DraftingStudioScreen'));
const AIPersonasScreen = React.lazy(() => import('./screens/AIPersonasScreen'));
const StrategyRoomScreen = React.lazy(() => import('./screens/StrategyRoomScreen'));
const DreadlerArenaScreen = React.lazy(() => import('./screens/DreadlerArenaScreen'));
const ResearchIDEScreen = React.lazy(() => import('./screens/ResearchIDEScreen'));

export const LexForgeContext = createContext<TrialSimContextType | null>(null);
/** @deprecated Use LexForgeContext instead */
export const TrialSimContext = LexForgeContext;

const GlobalErrorDisplay: React.FC<{ message: string; onDismiss: () => void }> = ({ message, onDismiss }) => (
  <div className="fixed top-5 right-5 bg-red-700 text-white p-4 rounded-md shadow-lg z-[100] max-w-sm animate-fadeIn border border-red-500">
    <div className="flex justify-between items-start">
      <div>
        <h4 className="font-bold text-lg">Application Error</h4>
        <p className="text-sm mt-1">{message}</p>
      </div>
      <button onClick={onDismiss} className="ml-4 text-red-100 hover:text-white text-2xl leading-none">&times;</button>
    </div>
  </div>
);



class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallbackMessage?: string }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode; fallbackMessage?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="w-16 h-16 border border-red-300 flex items-center justify-center mx-auto text-red-500 text-2xl font-bold">!</div>
            <h2 className="text-xl font-serif font-semibold text-brand-text-primary">Something went wrong</h2>
            <p className="text-sm text-brand-text-secondary">{this.state.error?.message || this.props.fallbackMessage || 'An unexpected error occurred.'}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.hash = '#/home'; }}
              className="px-6 py-2 text-sm border border-brand-accent text-brand-accent hover:bg-brand-accent/10 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ModeSpecificRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const context = useContext(TrialSimContext);
  const mode = context?.practiceMode || (localStorage.getItem('practiceMode') as PracticeMode | null);
  if (!mode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }
  return element;
};


function App() {
  const [currentSessionSettings, setCurrentSessionSettings] = useState<SessionSettings | null>(null);
  const [activeChatJudge, setActiveChatJudge] = useState<Chat | null>(null);
  const [activeChatOpposingCounsel, setActiveChatOpposingCounsel] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFactGenerating, setIsFactGenerating] = useState(false); // New state for drafting fact generation
  const [practiceMode, setPracticeMode] = useState<PracticeMode | null>(() => {
    return localStorage.getItem('practiceMode') as PracticeMode | null;
  });

  // Persist practice mode + clear session when it is unset.
  useEffect(() => {
    if (practiceMode) {
      localStorage.setItem('practiceMode', practiceMode);
    } else {
      localStorage.removeItem('practiceMode');
      setCurrentSessionSettings(null);
      setActiveChatJudge(null);
      setActiveChatOpposingCounsel(null);
    }
  }, [practiceMode]);

  useEffect(() => {
    const activeSession = loadActiveSession();
    if (activeSession) {
      setCurrentSessionSettings(activeSession.settings);
      if (!practiceMode) {
        setPracticeMode(activeSession.settings.practiceMode);
      }
      return;
    }

    // Fallback: restore from pending (pre‑arena) settings so a refresh
    // during setup → arena transition doesn't lose the configuration.
    const pending = loadPendingSettings();
    if (pending) {
      setCurrentSessionSettings(pending);
      if (!practiceMode) {
        setPracticeMode(pending.practiceMode);
      }
      clearPendingSettings();
    }
  }, [practiceMode]);

  const contextValue = useMemo(() => ({
    currentSessionSettings, setCurrentSessionSettings,
    activeChatJudge, setActiveChatJudge,
    activeChatOpposingCounsel, setActiveChatOpposingCounsel,
    isLoading, setIsLoading,
    error, setError,
    practiceMode, setPracticeMode,
    isFactGenerating, setIsFactGenerating, // Add to context
  }), [currentSessionSettings, activeChatJudge, activeChatOpposingCounsel, isLoading, error, practiceMode, isFactGenerating]);

  return (
    <LexForgeContext.Provider value={contextValue}>
      <ConversationBridgeProvider>
      <HashRouter>
        {isLoading && <div className="fixed inset-0 bg-brand-bg-primary bg-opacity-80 flex items-center justify-center z-[9999]"><LoadingSpinner text="Loading..." spinnerColor="text-brand-accent" textColor="text-brand-text-secondary" /></div>}
        {error && <GlobalErrorDisplay message={error} onDismiss={() => setError(null)} />}
        <OversightSpirit />
        <CommandPalette />
        <Routes>
          <Route path={ROUTES.LANDING} element={<LandingScreen />} />
          <Route path="/" element={<Navigate to={practiceMode ? ROUTES.HOME : ROUTES.LANDING} replace />} />
          <Route path={ROUTES.HOME} element={<Layout><ModeSpecificRoute element={<HomeScreen />} /></Layout>} />
          <Route path={ROUTES.SETUP} element={<Layout><ModeSpecificRoute element={<SetupScreen />} /></Layout>} />
          <Route path={ROUTES.PRACTICE} element={<ModeSpecificRoute element={<PracticeArena />} />} />
          <Route path={ROUTES.ANALYSIS} element={<Layout><ModeSpecificRoute element={<PerformanceScreen />} /></Layout>} />
          <Route path={ROUTES.LIBRARY} element={<Layout><ModeSpecificRoute element={<CaseLibraryScreen />} /></Layout>} />
          <Route path={ROUTES.JUDGES} element={<Layout><ModeSpecificRoute element={<JudgesScreen />} /></Layout>} />
          <Route path={ROUTES.OPPOSING_COUNSEL} element={<Layout><ModeSpecificRoute element={<OpposingCounselScreen />} /></Layout>} />
          <Route path={ROUTES.DRAFTING_STUDIO} element={<React.Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..."/></div>}><Layout><ErrorBoundary fallbackMessage="Drafting Studio encountered an error."><ModeSpecificRoute element={<DraftingStudioScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.PERSONAS} element={<React.Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..."/></div>}><Layout><ModeSpecificRoute element={<AIPersonasScreen />} /></Layout></React.Suspense>} />
          <Route path={ROUTES.STRATEGY} element={<React.Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..."/></div>}><Layout><ModeSpecificRoute element={<StrategyRoomScreen />} /></Layout></React.Suspense>} />
          <Route path={ROUTES.DREADLER} element={<React.Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..."/></div>}><Layout><ErrorBoundary fallbackMessage="Dreadler Arena encountered an error."><ModeSpecificRoute element={<DreadlerArenaScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.RESEARCH_IDE} element={<React.Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..."/></div>}><Layout><ErrorBoundary fallbackMessage="Research IDE encountered an error."><ResearchIDEScreen /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path="*" element={<Navigate to={practiceMode ? ROUTES.HOME : ROUTES.LANDING} replace />} />
        </Routes>
      </HashRouter>
      </ConversationBridgeProvider>
    </LexForgeContext.Provider>
  );
}

export default App;
