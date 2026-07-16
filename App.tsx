
import React, { useState, createContext, useEffect, useMemo, useContext, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import LandingScreen from './screens/LandingScreen';
import { ROUTES } from './routes';
import { SessionSettings, TrialSimContextType, PracticeMode } from './types';
import { LoadingSpinner } from './components/LoadingSpinner';
import { Chat } from './types';
import { ConversationBridgeProvider } from './components/ConversationBridge';
import { loadActiveSession, loadPendingSettings, clearPendingSettings, clearActiveSession } from './services/storageService';

/** Retry once on chunk load failure (stale deploy / flaky network). */
function lazyWithRetry(
  factory: () => Promise<{ default: React.ComponentType<any> }>,
  retries = 1,
): React.LazyExoticComponent<React.ComponentType<any>> {
  return React.lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await factory();
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  });
}

const DraftingStudioScreen = lazyWithRetry(() => import('./screens/DraftingStudioScreen'));
const HomeScreen = lazyWithRetry(() => import('./screens/HomeScreen'));
const SetupScreen = lazyWithRetry(() => import('./screens/SetupScreen'));
const PracticeArena = lazyWithRetry(() => import('./screens/PracticeArena'));
const PerformanceScreen = lazyWithRetry(() => import('./screens/PerformanceScreen'));
const CaseLibraryScreen = lazyWithRetry(() => import('./screens/CaseLibraryScreen'));
const BenchCounselScreen = lazyWithRetry(() => import('./screens/BenchCounselScreen'));
const JudgesScreen = lazyWithRetry(() => import('./screens/JudgesScreen'));
const OpposingCounselScreen = lazyWithRetry(() => import('./screens/OpposingCounselScreen'));
const AIPersonasScreen = lazyWithRetry(() => import('./screens/AIPersonasScreen'));
const StrategyRoomScreen = lazyWithRetry(() => import('./screens/StrategyRoomScreen'));
const DreadlerArenaScreen = lazyWithRetry(() => import('./screens/DreadlerArenaScreen'));
const ResearchIDEScreen = lazyWithRetry(() => import('./screens/ResearchIDEScreen'));
const CourtSourcesScreen = lazyWithRetry(() => import('./screens/CourtSourcesScreen'));
// Non-critical global overlays: defer their module graphs out of the initial chunk.
const OversightSpirit = lazyWithRetry(() => import('./components/OversightSpirit').then(m => ({ default: m.OversightSpirit })));
const CommandPalette = lazyWithRetry(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })));
const ScreenLoader = () => <div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner text="Loading..." /></div>;

const ROUTE_TITLES: Record<string, string> = {
  [ROUTES.LANDING]: 'Legal skills training',
  [ROUTES.HOME]: 'Dashboard',
  [ROUTES.SETUP]: 'New trial',
  [ROUTES.PRACTICE]: 'Practice hearing',
  [ROUTES.ANALYSIS]: 'Performance review',
  [ROUTES.LIBRARY]: 'Case library',
  [ROUTES.BENCH]: 'Bench and counsel',
  [ROUTES.JUDGES]: 'Bench and counsel',
  [ROUTES.OPPOSING_COUNSEL]: 'Bench and counsel',
  [ROUTES.DRAFTING_STUDIO]: 'Drafting studio',
  [ROUTES.PERSONAS]: 'Personas',
  [ROUTES.STRATEGY]: 'Strategy room',
  [ROUTES.DREADLER]: 'Deception arena',
  [ROUTES.RESEARCH_IDE]: 'Research IDE',
  [ROUTES.COURT_SOURCES]: 'Court sources',
};

const normalizePath = (pathname: string): string => {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
};

const RouteTitle: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    const path = normalizePath(location.pathname);
    const title = ROUTE_TITLES[path] || 'Legal skills training';
    document.title = `${title} · LexForge`;
  }, [location.pathname]);
  return null;
};

const isPracticeMode = (value: unknown): value is PracticeMode =>
  value === 'indian' || value === 'international';

const readStoredPracticeMode = (): PracticeMode | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('practiceMode');
    return isPracticeMode(raw) ? raw : null;
  } catch {
    return null;
  }
};

