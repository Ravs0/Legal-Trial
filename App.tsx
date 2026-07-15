
import React, { useState, createContext, useEffect, useMemo, useContext } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import LandingScreen from './screens/LandingScreen';
import { ROUTES } from './routes';
import { SessionSettings, TrialSimContextType, PracticeMode } from './types';
import { LoadingSpinner } from './components/LoadingSpinner';
import { Chat } from './types';
import { ConversationBridgeProvider } from './components/ConversationBridge';
import { loadActiveSession, loadPendingSettings, clearPendingSettings, clearActiveSession } from './services/storageService';

const DraftingStudioScreen = React.lazy(() => import('./screens/DraftingStudioScreen'));
const HomeScreen = React.lazy(() => import('./screens/HomeScreen'));
const SetupScreen = React.lazy(() => import('./screens/SetupScreen'));
const PracticeArena = React.lazy(() => import('./screens/PracticeArena'));
const PerformanceScreen = React.lazy(() => import('./screens/PerformanceScreen'));
const CaseLibraryScreen = React.lazy(() => import('./screens/CaseLibraryScreen'));
const BenchCounselScreen = React.lazy(() => import('./screens/BenchCounselScreen'));
const AIPersonasScreen = React.lazy(() => import('./screens/AIPersonasScreen'));
const StrategyRoomScreen = React.lazy(() => import('./screens/StrategyRoomScreen'));
const DreadlerArenaScreen = React.lazy(() => import('./screens/DreadlerArenaScreen'));
const ResearchIDEScreen = React.lazy(() => import('./screens/ResearchIDEScreen'));
const CourtSourcesScreen = React.lazy(() => import('./screens/CourtSourcesScreen'));
// Non-critical global overlays: defer their module graphs out of the initial chunk.
const OversightSpirit = React.lazy(() => import('./components/OversightSpirit').then(m => ({ default: m.OversightSpirit })));
const CommandPalette = React.lazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })));
const ScreenLoader = () => <div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..." /></div>;

export const LexForgeContext = createContext<TrialSimContextType | null>(null);
/** @deprecated Use LexForgeContext instead */
export const TrialSimContext = LexForgeContext;

