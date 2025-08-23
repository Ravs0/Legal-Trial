import React, { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { TrialSimContext } from '../App';
import { PerformanceMetrics, SessionRecord } from '../types';
import { ROUTES } from '../constants';
import { CheckCircleIcon } from '../components/icons/CheckCircleIcon'; 

const PerformanceScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation(); 
  const context = useContext(TrialSimContext);

  if (!context) throw new Error("TrialSimContext not found");
  const { setIsLoading: setGlobalLoading, setError: setGlobalError, practiceMode } = context;

  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true); 

  useEffect(() => {
    setIsLoading(true);
    setGlobalLoading(true);

    const routerState = location.state as { sessionRecord?: SessionRecord } | null;
    const recordFromState = routerState?.sessionRecord;

    if (recordFromState) {
      setSessionRecord(recordFromState);
      if (recordFromState.performance) {
        setPerformanceMetrics(recordFromState.performance);
      } else {
        setGlobalError("Performance metrics are missing for this session.");
        setPerformanceMetrics({
            argumentStrength: 0, precedentUsage: 0, constitutionalBasis: 0, responseQuality: 0, overallScore: 0,
            feedback: "Performance metrics were not available or generation failed.", 
            improvementAreas: ["Please try re-analyzing if the option is available or contact support."]
        });
      }
    } else if (!practiceMode) { 
      setGlobalError("No session data found and no practice mode selected.");
      navigate(ROUTES.LANDING);
    } else { 
      setGlobalError("No session data found to display performance. Please start a new session.");
      navigate(ROUTES.HOME); 
    }
    
    setIsLoading(false);
    setGlobalLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, practiceMode]); 

  const renderScoreBar = (label: string, score: number, outOf: number = 10) => (
    <div className="mb-4">
      <div className="flex justify-between mb-1.5">
        <span className="text-sm font-medium text-brand-text-secondary">{label}</span>
        {/* Score text color updated to red brand-accent */}
        <span className="text-sm font-semibold text-brand-accent">{score} / {outOf}</span> 
      </div>
      <div className="w-full bg-brand-bg-secondary rounded-full h-3 shadow-neumorphic-pressed"> {/* Bar background more subtle */}
        {/* Bar color updated to red brand-accent */}
        <div
          className="bg-brand-accent h-3 rounded-full transition-all duration-500 ease-out" 
          style={{ width: `${(score / outOf) * 100}%` }}
        ></div>
      </div>
    </div>
  );

  if (isLoading || !sessionRecord) { 
    return <div className="flex justify-center items-center h-64"><LoadingSpinner text="Loading performance analysis..." spinnerColor="text-brand-accent" textColor="text-brand-text-secondary" /></div>;
  }
  
  if (!performanceMetrics) { 
     return (
      <Card title="Performance Analysis Unavailable" className="text-center">
        <p className="text-brand-text-secondary mb-4">
            Performance data for this session is not available.
        </p>
        <Button onClick={() => navigate(ROUTES.HOME)} variant="secondary">Return to Dashboard</Button>
      </Card>
    );
  }


  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      <Card 
        title="Performance Analysis" 
        titleClassName="text-3xl" // Title will be red by Card component if not titleGradient
        titleGradient={true} // Apply red gradient for main title
        className="shadow-neumorphic-raised" 
      >
        {/* Inner panel with flat neumorphic shadow */}
        <div className="mb-8 p-5 bg-brand-bg-primary rounded-lg shadow-neumorphic-flat"> 
          <h3 className="text-xl font-semibold text-red-300 mb-2">Session Details:</h3> {/* Lighter red for sub-header */}
          <p className="text-sm text-brand-text-primary space-y-1"> {/* White text for details on dark bg */}
            <span><strong>Practice Mode:</strong> {sessionRecord.settings.practiceMode.charAt(0).toUpperCase() + sessionRecord.settings.practiceMode.slice(1)}</span><br />
            <span><strong>Case:</strong> {sessionRecord.settings.caseDetail.title}</span><br />
            <span><strong>Judge:</strong> {sessionRecord.settings.judgePersonality.name}</span><br />
            <span><strong>Opposing Counsel:</strong> {sessionRecord.settings.opposingCounselPersonality.name} ({sessionRecord.settings.opposingCounselPersonality.specialty})</span><br />
            <span><strong>Date:</strong> {new Date(sessionRecord.startTime).toLocaleDateString()}
            {sessionRecord.endTime ? ` at ${new Date(sessionRecord.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}`: ' (Incomplete)'}</span>
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6 mb-8">
          {/* Inner card titles are red by default from Card component */}
          <Card title="Score Breakdown" > 
            {renderScoreBar("Argument Strength", performanceMetrics.argumentStrength)}
            {renderScoreBar("Precedent Usage", performanceMetrics.precedentUsage)}
            {renderScoreBar("Legal Basis", performanceMetrics.constitutionalBasis)}
            {renderScoreBar("Response Quality (to Judge & OC)", performanceMetrics.responseQuality)}
            <div className="mt-5 pt-5 border-t border-red-700/50"> {/* Border tint, more subtle */}
              {renderScoreBar("Overall Score", performanceMetrics.overallScore, 10)}
            </div>
          </Card>

          <Card title="Overall Feedback"> 
            <div className="prose prose-sm max-w-none text-brand-text-primary leading-relaxed text-justify"> 
                <p>{performanceMetrics.feedback || "No specific feedback available."}</p>
            </div>
          </Card>
        </div>

        <Card title="Areas for Improvement" className="mb-8">
          {performanceMetrics.improvementAreas && performanceMetrics.improvementAreas.length > 0 && !performanceMetrics.improvementAreas[0].toLowerCase().includes("error") ? (
            <ul className="list-none space-y-2 text-brand-text-primary">
              {performanceMetrics.improvementAreas.map((area, index) => (
                <li key={index} className="flex items-start p-2 bg-brand-bg-secondary rounded-md shadow-neumorphic-flat"> {/* Subtle background for list items */}
                  <CheckCircleIcon className="h-5 w-5 text-green-400 mr-3 flex-shrink-0 mt-0.5" />
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-brand-text-secondary">{performanceMetrics.improvementAreas[0] || "No specific improvement areas identified, or analysis was incomplete."}</p>
          )}
        </Card>
        
        <Card title="Session Transcript" className="mt-6">
          {/* Transcript panel with inset neumorphic shadow */}
          <div className="max-h-[500px] overflow-y-auto p-3 bg-brand-bg-primary rounded-md space-y-2.5 text-sm shadow-neumorphic-pressed custom-scrollbar">
            {sessionRecord.transcript.map(msg => {
              let senderName = 'You (Counsel)';
              let bubbleClass = 'bg-brand-accent text-brand-accent-text text-right ml-auto shadow-neumorphic-flat'; // User: red bg, white text
              if (msg.sender === 'judge') {
                senderName = sessionRecord.settings.judgePersonality.name;
                bubbleClass = 'bg-neutral-800 text-brand-text-primary text-left mr-auto shadow-neumorphic-flat'; // Judge: dark neutral
              } else if (msg.sender === 'opposingCounsel') {
                const oc = sessionRecord.settings.opposingCounselPersonality;
                senderName = `${oc.name} (${oc.specialty})`;
                bubbleClass = 'bg-neutral-700 text-brand-text-primary text-left mr-auto shadow-neumorphic-flat'; // OC: slightly lighter neutral
              }
              return (
                <div key={msg.id} className={`p-3 rounded-lg max-w-[85%] ${bubbleClass}`}>
                  <span className="font-semibold block mb-0.5">{senderName}: </span>
                  <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                </div>
              );
            })}
          </div>
        </Card>

      </Card>
      
      <div className="mt-10 mb-6 text-center space-x-4">
        <Button onClick={() => navigate(ROUTES.SETUP)} variant="primary" size="lg">Start New Session</Button>
        <Button onClick={() => navigate(ROUTES.HOME)} variant="secondary" size="lg">Back to Dashboard</Button>
      </div>
    </div>
  );
};

export default PerformanceScreen;