/** Light shape guard so corrupt pending/active payloads do not crash screens. */
const isUsableSessionSettings = (settings: unknown): settings is SessionSettings => {
  if (!settings || typeof settings !== 'object') return false;
  const s = settings as SessionSettings;
  if (!isPracticeMode(s.practiceMode)) return false;
  const caseDetail = s.caseDetail as { title?: unknown; id?: unknown } | null | undefined;
  if (!caseDetail || typeof caseDetail !== 'object') return false;
  if (typeof caseDetail.title !== 'string' || !caseDetail.title.trim()) return false;
  return true;
};

/**
 * Single boot source of truth for mode + session.
 * design.md: never rehydrate mode from session storage when the user cleared mode.
 * Pending is left in storage until leave-mode / overwrite (avoids StrictMode clear races).
 */
const loadBootState = (): {
  practiceMode: PracticeMode | null;
  settings: SessionSettings | null;
} => {
  const practiceMode = readStoredPracticeMode();
  if (!practiceMode) {
    return { practiceMode: null, settings: null };
  }

  const active = loadActiveSession();
  if (
    active?.settings
    && isUsableSessionSettings(active.settings)
    && active.settings.practiceMode === practiceMode
  ) {
    return { practiceMode, settings: active.settings };
  }

  const pending = loadPendingSettings();
  if (
    pending
    && isUsableSessionSettings(pending)
    && pending.practiceMode === practiceMode
  ) {
    return { practiceMode, settings: pending };
  }

  return { practiceMode, settings: null };
};

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

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallbackMessage?: string; resetKey?: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallbackMessage?: string; resetKey?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }
  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }
  render() {
    if (this.state.hasError) {
      const isChunkError = /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
        this.state.error?.message || '',
      );
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="w-16 h-16 border border-red-300 flex items-center justify-center mx-auto text-red-500 text-2xl font-bold">!</div>
            <h2 className="text-xl font-serif font-semibold text-brand-text-primary">
              {isChunkError ? 'Failed to load this screen' : 'Something went wrong'}
            </h2>
            <p className="text-sm text-brand-text-secondary">
              {this.state.error?.message || this.props.fallbackMessage || 'An unexpected error occurred.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => { this.setState({ hasError: false, error: null }); }}
                className="px-6 py-2 text-sm border border-brand-accent text-brand-accent hover:bg-brand-accent/10 transition-colors"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => { this.setState({ hasError: false, error: null }); window.location.hash = '#/home'; }}
                className="px-6 py-2 text-sm border border-brand-border text-brand-text-secondary hover:bg-white/[0.04] transition-colors"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Overlays must not take down the whole shell if their chunk fails. */
class SoftErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('SoftErrorBoundary caught:', error, info);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Route guard: context only (never localStorage). Storage can lag leave-mode by a tick. */
const ModeSpecificRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const context = useContext(TrialSimContext);
  const mode = context?.practiceMode ?? null;
  if (!mode) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }
  return element;
};

const guardedLazy = (element: React.ReactElement, fallbackMessage: string, withLayout = true) => (
  <ErrorBoundary fallbackMessage={fallbackMessage}>
    <React.Suspense fallback={<ScreenLoader />}>
      {withLayout ? (
        <Layout>
          <ModeSpecificRoute element={element} />
        </Layout>
      ) : (
        <ModeSpecificRoute element={element} />
      )}
    </React.Suspense>
  </ErrorBoundary>
);