const GlobalErrorDisplay: React.FC<{ message: string; onDismiss: () => void }> = ({ message, onDismiss }) => (
  <div role="alert" aria-live="assertive" className="fixed top-5 right-5 bg-red-700 text-white p-4 rounded-md shadow-lg z-[100] max-w-sm animate-fadeIn border border-red-500">
    <div className="flex justify-between items-start">
      <div>
        <h4 className="font-bold text-lg">Application Error</h4>
        <p className="text-sm mt-1">{message}</p>
      </div>
      <button onClick={onDismiss} className="ml-4 min-h-11 min-w-11 text-red-100 hover:text-white text-2xl leading-none" aria-label="Dismiss application error">&times;</button>
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

  // Persist practice mode only. Do not re-hydrate mode from sessions here
  // (that re-armed "leave mode" every time practiceMode became null).
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

  // Mount-only: restore in-progress session / pending setup once.
  useEffect(() => {
    const activeSession = loadActiveSession();
    if (activeSession) {
      setCurrentSessionSettings(activeSession.settings);
      setPracticeMode((prev) => prev ?? activeSession.settings.practiceMode);
      return;
    }

    const pending = loadPendingSettings();
    if (pending) {
      setCurrentSessionSettings(pending);
      setPracticeMode((prev) => prev ?? pending.practiceMode);
      clearPendingSettings();
    }
  }, []);

  const endPracticeMode = useMemo(() => {
    return () => {
      clearActiveSession();
      clearPendingSettings();
      setCurrentSessionSettings(null);
      setActiveChatJudge(null);
      setActiveChatOpposingCounsel(null);
      setPracticeMode(null);
    };
  }, []);

  const contextValue = useMemo(() => ({
    currentSessionSettings, setCurrentSessionSettings,
    activeChatJudge, setActiveChatJudge,
    activeChatOpposingCounsel, setActiveChatOpposingCounsel,
    isLoading, setIsLoading,
    error, setError,
    practiceMode, setPracticeMode,
    endPracticeMode,
    isFactGenerating, setIsFactGenerating,
  }), [currentSessionSettings, activeChatJudge, activeChatOpposingCounsel, isLoading, error, practiceMode, endPracticeMode, isFactGenerating]);

  return (
    <LexForgeContext.Provider value={contextValue}>
      <ConversationBridgeProvider>
      <HashRouter>
        {isLoading && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]"><LoadingSpinner text="Loading..." spinnerColor="text-white" textColor="text-white/50" /></div>}
        {error && <GlobalErrorDisplay message={error} onDismiss={() => setError(null)} />}
        <React.Suspense fallback={null}><OversightSpirit /></React.Suspense>
        <React.Suspense fallback={null}><CommandPalette /></React.Suspense>
        <Routes>
          <Route path={ROUTES.LANDING} element={<ErrorBoundary fallbackMessage="The landing page encountered an error."><LandingScreen /></ErrorBoundary>} />
          <Route path="/" element={<Navigate to={practiceMode ? ROUTES.HOME : ROUTES.LANDING} replace />} />
          <Route path={ROUTES.HOME} element={<React.Suspense fallback={<ScreenLoader />}><Layout><ErrorBoundary fallbackMessage="The dashboard encountered an error."><ModeSpecificRoute element={<HomeScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.SETUP} element={<React.Suspense fallback={<ScreenLoader />}><Layout><ErrorBoundary fallbackMessage="Trial setup encountered an error."><ModeSpecificRoute element={<SetupScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.PRACTICE} element={<React.Suspense fallback={<ScreenLoader />}><ErrorBoundary fallbackMessage="The practice arena encountered an error."><ModeSpecificRoute element={<PracticeArena />} /></ErrorBoundary></React.Suspense>} />
          <Route path={ROUTES.ANALYSIS} element={<React.Suspense fallback={<ScreenLoader />}><Layout><ErrorBoundary fallbackMessage="Performance review encountered an error."><ModeSpecificRoute element={<PerformanceScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.LIBRARY} element={<React.Suspense fallback={<ScreenLoader />}><Layout><ErrorBoundary fallbackMessage="Case library encountered an error."><ModeSpecificRoute element={<CaseLibraryScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.BENCH} element={<React.Suspense fallback={<ScreenLoader />}><Layout><ErrorBoundary fallbackMessage="Bench and counsel encountered an error."><ModeSpecificRoute element={<BenchCounselScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.JUDGES} element={<Navigate to={ROUTES.BENCH} replace />} />
          <Route path={ROUTES.OPPOSING_COUNSEL} element={<Navigate to={{ pathname: ROUTES.BENCH, search: '?tab=counsel' }} replace />} />
          <Route path={ROUTES.DRAFTING_STUDIO} element={<React.Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..."/></div>}><Layout><ErrorBoundary fallbackMessage="Drafting Studio encountered an error."><ModeSpecificRoute element={<DraftingStudioScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.PERSONAS} element={<React.Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..."/></div>}><Layout><ErrorBoundary fallbackMessage="Personas encountered an error."><ModeSpecificRoute element={<AIPersonasScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.STRATEGY} element={<React.Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..."/></div>}><Layout><ErrorBoundary fallbackMessage="Strategy room encountered an error."><ModeSpecificRoute element={<StrategyRoomScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.DREADLER} element={<React.Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..."/></div>}><Layout><ErrorBoundary fallbackMessage="Dreadler Arena encountered an error."><ModeSpecificRoute element={<DreadlerArenaScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.RESEARCH_IDE} element={<React.Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..."/></div>}><Layout><ErrorBoundary fallbackMessage="Research IDE encountered an error."><ModeSpecificRoute element={<ResearchIDEScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path={ROUTES.COURT_SOURCES} element={<React.Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..."/></div>}><Layout><ErrorBoundary fallbackMessage="Court Sources encountered an error."><ModeSpecificRoute element={<CourtSourcesScreen />} /></ErrorBoundary></Layout></React.Suspense>} />
          <Route path="*" element={<Navigate to={practiceMode ? ROUTES.HOME : ROUTES.LANDING} replace />} />
        </Routes>
      </HashRouter>
      </ConversationBridgeProvider>
    </LexForgeContext.Provider>
  );
}

export default App;
