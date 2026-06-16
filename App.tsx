
import React, { useState, createContext, useEffect, useMemo, useContext } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import HomeScreen from './screens/HomeScreen';
import SetupScreen from './screens/SetupScreen';
import PracticeArena from './screens/PracticeArena';
import PerformanceScreen from './screens/PerformanceScreen';
import CaseLibraryScreen from './screens/CaseLibraryScreen';
import JudgesScreen from './screens/JudgesScreen';
import OpposingCounselScreen from './screens/OpposingCounselScreen';
import LandingScreen from './screens/LandingScreen';
import DraftingStudioScreen from './screens/DraftingStudioScreen'; // Import the new screen
import CouncilChamberScreen from './screens/CouncilChamberScreen'; // Import the AI Council screen
import SentientSubjectsScreen from './screens/SentientSubjectsScreen'; // Sentient Subjects module
import { ROUTES } from './constants';
import { SessionSettings, TrialSimContextType, PracticeMode } from './types';
import { LoadingSpinner } from './components/LoadingSpinner';
import { Chat } from './types';
import { OversightSpirit } from './components/OversightSpirit';

export const TrialSimContext = createContext<TrialSimContextType | null>(null);

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



const ModeSpecificRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const context = useContext(TrialSimContext);
  if (!context?.practiceMode) {
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

  useEffect(() => {
    if (practiceMode) {
      localStorage.setItem('practiceMode', practiceMode);
    } else {
      localStorage.removeItem('practiceMode');
    }
  }, [practiceMode]);

  useEffect(() => {
    if (!practiceMode) {
      setCurrentSessionSettings(null);
      setActiveChatJudge(null);
      setActiveChatOpposingCounsel(null);
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
    <TrialSimContext.Provider value={contextValue}>
      <HashRouter>
        {isLoading && <div className="fixed inset-0 bg-brand-bg-primary bg-opacity-75 flex items-center justify-center z-[9999]"><LoadingSpinner text="Loading..." spinnerColor="text-brand-accent" textColor="text-brand-text-secondary" /></div>}
        {error && <GlobalErrorDisplay message={error} onDismiss={() => setError(null)} />}
        <OversightSpirit />
        <Routes>
          <Route path={ROUTES.LANDING} element={<LandingScreen />} />
          <Route path="/" element={<Layout><Navigate to={practiceMode ? ROUTES.HOME : ROUTES.LANDING} replace /></Layout>} />
          <Route path={ROUTES.HOME} element={<Layout><ModeSpecificRoute element={<HomeScreen />} /></Layout>} />
          <Route path={ROUTES.SETUP} element={<Layout><ModeSpecificRoute element={<SetupScreen />} /></Layout>} />
          <Route path={ROUTES.PRACTICE} element={<ModeSpecificRoute element={<PracticeArena />} />} />
          <Route path={ROUTES.ANALYSIS} element={<Layout><ModeSpecificRoute element={<PerformanceScreen />} /></Layout>} />
          <Route path={ROUTES.LIBRARY} element={<Layout><ModeSpecificRoute element={<CaseLibraryScreen />} /></Layout>} />
          <Route path={ROUTES.JUDGES} element={<Layout><ModeSpecificRoute element={<JudgesScreen />} /></Layout>} />
          <Route path={ROUTES.OPPOSING_COUNSEL} element={<Layout><ModeSpecificRoute element={<OpposingCounselScreen />} /></Layout>} />
          <Route path={ROUTES.DRAFTING_STUDIO} element={<Layout><ModeSpecificRoute element={<DraftingStudioScreen />} /></Layout>} />
          <Route path={ROUTES.COUNCIL} element={<Layout><ModeSpecificRoute element={<CouncilChamberScreen />} /></Layout>} />
          <Route path={ROUTES.SENTIENT_SUBJECTS} element={<Layout><ModeSpecificRoute element={<SentientSubjectsScreen />} /></Layout>} />
          <Route path="*" element={<Navigate to={practiceMode ? ROUTES.HOME : ROUTES.LANDING} replace />} />
        </Routes>
      </HashRouter>
    </TrialSimContext.Provider>
  );
}

export default App;