function App() {
  // Coalesce mode + session on first paint (no async mount restore race / flash).
  const [boot] = useState(loadBootState);
  const [currentSessionSettings, setCurrentSessionSettings] = useState<SessionSettings | null>(boot.settings);
  const [activeChatJudge, setActiveChatJudge] = useState<Chat | null>(null);
  const [activeChatOpposingCounsel, setActiveChatOpposingCounsel] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFactGenerating, setIsFactGenerating] = useState(false);
  const [practiceMode, setPracticeMode] = useState<PracticeMode | null>(boot.practiceMode);

  // Persist practice mode key only. Session wipe belongs to endPracticeMode
  // so a transient null never races rehydration and drops settings.
  useEffect(() => {
    try {
      if (practiceMode) {
        localStorage.setItem('practiceMode', practiceMode);
      } else {
        localStorage.removeItem('practiceMode');
      }
    } catch {
      /* private mode / quota */
    }
  }, [practiceMode]);

  const endPracticeMode = useCallback(() => {
    // design.md: leave mode clears mode + active/pending + chats synchronously
    // so route guards and overlays never see sticky storage.
    try {
      localStorage.removeItem('practiceMode');
    } catch {
      /* noop */
    }
    clearActiveSession();
    clearPendingSettings();
    setCurrentSessionSettings(null);
    setActiveChatJudge(null);
    setActiveChatOpposingCounsel(null);
    setPracticeMode(null);
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

  const defaultRedirect = practiceMode ? ROUTES.HOME : ROUTES.LANDING;

  return (
    <LexForgeContext.Provider value={contextValue}>
      <ConversationBridgeProvider>
      <HashRouter>
        <RouteTitle />
        {isLoading && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]"><LoadingSpinner text="Loading..." spinnerColor="text-white" textColor="text-white/50" /></div>}
        {error && <GlobalErrorDisplay message={error} onDismiss={() => setError(null)} />}
        <SoftErrorBoundary>
          <React.Suspense fallback={null}><OversightSpirit /></React.Suspense>
        </SoftErrorBoundary>
        <SoftErrorBoundary>
          <React.Suspense fallback={null}><CommandPalette /></React.Suspense>
        </SoftErrorBoundary>
        <Routes>
          <Route path={ROUTES.LANDING} element={<ErrorBoundary fallbackMessage="The landing page encountered an error."><LandingScreen /></ErrorBoundary>} />
          <Route path="/" element={<Navigate to={defaultRedirect} replace />} />
          <Route path={ROUTES.HOME} element={guardedLazy(<HomeScreen />, 'The dashboard encountered an error.')} />
          <Route path={ROUTES.SETUP} element={guardedLazy(<SetupScreen />, 'Trial setup encountered an error.')} />
          <Route path={ROUTES.PRACTICE} element={guardedLazy(<PracticeArena />, 'The practice arena encountered an error.', false)} />
          <Route path={ROUTES.ANALYSIS} element={guardedLazy(<PerformanceScreen />, 'Performance review encountered an error.')} />
          <Route path={ROUTES.LIBRARY} element={guardedLazy(<CaseLibraryScreen />, 'Case library encountered an error.')} />
          <Route path={ROUTES.BENCH} element={guardedLazy(<BenchCounselScreen />, 'Bench and counsel encountered an error.')} />
          {/* Legacy paths: thin screens redirect into BenchCounselScreen tabs */}
          <Route path={ROUTES.JUDGES} element={<ErrorBoundary fallbackMessage="Bench redirect failed."><React.Suspense fallback={null}><JudgesScreen /></React.Suspense></ErrorBoundary>} />
          <Route path={ROUTES.OPPOSING_COUNSEL} element={<ErrorBoundary fallbackMessage="Counsel redirect failed."><React.Suspense fallback={null}><OpposingCounselScreen /></React.Suspense></ErrorBoundary>} />
          <Route path={ROUTES.DRAFTING_STUDIO} element={guardedLazy(<DraftingStudioScreen />, 'Drafting Studio encountered an error.')} />
          <Route path={ROUTES.PERSONAS} element={guardedLazy(<AIPersonasScreen />, 'Personas encountered an error.')} />
          <Route path={ROUTES.STRATEGY} element={guardedLazy(<StrategyRoomScreen />, 'Strategy room encountered an error.')} />
          <Route path={ROUTES.DREADLER} element={guardedLazy(<DreadlerArenaScreen />, 'Dreadler Arena encountered an error.')} />
          <Route path={ROUTES.RESEARCH_IDE} element={guardedLazy(<ResearchIDEScreen />, 'Research IDE encountered an error.')} />
          <Route path={ROUTES.COURT_SOURCES} element={guardedLazy(<CourtSourcesScreen />, 'Court Sources encountered an error.')} />
          <Route path="*" element={<Navigate to={defaultRedirect} replace />} />
        </Routes>
      </HashRouter>
      </ConversationBridgeProvider>
    </LexForgeContext.Provider>
  );
}

export default App;
