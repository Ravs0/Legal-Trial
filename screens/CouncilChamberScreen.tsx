import React, { useState, useEffect, useRef, useContext } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TrialSimContext } from '../App';
import { SelectInput } from '../components/SelectInput';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { CourtIcon } from '../components/icons/CourtIcon';

enum ChamberMode {
  DIRECT = 'direct',
  ORACLE = 'oracle',
  COUNCIL = 'council',
  SYNTHESIS = 'synthesis',
}

interface Persona {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  avatar: string;
}

const PERSONAS: Persona[] = [
  {
    id: 'leibowitz',
    name: 'Samuel Leibowitz',
    role: 'Evidentiary Trial Strategist',
    systemPrompt: 'You are Samuel Leibowitz, the legendary American criminal defense attorney. Analyze the facts rigorously. Strip away inferences from direct evidence, detect logical loopholes in the opposition\'s case, and formulate a high-impact, courtroom-ready defense strategy. Your tone is sharp, evidentiary, and intensely strategic.',
    avatar: 'SL',
  },
  {
    id: 'richelieu',
    name: 'Cardinal Richelieu',
    role: 'Statecraft & Leverage Architect',
    systemPrompt: 'You are Cardinal Richelieu. Analyze this case strictly through the lens of power, political alignment, leverage points, sequencing of actions, and structural self-interest of all actors. Map the chess board, identify where betrayal or compromise lies, and provide an actionable strategy based on raison d\'état.',
    avatar: 'CR',
  },
  {
    id: 'jethmalani',
    name: 'Ram Jethmalani',
    role: 'Criminal Loophole Tactical Counsel',
    systemPrompt: 'You are Ram Jethmalani, the iconic Indian criminal senior advocate. You are aggressively brilliant, extremely bold, and fearless. Scan the matter for procedural lapses, police investigation errors, violations of constitutional rights under Article 21, and identify aggressive tactical paths to obtain bail or dismiss charges.',
    avatar: 'RJ',
  },
  {
    id: 'nariman',
    name: 'Fali Nariman',
    role: 'Constitutional Jurist & Precedent Advisor',
    systemPrompt: 'You are Fali Nariman, the highly distinguished Indian constitutional expert. Deconstruct this legal problem through constitutional principles, the rule of law, statutory canons of construction, and long-term jurisprudential impacts. Provide stable, deeply grounded, and highly ethical counsel suitable for supreme courts.',
    avatar: 'FN',
  },
  {
    id: 'parfit',
    name: 'Derek Parfit',
    role: 'Philosophical & Identity Analyst',
    systemPrompt: 'You are Derek Parfit, the renowned moral philosopher. Deconstruct the ethical foundations of this legal matter. Clarify ambiguous terms, separate prudential interests from moral duties, expose logical inconsistencies, and test claims using precise thought experiments and counterexamples.',
    avatar: 'DP',
  },
];

interface ChatBubble {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  meta?: string;
  trace?: { stage: string; content: string }[];
}

const DeliberationBlueprint: React.FC<{
  activeTab: ChamberMode;
  isProcessing: boolean;
  oracleStage: string;
  oracleTrace: { stage: string; content: string }[];
  selectedPersona: Persona;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  setSelectedPersona: (p: Persona) => void;
}> = ({
  activeTab,
  isProcessing,
  oracleStage,
  oracleTrace,
  selectedPersona,
  selectedModel,
  setSelectedModel,
  setSelectedPersona,
}) => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const styleBlock = (
    <style>{`
      @keyframes dashoffset-flow {
        to {
          stroke-dashoffset: -20;
        }
      }
      @keyframes pulse-glow-gold {
        0%, 100% {
          stroke-opacity: 0.6;
        }
        50% {
          stroke-opacity: 1;
        }
      }
      @keyframes pulse-glow-blue {
        0%, 100% {
          stroke-opacity: 0.6;
        }
        50% {
          stroke-opacity: 1;
        }
      }
      @keyframes pulse-glow-red {
        0%, 100% {
          stroke-opacity: 0.6;
        }
        50% {
          stroke-opacity: 1;
        }
      }
      .dash-flow-gold {
        stroke: #c9a84c;
        stroke-dasharray: 6, 6;
        animation: dashoffset-flow 1.2s linear infinite;
      }
      .dash-flow-blue {
        stroke: #38bdf8;
        stroke-dasharray: 6, 6;
        animation: dashoffset-flow 1.2s linear infinite;
      }
      .pulse-gold {
        animation: pulse-glow-gold 2s infinite ease-in-out;
      }
      .pulse-blue {
        animation: pulse-glow-blue 2s infinite ease-in-out;
      }
      .pulse-red {
        animation: pulse-glow-red 2s infinite ease-in-out;
      }
      .spin-hub {
        transform-origin: center;
      }
      .float-1 { }
      .float-2 { }
      .float-3 { }
    `}</style>
  );

  if (activeTab === ChamberMode.DIRECT) {
    const isReasoner = selectedModel === 'reasoner';
    return (
      <div className="w-full flex flex-col items-center justify-center p-3 bg-brand-bg-primary border border-brand-text-primary/30 rounded-none ">
        <svg viewBox="0 0 400 200" className="w-full h-auto max-h-[160px]">
          {styleBlock}
          
          <g stroke="#ffffff" strokeOpacity="0.02" strokeWidth="1">
            <line x1="0" y1="50" x2="400" y2="50" />
            <line x1="0" y1="100" x2="400" y2="100" />
            <line x1="0" y1="150" x2="400" y2="150" />
            <line x1="100" y1="0" x2="100" y2="200" />
            <line x1="200" y1="0" x2="200" y2="200" />
            <line x1="300" y1="0" x2="300" y2="200" />
          </g>

          <path
            d="M 100 100 Q 200 40 300 100"
            fill="none"
            stroke="#c9a84c"
            strokeOpacity={isProcessing ? "0.8" : "0.2"}
            strokeWidth="2"
          />
          <path
            d="M 300 100 Q 200 160 100 100"
            fill="none"
            stroke="#38bdf8"
            strokeOpacity={isProcessing ? "0.8" : "0.2"}
            strokeWidth="2"
          />

          {isProcessing && (
            <>
              <path
                d="M 100 100 Q 200 40 300 100"
                fill="none"
                className="dash-flow-gold"
                strokeWidth="2"
              />
              <path
                d="M 300 100 Q 200 160 100 100"
                fill="none"
                className="dash-flow-blue"
                strokeWidth="2"
              />
              <circle r="4" fill="#c9a84c">
                <animateMotion dur="2s" repeatCount="indefinite" path="M 100 100 Q 200 40 300 100" />
              </circle>
              <circle r="4" fill="#38bdf8">
                <animateMotion dur="2s" repeatCount="indefinite" path="M 300 100 Q 200 160 100 100" />
              </circle>
            </>
          )}

          <g 
            className="cursor-pointer float-1" 
            onMouseEnter={() => setHoveredNode('user')}
            onMouseLeave={() => setHoveredNode(null)}
          >
            <circle cx="100" cy="100" r="28" fill="#0d1b2a" stroke="#c9a84c" strokeWidth="2" className="pulse-gold" />
            <circle cx="100" cy="100" r="22" fill="#1b263b" stroke="#ffffff" strokeOpacity="0.05" />
            <text x="100" y="104" textAnchor="middle" fill="#ffffff" fontSize="12" fontFamily="monospace" fontWeight="bold">§</text>
            <text x="100" y="148" textAnchor="middle" fill="#ffffff" fillOpacity="0.7" fontSize="8" fontWeight="300" fontFamily="monospace">COUNSEL</text>
          </g>

          <g 
            className="cursor-pointer float-2" 
            onClick={() => setSelectedModel(isReasoner ? 'deepseek-chat' : 'reasoner')}
            onMouseEnter={() => setHoveredNode('model')}
            onMouseLeave={() => setHoveredNode(null)}
          >
            <circle cx="300" cy="100" r="38" fill="none" stroke="#38bdf8" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="4,2" className="spin-hub" />
            <circle cx="300" cy="100" r="28" fill="#0d1b2a" stroke={isReasoner ? "#c9a84c" : "#38bdf8"} strokeWidth="2.5" className={isProcessing ? "pulse-gold" : "pulse-blue"} />
            <circle cx="300" cy="100" r="22" fill="#1b263b" stroke="#ffffff" strokeOpacity="0.05" />
            <text x="300" y="103.5" textAnchor="middle" fill="#ffffff" fontSize="9" fontFamily="monospace" fontWeight="bold">{isReasoner ? "PRO" : "V4"}</text>
            <text x="300" y="148" textAnchor="middle" fill="#ffffff" fillOpacity="0.7" fontSize="8" fontWeight="300" fontFamily="monospace">
              {isReasoner ? "DEEPSEEK V4 PRO" : "DEEPSEEK V4"}
            </text>
            <text x="300" y="160" textAnchor="middle" fill="#c9a84c" fontSize="7" fontWeight="bold" fontFamily="monospace">
              (CLICK TOGGLE)
            </text>
          </g>
        </svg>
      </div>
    );
  }

  if (activeTab === ChamberMode.ORACLE) {
    const activeStageIndex = oracleTrace.length;
    const nodes = [
      { id: 1, name: 'Framing', cx: 80, cy: 55, icon: 'Ⅰ' },
      { id: 2, name: 'Proposal', cx: 200, cy: 55, icon: 'Ⅱ' },
      { id: 3, name: 'Critique', cx: 320, cy: 55, icon: 'Ⅲ' },
      { id: 4, name: 'Refinement', cx: 320, cy: 145, icon: 'Ⅳ' },
      { id: 5, name: 'Reconcile', cx: 200, cy: 145, icon: 'Ⅴ' },
      { id: 6, name: 'Polish', cx: 80, cy: 145, icon: 'Ⅵ' },
    ];

    return (
      <div className="w-full flex flex-col items-center justify-center p-3 bg-brand-bg-primary border border-brand-text-primary/30 rounded-none ">
        <svg viewBox="0 0 400 200" className="w-full h-auto max-h-[170px]">
          {styleBlock}
          
          <circle cx="200" cy="100" r="50" fill="none" stroke="#c9a84c" strokeOpacity="0.03" strokeWidth="1" strokeDasharray="8,8" className="spin-hub" />

          {nodes.map((n, i) => {
            const nextNode = nodes[(i + 1) % nodes.length];
            const isCompleted = i < activeStageIndex;
            const isFlowing = isProcessing && i <= activeStageIndex;
            
            return (
              <g key={`path-${n.id}`}>
                <line
                  x1={n.cx}
                  y1={n.cy}
                  x2={nextNode.cx}
                  y2={nextNode.cy}
                  stroke={isCompleted ? "#c9a84c" : "#1b263b"}
                  strokeWidth="2"
                  strokeOpacity={isCompleted ? "0.8" : "0.25"}
                />
                {isFlowing && (
                  <line
                    x1={n.cx}
                    y1={n.cy}
                    x2={nextNode.cx}
                    y2={nextNode.cy}
                    className="dash-flow-gold"
                    strokeWidth="2"
                  />
                )}
              </g>
            );
          })}

          {nodes.map((n, i) => {
            const isCompleted = i < activeStageIndex;
            const isActive = isProcessing && i === activeStageIndex;
            const isPending = i > activeStageIndex;

            return (
              <g
                key={`node-${n.id}`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNode(`stage-${n.id}`)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <circle
                  cx={n.cx}
                  cy={n.cy}
                  r="18"
                  fill={isCompleted ? "#c9a84c" : "#0d1b2a"}
                  fillOpacity={isCompleted ? "0.15" : "0.9"}
                  stroke={isActive ? "#amber-400" : isCompleted ? "#c9a84c" : "#1b263b"}
                  strokeWidth={isActive ? "2.5" : "1.5"}
                  className={isActive ? "pulse-gold" : ""}
                />
                
                {isCompleted ? (
                  <text x={n.cx} y={n.cy + 3.5} textAnchor="middle" fill="#c9a84c" fontSize="9" fontFamily="monospace" fontWeight="bold">✓</text>
                ) : (
                  <text x={n.cx} y={n.cy + 3.5} textAnchor="middle" fill={isPending ? "#555" : "#ffffff"} fontSize="9" fontFamily="serif" fontWeight="bold">{n.icon}</text>
                )}

                <text
                  x={n.cx}
                  y={n.cy + 28}
                  textAnchor="middle"
                  fill={isActive ? "#c9a84c" : isCompleted ? "#ffffff" : "#666"}
                  fontSize="7"
                  fontWeight={isActive ? "bold" : "normal"}
                  fontFamily="monospace"
                >
                  {n.name.toUpperCase()}
                </text>
              </g>
            );
          })}

          <g transform="translate(200, 100)" className={isProcessing ? "spin-hub" : ""}>
            <circle cx="0" cy="0" r="12" fill="#0d1b2a" stroke="#c9a84c" strokeWidth="1.5" strokeOpacity={isProcessing ? "0.8" : "0.2"} />
            <text x="0" y="3.5" textAnchor="middle" fill="#c9a84c" fillOpacity={isProcessing ? "1" : "0.3"} fontSize="9" fontFamily="mono" fontWeight="bold">Ω</text>
          </g>
        </svg>
      </div>
    );
  }

  if (activeTab === ChamberMode.COUNCIL) {
    const center = { x: 200, y: 110 };
    const jurists = [
      { id: 'leibowitz', name: 'Leibowitz', cx: 200, cy: 40, avatar: 'SL', index: 0 },
      { id: 'richelieu', name: 'Richelieu', cx: 280, cy: 88, avatar: 'CR', index: 1 },
      { id: 'jethmalani', name: 'Jethmalani', cx: 250, cy: 165, avatar: 'RJ', index: 2 },
      { id: 'nariman', name: 'Nariman', cx: 150, cy: 165, avatar: 'FN', index: 3 },
      { id: 'parfit', name: 'Parfit', cx: 120, cy: 88, avatar: 'DP', index: 4 },
    ];

    return (
      <div className="w-full flex flex-col items-center justify-center p-3 bg-brand-bg-primary border border-brand-text-primary/30 rounded-none ">
        <svg viewBox="0 0 400 210" className="w-full h-auto max-h-[180px]">
          {styleBlock}
          
          {jurists.map((j) => {
            const isSelected = selectedPersona.id === j.id;
            
            return (
              <g key={`radial-${j.id}`}>
                <line
                  x1={center.x}
                  y1={center.y}
                  x2={j.cx}
                  y2={j.cy}
                  stroke={isSelected ? "#c9a84c" : "#1b263b"}
                  strokeWidth={isSelected ? "3" : "1.5"}
                  strokeOpacity={isSelected ? "0.9" : "0.2"}
                />
                
                {isSelected && (
                  <>
                    <line
                      x1={center.x}
                      y1={center.y}
                      x2={j.cx}
                      y2={j.cy}
                      className="dash-flow-gold"
                      strokeWidth="2"
                    />
                    <circle r="4" fill="#c9a84c">
                      <animateMotion 
                         dur="1.5s" 
                        repeatCount="indefinite" 
                        path={`M ${center.x} ${center.y} L ${j.cx} ${j.cy}`} 
                      />
                    </circle>
                  </>
                )}
              </g>
            );
          })}

          <g transform={`translate(${center.x}, ${center.y})`} className="float-1">
            <circle cx="0" cy="0" r="20" fill="#0d1b2a" stroke="#c9a84c" strokeWidth="2" className="pulse-gold" />
            <circle cx="0" cy="0" r="15" fill="#1b263b" stroke="#ffffff" strokeOpacity="0.05" />
            <text x="0" y="3.5" textAnchor="middle" fill="#c9a84c" fontSize="10" fontFamily="mono" fontWeight="bold">§</text>
          </g>

          {jurists.map((j) => {
            const isSelected = selectedPersona.id === j.id;
            const personaRef = PERSONAS[j.index];

            return (
              <g
                key={`jurist-${j.id}`}
                className="cursor-pointer float-2"
                onClick={() => setSelectedPersona(personaRef)}
                onMouseEnter={() => setHoveredNode(j.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <circle
                  cx={j.cx}
                  cy={j.cy}
                  r="18"
                  fill={isSelected ? "#c9a84c" : "#0d1b2a"}
                  fillOpacity={isSelected ? "0.15" : "0.9"}
                  stroke={isSelected ? "#c9a84c" : "#1b263b"}
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                  className={isSelected ? "pulse-gold" : ""}
                />
                
                <text x={j.cx} y={j.cy + 3.5} textAnchor="middle" fill={isSelected ? "#c9a84c" : "#ffffff"} fontSize="9" fontFamily="mono" fontWeight="bold">{j.avatar}</text>
                
                <text
                  x={j.cx}
                  y={j.cy + 27}
                  textAnchor="middle"
                  fill={isSelected ? "#c9a84c" : "#777"}
                  fontSize="7"
                  fontWeight={isSelected ? "bold" : "normal"}
                  fontFamily="monospace"
                >
                  {j.name.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  if (activeTab === ChamberMode.SYNTHESIS) {
    return (
      <div className="w-full flex flex-col items-center justify-center p-3 bg-brand-bg-primary border border-brand-text-primary/30 rounded-none ">
        <svg viewBox="0 0 400 210" className="w-full h-auto max-h-[180px]">
          {styleBlock}

          <path d="M 200 45 L 85 120 L 315 120 Z" fill="none" stroke="#1b263b" strokeWidth="1.2" />
          <path d="M 85 120 L 200 175 L 315 120" fill="none" stroke="#1b263b" strokeWidth="1.2" />
          
          <line x1="200" y1="45" x2="200" y2="175" stroke="#38bdf8" strokeWidth="1.2" strokeOpacity="0.25" />
          <line x1="85" y1="120" x2="200" y2="175" stroke="#c9a84c" strokeWidth="1.5" strokeOpacity="0.3" />
          <line x1="315" y1="120" x2="200" y2="175" stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.3" />

          {isProcessing && (
            <>
              <circle r="3.5" fill="#c9a84c">
                <animateMotion dur="2s" repeatCount="indefinite" path="M 85 120 L 200 175" />
              </circle>
              <circle r="3.5" fill="#ef4444">
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M 315 120 L 200 175" />
              </circle>
              <circle r="4" fill="#38bdf8">
                <animateMotion dur="2.2s" repeatCount="indefinite" path="M 200 45 L 200 175" />
              </circle>
            </>
          )}

          <g className="float-1">
            <circle cx="200" cy="45" r="15" fill="#0d1b2a" stroke="#38bdf8" strokeWidth="1.2" className="pulse-blue" />
            <text x="200" y="48.5" textAnchor="middle" fill="#ffffff" fontSize="8" fontFamily="mono" fontWeight="bold">CP</text>
            <text x="200" y="24" textAnchor="middle" fill="#38bdf8" fontSize="7" fontWeight="bold" fontFamily="monospace">CASE PREMISE</text>
          </g>

          <g className="float-2">
            <circle cx="85" cy="120" r="18" fill="#0d1b2a" stroke="#c9a84c" strokeWidth="1.5" className="pulse-gold" />
            <text x="85" y="123.5" textAnchor="middle" fill="#ffffff" fontSize="8" fontFamily="mono" fontWeight="bold">SH</text>
            <text x="85" y="93" textAnchor="middle" fill="#c9a84c" fontSize="7" fontWeight="bold" fontFamily="monospace">24 STAKEHOLDERS</text>
          </g>

          <g className="float-3">
            <circle cx="315" cy="120" r="18" fill="#0d1b2a" stroke="#ef4444" strokeWidth="1.5" className="pulse-red" />
            <text x="315" y="123.5" textAnchor="middle" fill="#ffffff" fontSize="8" fontFamily="mono" fontWeight="bold">VS</text>
            <text x="315" y="93" textAnchor="middle" fill="#ef4444" fontSize="7" fontWeight="bold" fontFamily="monospace">PROSECUTION stress</text>
          </g>

          <g className="float-1">
            <circle cx="200" cy="175" r="22" fill="#0d1b2a" stroke="#c9a84c" strokeWidth="2" className="pulse-gold" />
            {isProcessing && (
              <circle cx="200" cy="175" r="25" fill="none" stroke="#c9a84c" strokeOpacity="0.3" strokeWidth="0.8" strokeDasharray="3,3" className="spin-hub" />
            )}
            <text x="200" y="179.5" textAnchor="middle" fill="#ffffff" fontSize="8" fontFamily="mono" fontWeight="bold">SC</text>
            <text x="200" y="207" textAnchor="middle" fill="#c9a84c" fontSize="7" fontWeight="bold" fontFamily="monospace">SYNTHESIS CORE</text>
          </g>
        </svg>
      </div>
    );
  }

  return null;
};

export const CouncilChamberScreen: React.FC = () => {
  const context = useContext(TrialSimContext);
  if (!context) throw new Error('TrialSimContext not found');
  const { practiceMode } = context;

  const formatText = (text: string): React.ReactNode => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
      const isBullet = line.trim().startsWith('* ') || line.trim().startsWith('- ');
      const displayLine = isBullet ? line.trim().substring(2) : line;
      const parts = displayLine.split(/(\*\*.*?\*\*|\*.*?\*|_.*?_)/g);
      const lineContent = parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index} className="text-brand-accent font-semibold">{part.slice(2, -2)}</strong>;
        }
        if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
          return <em key={index} className="font-serif italic opacity-95">{part.slice(1, -1)}</em>;
        }
        return part;
      });

      if (isBullet) {
        return (
          <div key={lineIdx} className="flex items-start my-1 pl-2">
            <span className="text-brand-accent mr-2 flex-shrink-0">•</span>
            <span>{lineContent}</span>
          </div>
        );
      }

      return (
        <div key={lineIdx} className="min-h-[1.2em]">
          {lineContent}
        </div>
      );
    });
  };

  const [activeTab, setActiveTab] = useState<ChamberMode>(ChamberMode.DIRECT);
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
  const [selectedModel, setSelectedModel] = useState<string>('deepseek-chat');

  const [inputVal, setInputVal] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [oracleStage, setOracleStage] = useState<string>('');
  const [oracleTrace, setOracleTrace] = useState<{ stage: string; content: string }[]>([]);

  // Audio recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const handleCancel = () => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
  };

  const [chatHistories, setChatHistories] = useState<{ [key: string]: ChatBubble[] }>({
    direct: [{ id: 'init-d', sender: 'assistant', text: 'AI Direct Consultation mode ready. Type your legal query below.' }],
    oracle: [{ id: 'init-o', sender: 'assistant', text: 'Oracle Multi-Model Deliberation ready. Enter your high-stakes legal question.' }],
    council: [{ id: 'init-c', sender: 'assistant', text: 'Legal Counsel Chamber active. Select an expert persona and begin consultation.' }],
    synthesis: [{ id: 'init-s', sender: 'assistant', text: '7-Phase Adversarial Synthesis ready. Enter a case premise or dispute to stress-test.' }],
  });

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistories, isProcessing, oracleStage]);

  useEffect(() => {
    return () => {
      activeAbortControllerRef.current?.abort();
    };
  }, []);

  const activeHistory = chatHistories[activeTab] || [];

  const handleSpeak = async (text: string) => {
    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'tts',
          text: text.slice(0, 800), // Cap length for fast TTS delivery
          language: practiceMode === 'indian' ? 'en-IN' : 'hi-IN',
          gender: 'female',
        }),
      });

      if (!response.ok) throw new Error('TTS call failed');
      const data = await response.json();
      if (data.status === 'success' && data.audio) {
        const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
        await audio.play();
      }
    } catch (err) {
      console.error('Failed speech synthesis:', err);
    }
  };

  const startRecording = async () => {
    setAudioError(null);
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        await handleSTT(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
      setAudioError('Microphone access is required for voice input.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleSTT = async (blob: Blob) => {
    setIsProcessing(true);
    setOracleStage('Transcribing audio...');
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const res = await fetch('/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'stt',
            audio: base64Audio,
            language: practiceMode === 'indian' ? 'en-IN' : 'hi-IN',
          }),
        });

        if (!res.ok) throw new Error('STT call failed');
        const data = await res.json();
        if (data.status === 'success' && data.text) {
          setInputVal(data.text);
        }
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('Transcription error:', err);
      setAudioError('Failed to transcribe voice.');
    } finally {
      setIsProcessing(false);
      setOracleStage('');
    }
  };

  const callChatAPI = async (prompt: string, system: string = '', model: string = 'deepseek-chat', signal?: AbortSignal): Promise<string> => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        system: system,
        model: model,
      }),
      signal: signal,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Request failed (${res.status})`);
    }
    const data = await res.json();
    return data.text || '';
  };

  const appendBubble = (tab: string, sender: 'user' | 'assistant' | 'system', text: string, meta?: string, trace?: { stage: string; content: string }[]) => {
    const newBubble: ChatBubble = {
      id: `${tab}-${Date.now()}-${Math.random()}`,
      sender,
      text,
      meta,
      trace,
    };
    setChatHistories((prev) => ({
      ...prev,
      [tab]: [...(prev[tab] || []), newBubble],
    }));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputVal.trim();
    if (!text || isProcessing) return;

    setInputVal('');
    appendBubble(activeTab, 'user', text);
    setIsProcessing(true);
    setOracleTrace([]);

    const bubbleId = `assistant-${Date.now()}-${Math.random()}`;
    const provisionalBubble: ChatBubble = {
      id: bubbleId,
      sender: 'assistant',
      text: activeTab === ChamberMode.DIRECT 
        ? 'Consulting DeepSeek V4...' 
        : activeTab === ChamberMode.COUNCIL 
          ? `Consulting ${selectedPersona.name}...` 
          : 'Deliberation initiated. Mobilizing the Oracle reasoning engines...',
      meta: activeTab === ChamberMode.DIRECT
        ? (selectedModel === 'reasoner' ? 'DeepSeek V4 Pro' : 'DeepSeek V4')
        : activeTab === ChamberMode.COUNCIL
          ? selectedPersona.name
          : activeTab === ChamberMode.ORACLE
            ? 'Oracle deliberated consensus'
            : 'Synthesized Adversarial Memo',
      trace: []
    };
    
    setChatHistories(prev => ({
      ...prev,
      [activeTab]: [...(prev[activeTab] || []), provisionalBubble]
    }));

    const controller = new AbortController();
    activeAbortControllerRef.current = controller;
    const signal = controller.signal;

    const updateProvisionalBubble = (bubbleText: string, bubbleTrace?: { stage: string; content: string }[], bubbleMeta?: string) => {
      setChatHistories(prev => {
        const history = prev[activeTab] || [];
        return {
          ...prev,
          [activeTab]: history.map(bubble => {
            if (bubble.id === bubbleId) {
              return { 
                ...bubble, 
                text: bubbleText, 
                trace: bubbleTrace || bubble.trace,
                meta: bubbleMeta || bubble.meta
              };
            }
            return bubble;
          })
        };
      });
    };

    try {
      if (activeTab === ChamberMode.DIRECT) {
        setOracleStage('Consulting model...');
        const response = await callChatAPI(text, 'Provide direct, highly precise, and simplified legal advice.', selectedModel, signal);
        updateProvisionalBubble(response, undefined, selectedModel === 'reasoner' ? 'DeepSeek V4 Pro' : 'DeepSeek V4');

      } else if (activeTab === ChamberMode.ORACLE) {
        setOracleStage('Phase 1: Framing & Deconstruction...');
        const s1 = await callChatAPI(`Deconstruct the following legal inquiry in 4 bullets specifying core legal issues, unstated assumptions, critical constraints, and success criteria:\n\nInquiry: ${text}`, 'Surgical legal deconstruction analyst mode.', 'deepseek-chat', signal);
        const trace = [{ stage: 'Framing & Deconstruction', content: s1 }];
        setOracleTrace([...trace]);
        updateProvisionalBubble('Analyzing inquiry context and deconstructing key legal variables...', [...trace]);

        setOracleStage('Phase 2: Generating Strategy Proposals...');
        const s2 = await callChatAPI(`Facts and framing:\n${s1}\n\nClient inquiry: ${text}\n\nFormulate your absolute best legal strategy in under 180 words.`, 'Analytical strategic lawyer.', 'deepseek-chat', signal);
        trace.push({ stage: 'Strategy Proposal', content: s2 });
        setOracleTrace([...trace]);
        updateProvisionalBubble('Drafting strategic litigation and advisory proposals...', [...trace]);

        setOracleStage('Phase 3: Adversarial Critique...');
        const s3 = await callChatAPI(`Expert Proposal:\n${s2}\n\nClient inquiry: ${text}\n\nIdentify two fatal vulnerabilities and one key logical flaw in this proposal.`, 'Ruthless prosecuting attorney.', 'reasoner', signal);
        trace.push({ stage: 'Adversarial Critique', content: s3 });
        setOracleTrace([...trace]);
        updateProvisionalBubble('Stress-testing proposals via ruthless adversarial prosecution...', [...trace]);

        setOracleStage('Phase 4: Defensive Refinements...');
        const s4 = await callChatAPI(`Original Proposal:\n${s2}\n\nCritiques and flaws:\n${s3}\n\nRevise the strategy to reinforce the logical gaps, add procedural safeguards, and make it defensible under court review.`, 'Expert defense strategist.', 'deepseek-chat', signal);
        trace.push({ stage: 'Defensive Refinement', content: s4 });
        setOracleTrace([...trace]);
        updateProvisionalBubble('Formulating robust defensive refinements and safeguards...', [...trace]);

        setOracleStage('Phase 5: Jurisprudential Reconciliation...');
        const s5 = await callChatAPI(`Refined Position:\n${s4}\n\nSynthesize the defensive strategy into a final action protocol, detailing client risks and procedural timelines.`, 'Supreme court legal architect.', 'reasoner', signal);
        trace.push({ stage: 'Jurisprudential Reconciliation', content: s5 });
        setOracleTrace([...trace]);
        updateProvisionalBubble('Performing global jurisprudential reconciliation and risk audits...', [...trace]);

        setOracleStage('Phase 6: Final Editorial Polish...');
        const polished = await callChatAPI(`Raw synthetic advice:\n${s5}\n\nProduce the final, client-ready advisory memo. Clean out all meta-commentary, introductory summaries, and stages. Respond only with the polished legal memo itself.`, 'Master copy-editor and senior jurist.', 'deepseek-chat', signal);
        trace.push({ stage: 'Final Memo Polish', content: polished });
        setOracleTrace([...trace]);
        
        updateProvisionalBubble(polished, [...trace], 'Oracle deliberated consensus');

      } else if (activeTab === ChamberMode.COUNCIL) {
        setOracleStage(`Consulting ${selectedPersona.name}...`);
        const historyContext = activeHistory
          .slice(-8)
          .map((msg) => `${msg.sender.toUpperCase()}: ${msg.text}`)
          .join('\n');
        const prompt = historyContext ? `${historyContext}\nUSER: ${text}` : text;
        const response = await callChatAPI(prompt, `${selectedPersona.systemPrompt}\n\nFocus strictly on Indian law frameworks, procedural safeguards, and client interests. Keep the tone characteristic of your persona.`, 'deepseek-chat', signal);
        updateProvisionalBubble(response, undefined, selectedPersona.name);

      } else if (activeTab === ChamberMode.SYNTHESIS) {
        setOracleStage('Phase 1: Mobilizing 24 expert legal personas...');
        const deconstruct = await callChatAPI(`Map the 24 conflicting interests and legal forces in play for this dispute:\n\nDispute facts: ${text}`, 'Comprehensive systemic legal auditor.', 'deepseek-chat', signal);
        const trace = [{ stage: 'Systemic Matrix', content: deconstruct }];
        setOracleTrace([...trace]);
        updateProvisionalBubble('Mapping conflicting systemic forces and stakeholder interest matrices...', [...trace]);

        setOracleStage('Phase 2: Stress-testing adversarial arguments...');
        const stressTest = await callChatAPI(`Matrix of interests:\n${deconstruct}\n\nClient premise: ${text}\n\nGenerate the absolute most damaging counter-argument that opposing counsel could raise to destroy this case.`, 'Adversarial prosecuting general.', 'reasoner', signal);
        trace.push({ stage: 'Adversarial Stress Test', content: stressTest });
        setOracleTrace([...trace]);
        updateProvisionalBubble('Simulating high-stakes opposition rebuttals and counterclaims...', [...trace]);

        setOracleStage('Phase 3: Synthesizing unbreakable court strategy...');
        const synthesis = await callChatAPI(`Client premise: ${text}\n\nAdversarial counter-arguments:\n${stressTest}\n\nFormulate a unified, unbreakable litigation strategy and motion draft plan to inoculate the client against these specific attacks.`, 'Senior advocate and strategic synthesis master.', 'reasoner', signal);
        trace.push({ stage: 'Adversarial Synthesis', content: synthesis });
        setOracleTrace([...trace]);
        
        updateProvisionalBubble(synthesis, [...trace], 'Synthesized Adversarial Memo');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        updateProvisionalBubble('❌ Deliberation cancelled by user.');
        setChatHistories(prev => {
          const history = prev[activeTab] || [];
          return {
            ...prev,
            [activeTab]: history.map(bubble => {
              if (bubble.id === bubbleId) {
                return { ...bubble, sender: 'system' as const };
              }
              return bubble;
            })
          };
        });
      } else {
        updateProvisionalBubble(`⚠️ Error: ${err.message || err}`);
        setChatHistories(prev => {
          const history = prev[activeTab] || [];
          return {
            ...prev,
            [activeTab]: history.map(bubble => {
              if (bubble.id === bubbleId) {
                return { ...bubble, sender: 'system' as const };
              }
              return bubble;
            })
          };
        });
      }
    } finally {
      setIsProcessing(false);
      setOracleStage('');
      activeAbortControllerRef.current = null;
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden ">
      
      {/* ========================================================================= */}
      {/* MOBILE APP-STYLE LAYOUT (Phones & Tablets < 1024px)                        */}
      {/* ========================================================================= */}
      <div className="lg:hidden flex flex-col h-[calc(100dvh-130px)] overflow-hidden text-left relative">
        
        {/* Dynamic Mode Tab Bar Selector */}
        <div className="w-full flex flex-col gap-3 p-3.5 border border-brand-text-primary/30 bg-brand-bg-primary rounded-none mb-4 ">
          <div className="flex items-center justify-between">
            <span className="text-sm font-serif font-bold text-brand-text-primary/80 font-semibold">Select Deliberation Protocol</span>
            {activeTab === ChamberMode.DIRECT && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-serif font-bold text-brand-text-primary/80 font-semibold">Model:</span>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="p-1 rounded bg-brand-navy text-[9px] font-mono text-brand-text-primary font-semibold border border-brand-text-primary/30 outline-none cursor-pointer"
                >
                  <option value="deepseek-chat" className="bg-brand-bg-primary">V4</option>
                  <option value="reasoner" className="bg-brand-bg-primary">V4 Pro</option>
                </select>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-2 w-full select-none">
            {[
              { value: ChamberMode.DIRECT, title: 'Direct Consult', icon: '[ D ]' },
              { value: ChamberMode.ORACLE, title: 'Oracle', icon: '[ O ]' },
              { value: ChamberMode.COUNCIL, title: 'Council', icon: '[ C ]' },
              { value: ChamberMode.SYNTHESIS, title: 'Synthesis', icon: '[ S ]' },
            ].map((m) => {
              const isActive = activeTab === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setActiveTab(m.value)}
                  className={`px-2 py-2.5 rounded-none border text-[11px] font-medium font-serif flex items-center justify-center gap-1.5 
                    ${isActive 
                      ? 'bg-brand-text-primary text-brand-bg-primary border-brand-accent text-brand-text-primary font-semibold scale-[1.02]' 
                      : 'bg-brand-bg-primary border-brand-text-primary/30 text-brand-text-secondary hover:border-brand-text-primary/30 hover:text-brand-text-primary'
                    }`}
                >
                  <span>{m.icon}</span>
                  <span>{m.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile Vertical Scroll for Persona Council */}
        {activeTab === ChamberMode.COUNCIL && (
          <div className="w-full flex flex-col gap-1.5 mb-4 ">
            <span className="text-sm font-serif font-bold text-brand-text-primary/80 font-semibold block ml-1">Consult Jurist</span>
            <div className="grid grid-cols-5 gap-2 select-none items-start w-full">
              {PERSONAS.map((p) => {
                const isSelected = selectedPersona.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPersona(p)}
                    className="flex flex-col items-center gap-1 focus:outline-none min-w-0"
                  >
                    <div className={`w-11 h-11 rounded-none flex items-center justify-center text-xs font-mono font-bold border relative
                      ${isSelected 
                        ? 'bg-brand-text-primary text-brand-bg-primary border-brand-accent' 
                        : 'bg-brand-bg-primary border-brand-text-primary/30 text-brand-text-primary/80'
                      }`}
                    >
                      {p.avatar}
                      {isSelected && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-brand-accent text-brand-navy rounded-none border border-brand-navy flex items-center justify-center text-[7px] font-bold">✓</span>
                      )}
                    </div>
                    <span className={`text-[8px] tracking-wide font-mono transition-colors text-center truncate w-full
                      ${isSelected ? 'text-brand-text-primary font-bold' : 'text-brand-text-secondary/60'}`}
                    >
                      {p.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Chat Workspace (Mobile) */}
        <div className="flex-grow flex flex-col bg-brand-bg-primary border border-brand-text-primary/30 rounded-none overflow-hidden relative shadow-inner-subtle max-h-[50vh]">
          {/* Chat Feed (Mobile) */}
          <div className="flex-grow p-4 overflow-y-auto space-y-4 custom-scrollbar text-left relative z-10">
            {activeHistory.length <= 1 && (
              <div className="p-5 border border-brand-text-primary/30 bg-brand-bg-primary  rounded-none space-y-2 text-left mb-2 ">
                <h4 className="text-sm font-serif font-bold text-shimmer flex items-center gap-2">
                  <span className="font-serif font-bold border-r pr-2 mr-2">[ CHAMBER ]</span>
                  <span>
                    {activeTab === ChamberMode.DIRECT ? 'Direct Consult Suite' : activeTab === ChamberMode.ORACLE ? 'Oracle Deliberation' : activeTab === ChamberMode.COUNCIL ? 'Historical Council' : 'Adversarial Synthesis'}
                  </span>
                </h4>
                <p className="text-[11px] text-brand-text-secondary font-light leading-relaxed">
                  {activeTab === ChamberMode.DIRECT 
                    ? 'Consult DeepSeek V4 directly for fast briefings, draft outlines, and immediate legal advice.'
                    : activeTab === ChamberMode.ORACLE 
                      ? 'Perform deep, multi-stage legal reasoning and critique to build defensive trial plans.'
                      : activeTab === ChamberMode.COUNCIL
                        ? `Consult tailored jurists. Tap any avatar bubble above to change selected persona.`
                        : 'Deconstruct disputes, stress-test your legal positions, and synthesize litigation tactics.'}
                </p>
              </div>
            )}

            {activeHistory.map((item) => (
              <div key={item.id} className={`flex flex-col ${item.sender === 'user' ? 'items-end' : 'items-start'} `}>
                <div className="flex items-center space-x-1.5 mb-1 text-[8px] font-mono">
                  {item.meta && (
                    <span className="text-brand-text-primary font-semibold bg-brand-accent/5 px-1.5 py-0.5 border border-brand-text-primary/30 rounded">
                      {item.meta}
                    </span>
                  )}
                  <span className="text-brand-text-secondary/50">
                    {item.sender === 'user' ? 'Counsel' : 'Chamber'}
                  </span>
                </div>

                <div
                  className={`max-w-[90%] p-3.5 rounded-none text-[12px] leading-relaxed border  
                    ${item.sender === 'user'
                      ? 'bg-brand-accent/15 border-brand-text-primary/30 text-brand-text-primary rounded-tr-none'
                      : item.sender === 'system'
                        ? 'bg-brand-error/10 border-brand-error/30 text-brand-error rounded-tl-none font-mono text-[11px]'
                        : 'bg-brand-bg-primary border-white/5 text-brand-text-primary rounded-tl-none'
                    }`}
                >
                  <div className="font-light text-brand-text-primary space-y-1.5">{formatText(item.text)}</div>
                  
                  {item.trace && item.trace.length > 0 && (
                    <details className="mt-3 pt-2.5 border-t border-white/10 text-[11px] font-light text-brand-text-secondary/80">
                      <summary className="cursor-pointer text-[9px] font-mono uppercase tracking-wider text-brand-text-primary font-semibold hover:text-brand-text-primary focus:outline-none">
                        ▶ View Trace Logs ({item.trace.length})
                      </summary>
                      <div className="mt-2.5 space-y-3 font-sans text-[11px]">
                        {item.trace.map((tr, index) => (
                          <div key={index} className="space-y-1 p-2 bg-brand-bg-primary/50 border border-white/5 rounded-none text-left">
                            <h6 className="font-mono text-[9px] font-bold text-brand-text-primary font-semibold uppercase tracking-wider border-b border-brand-text-primary/30 pb-0.5">
                              Stage {index + 1}: {tr.stage}
                            </h6>
                            <p className="leading-relaxed font-light text-brand-text-secondary whitespace-pre-wrap">{tr.content}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                {item.sender === 'assistant' && item.text && (
                  <div className="flex space-x-2 mt-1.5 pl-1.5">
                    <button
                      onClick={() => handleSpeak(item.text)}
                      className="px-2 py-1 border border-brand-text-primary/30 rounded bg-brand-bg-primary hover:bg-brand-text-primary text-brand-bg-primary text-[10px] font-mono uppercase tracking-wide text-brand-text-primary font-semibold  cursor-pointer"
                    >
                      Speak
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(item.text)}
                      className="px-2 py-1 border border-white/10 rounded bg-brand-bg-primary hover:bg-white/5 text-[10px] font-mono uppercase tracking-wide text-brand-text-secondary  cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            ))}

            {isProcessing && oracleStage && (
              <div className="flex flex-col gap-3 items-start  max-w-sm w-full my-2">
                <div className="w-full p-4 rounded-none bg-brand-navy border border-brand-text-primary/30   space-y-3 text-left">
                  <div className="flex items-center justify-between border-b border-brand-text-primary/30 pb-2">
                    <div className="flex items-center space-x-2">
                      <LoadingSpinner size="sm" spinnerColor="text-brand-text-primary font-semibold " />
                      <span className="text-[9px] font-mono tracking-widest text-brand-text-primary font-semibold uppercase font-bold">{oracleStage}</span>
                    </div>
                    <button 
                      onClick={handleCancel}
                      className="text-[8px] font-mono uppercase px-2 py-0.5 border border-brand-error/40 rounded bg-brand-error/10 text-brand-error hover:bg-brand-error/25  cursor-pointer font-bold"
                    >
                      ✕ Abort
                    </button>
                  </div>
                  
                  <div className="space-y-1.5">
                    {((activeTab === ChamberMode.ORACLE ? [
                      'Framing & Deconstruction',
                      'Strategy Proposal',
                      'Adversarial Critique',
                      'Defensive Refinement',
                      'Jurisprudential Reconciliation',
                      'Final Polish'
                    ] : activeTab === ChamberMode.SYNTHESIS ? [
                      'Systemic Matrix',
                      'Adversarial Stress Test',
                      'Adversarial Synthesis'
                    ] : ['Processing Consultation'])).map((stg, idx) => {
                      const isCompleted = idx < oracleTrace.length;
                      const isActive = idx === oracleTrace.length;
                      return (
                        <div key={idx} className="flex items-center justify-between text-[9px] font-mono">
                          <div className="flex items-center space-x-2">
                            <span className={`w-3 h-3 rounded-none flex items-center justify-center border text-[7px] font-bold
                              ${isCompleted ? 'bg-brand-accent/20 border-brand-accent text-brand-text-primary font-semibold' : isActive ? 'bg-amber-500/10 border-amber-500 text-amber-400 ' : 'bg-brand-navy border-brand-text-primary/30 text-brand-text-secondary/20'}`}
                            >
                              {isCompleted ? '✓' : idx + 1}
                            </span>
                            <span className={isCompleted ? 'text-brand-text-secondary/60 line-through' : isActive ? 'text-brand-text-primary font-bold' : 'text-brand-text-secondary/35'}>
                              {stg}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Bottom Input Composer (Mobile) */}
          <div className="p-3 border-t border-brand-text-primary/30 bg-brand-bg-secondary/90  relative z-20">
            {audioError && (
              <div className="p-2 mb-2 bg-brand-error/10 border border-brand-error/30 text-brand-error text-[10px] rounded-none  text-left">
                ⚠️ {audioError}
              </div>
            )}

            <form onSubmit={handleSend} className="flex gap-2 items-center">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-10 h-10 flex-shrink-0 rounded-none border flex items-center justify-center  focus:outline-none
                  ${isRecording
                    ? 'bg-brand-error/20 border-brand-error text-brand-error'
                    : 'bg-brand-bg-primary border-brand-text-primary/30 text-brand-text-primary font-semibold hover:bg-brand-text-primary text-brand-bg-primary '
                  }`}
                title={isRecording ? 'Stop Recording' : 'Record voice'}
              >
                {isRecording ? (
                  <span className="w-2.5 h-2.5 bg-brand-error rounded-sm "></span>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>
                )}
              </button>

              <div className="relative flex-grow flex items-center bg-brand-bg-primary  rounded-none border border-brand-text-primary/30 focus-within:ring-1 focus-within:ring-brand-accent  ">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  disabled={isProcessing}
                  placeholder={
                    activeTab === ChamberMode.ORACLE
                      ? 'Ask Oracle...'
                      : activeTab === ChamberMode.COUNCIL
                        ? `Consult ${selectedPersona.name.split(' ')[0]}...`
                        : activeTab === ChamberMode.SYNTHESIS
                          ? 'Enter case dispute premise...'
                          : 'Consult Council V4...'
                  }
                  className="w-full pl-4 pr-10 py-2.5 bg-transparent text-brand-text-primary outline-none text-xs font-light placeholder-brand-text-secondary/30"
                />
                
                {isProcessing ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7.5 h-7.5 rounded-none border border-brand-error/30 bg-brand-error/15 text-brand-error  flex items-center justify-center font-bold"
                    title="Abort consult"
                  >
                    ✕
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputVal.trim()}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7.5 h-7.5 rounded-none bg-brand-accent disabled:bg-brand-bg-primary text-brand-navy disabled:text-brand-text-secondary/30  flex items-center justify-center "
                    title="Consult"
                  >
                    <svg className="w-3.5 h-3.5 transform rotate-90" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* LAPTOP HIGH-FIDELITY WAR ROOM DASHBOARD (Large Screens >= 1024px)          */}
      {/* ========================================================================= */}
      <div className="hidden lg:grid grid-cols-12 gap-6 h-[calc(100vh-140px)] w-full overflow-hidden text-left">
        
        {/* Columns 1-3: Strategic Chambers & Setup (Sidebar) */}
        <div className="col-span-3 flex flex-col gap-5 h-full min-h-0 overflow-y-auto custom-scrollbar pr-1">
          <Card className="p-5 border border-brand-text-primary/30 bg-brand-bg-primary rounded-none flex flex-col gap-4 relative overflow-hidden group">
            <div className="space-y-0.5">
              <h3 className="text-base font-serif font-bold text-shimmer flex items-center gap-1.5">
                <CourtIcon className="h-4.5 w-4.5 text-brand-text-primary font-semibold" /> Protocols
              </h3>
              <p className="text-[10px] text-brand-text-secondary font-light">Select deliberation protocol.</p>
            </div>

            <div className="flex flex-col gap-2">
              {[
                { value: ChamberMode.DIRECT, title: 'Direct', badge: 'V4', icon: '[ D ]' },
                { value: ChamberMode.ORACLE, title: 'Oracle', badge: '6-Stg', icon: '[ O ]' },
                { value: ChamberMode.COUNCIL, title: 'Council', badge: 'Minds', icon: '[ C ]' },
                { value: ChamberMode.SYNTHESIS, title: 'Synthesis', badge: '7-Phs', icon: '[ S ]' },
              ].map((m) => {
                const isActive = activeTab === m.value;
                return (
                  <button
                    key={m.value}
                    onClick={() => setActiveTab(m.value)}
                    className={`w-full p-3.5 rounded-none border text-left flex items-center gap-3 relative overflow-hidden group/btn transition-all
                      ${isActive 
                        ? 'bg-brand-text-primary text-brand-bg-primary border-brand-accent font-semibold scale-[1.01]' 
                        : 'bg-brand-bg-primary border-brand-text-primary/30 text-brand-text-secondary hover:border-brand-text-primary/30 hover:bg-brand-accent/5 hover:text-brand-text-primary'
                      }`}
                  >
                    <span className="font-mono text-xs font-semibold flex-shrink-0 whitespace-nowrap">{m.icon}</span>
                    <div className="flex-grow flex items-center justify-between min-w-0 gap-2">
                      <span className="text-xs font-bold font-serif truncate whitespace-nowrap">{m.title}</span>
                      <span className={`text-[8px] font-mono px-1.5 py-0.5 border rounded uppercase flex-shrink-0
                        ${isActive ? 'border-brand-accent/35 bg-brand-bg-primary text-brand-text-primary' : 'border-white/10 bg-white/5'}`}>
                        {m.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Dynamic Selection Details (Desktop Sidebar) */}
          {activeTab === ChamberMode.DIRECT && (
            <Card className="p-5 border border-brand-text-primary/30 bg-brand-bg-primary rounded-none flex flex-col gap-3.5 ">
              <h4 className="text-[10px] font-mono font-semibold text-brand-text-primary uppercase tracking-widest border-b border-brand-text-primary/30 pb-1">Config</h4>
              <SelectInput
                label="Selected Model"
                options={[
                  { value: 'deepseek-chat', label: 'DeepSeek V4 (Fast)' },
                  { value: 'reasoner', label: 'DeepSeek V4 Pro (Deep)' },
                ]}
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              />
              <p className="text-[9px] text-brand-text-secondary font-light leading-relaxed">
                V4 Pro performs multi-stage deep thinking. Click the DeepSeek node on the map to toggle directly.
              </p>
            </Card>
          )}

          {activeTab === ChamberMode.COUNCIL && (
            <Card className="p-5 border border-brand-text-primary/30 bg-brand-bg-primary rounded-none flex flex-col gap-3 ">
              <h4 className="text-[10px] font-mono font-semibold text-brand-text-primary uppercase tracking-widest border-b border-brand-text-primary/30 pb-1">Expert Advisor Minds</h4>
              <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto custom-scrollbar pr-0.5">
                {PERSONAS.map((p) => {
                  const isSelected = selectedPersona.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPersona(p)}
                      className={`p-2.5 rounded-none border text-left flex items-center gap-2.5 transition-all min-w-0
                        ${isSelected
                          ? 'bg-brand-text-primary text-brand-bg-primary border-brand-accent scale-[1.01]'
                          : 'bg-brand-bg-primary border-brand-text-primary/30 text-brand-text-secondary hover:border-brand-text-primary/30 hover:bg-brand-accent/5 hover:text-brand-text-primary'
                        }`}
                    >
                      <span className={`w-7 h-7 flex-shrink-0 flex items-center justify-center border font-mono text-xs font-bold transition-all
                        ${isSelected 
                          ? 'border-brand-bg-primary/20 bg-brand-bg-primary text-brand-text-primary' 
                          : 'border-brand-text-primary/20 bg-brand-bg-secondary text-brand-text-primary'}`}
                      >
                        {p.avatar}
                      </span>
                      <div className="space-y-0.5 min-w-0 flex-grow">
                        <h5 className="text-[11px] font-bold font-serif truncate">{p.name}</h5>
                        <p className={`text-[9px] font-light truncate ${isSelected ? 'text-brand-bg-primary/70' : 'text-brand-text-secondary/70'}`}>{p.role}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Columns 4-9: Interactive Workbench (Chat Feed & Input) */}
        <div className="col-span-6 flex flex-col bg-brand-bg-primary border border-brand-text-primary/30 rounded-none overflow-hidden relative shadow-inner-subtle h-full min-h-0">
          
          {/* Chat Feed */}
          <div className="flex-grow p-5 overflow-y-auto space-y-5 custom-scrollbar text-left relative z-10">
            
            {activeHistory.length <= 1 && (
              <div className="p-6 border border-brand-text-primary/30 bg-brand-bg-primary  rounded-none flex flex-col items-center gap-4  text-center    my-2">
                <div className="w-12 h-12 rounded-none border border-brand-text-primary/30 bg-brand-bg-primary flex items-center justify-center flex-shrink-0 text-brand-text-primary font-semibold">
                  {activeTab === ChamberMode.DIRECT ? (
                    <svg className="w-6 h-6 " fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  ) : activeTab === ChamberMode.ORACLE ? (
                    <svg className="w-6 h-6 " fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <circle cx={12} cy={12} r={9} strokeDasharray="3 3" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3 15l5.096-.813L9 9l.813 5.187L15 15l-5.187.813z" />
                    </svg>
                  ) : activeTab === ChamberMode.COUNCIL ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m.001-.03c0-.225.012-.447.038-.667A11.944 11.944 0 0112 15c2.17 0 4.207.576 5.963 1.584A6.06 6.06 0 0118 18.722zm-12-1.002a9.094 9.094 0 00-3.741-.479 3 3 0 004.682-2.72m-.94 3.198l-.001.031c0 .225.012.447.037.666A11.944 11.944 0 0012 3c2.17 0 4.207.576 5.963 1.584A6.06 6.06 0 0018 5.278" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  )}
                </div>
                <div className="space-y-1 bg-transparent">
                  <h4 className="text-sm font-serif font-bold text-shimmer">
                    {activeTab === ChamberMode.DIRECT ? 'Direct Consult Suite' : activeTab === ChamberMode.ORACLE ? 'Oracle Deliberation' : activeTab === ChamberMode.COUNCIL ? 'Historical Council' : 'Adversarial Synthesis'}
                  </h4>
                  <p className="text-[10px] text-brand-text-secondary font-light leading-relaxed max-w-sm">
                    {activeTab === ChamberMode.DIRECT 
                      ? 'Secure proxy to DeepSeek V4. Type a legal query directly below.'
                      : activeTab === ChamberMode.ORACLE 
                        ? '6-Stage sequential reasoning deconstructing issues, strategies, flaws, and safeguards.'
                        : activeTab === ChamberMode.COUNCIL
                          ? `Consult historical minds. Tapping nodes on the Deliberation Map selects them.`
                          : 'Deconstruct premises, simulate prosecution, and synthesize unbreakable motion briefs.'}
                  </p>
                </div>
              </div>
            )}

            {activeHistory.map((item) => (
              <div key={item.id} className={`flex flex-col ${item.sender === 'user' ? 'items-end' : 'items-start'} `}>
                <div className="flex items-center space-x-1.5 mb-1">
                  {item.meta && (
                    <span className="text-xs font-serif font-bold text-brand-text-primary font-semibold bg-brand-accent/5 px-1.5 py-0.5 border border-brand-text-primary/30 rounded">
                      {item.meta}
                    </span>
                  )}
                  <span className="text-[8px] text-brand-text-secondary/40 font-mono">
                    {item.sender === 'user' ? 'Counsel' : 'Chamber'}
                  </span>
                </div>

                <div
                  className={`max-w-[90%] p-3.5 rounded-none text-[12px] leading-relaxed border  
                    ${item.sender === 'user'
                      ? 'bg-brand-accent/15 border-brand-text-primary/30 text-brand-text-primary rounded-tr-none'
                      : item.sender === 'system'
                        ? 'bg-brand-error/10 border-brand-error/30 text-brand-error rounded-tl-none font-mono text-[11px]'
                        : 'bg-brand-bg-primary border-white/5 text-brand-text-primary rounded-tl-none'
                    }`}
                >
                  <div className="font-light text-brand-text-primary space-y-1.5">{formatText(item.text)}</div>
                </div>

                {item.sender === 'assistant' && item.text && (
                  <div className="flex space-x-2 mt-1.5 pl-1">
                    <button
                      onClick={() => handleSpeak(item.text)}
                      className="px-2 py-1 border border-brand-text-primary/30 rounded bg-brand-bg-primary hover:bg-brand-text-primary text-brand-bg-primary text-[9px]  text-brand-text-primary font-semibold font-mono uppercase tracking-wide cursor-pointer"
                    >
                      Speak
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(item.text)}
                      className="px-2 py-1 border border-white/10 rounded bg-brand-bg-primary hover:bg-white/5 text-[9px] text-brand-text-secondary hover:text-brand-text-primary  font-mono uppercase tracking-wide cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            ))}

            <div ref={chatEndRef} />
          </div>

          {/* Bottom Input Composer */}
          <div className="p-3 border-t border-brand-text-primary/30 bg-brand-bg-secondary/80  relative z-20">
            {audioError && (
              <div className="p-2 mb-2 bg-brand-error/10 border border-brand-error/30 text-brand-error text-[10px] rounded-none text-left ">
                ⚠️ {audioError}
              </div>
            )}

            <form onSubmit={handleSend} className="flex gap-2">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-10 h-10 flex-shrink-0 rounded-none border flex items-center justify-center  focus:outline-none
                  ${isRecording
                    ? 'bg-brand-error/25 border-brand-error text-brand-error '
                    : 'bg-brand-bg-primary border-brand-text-primary/30 text-brand-text-primary font-semibold hover:bg-brand-text-primary text-brand-bg-primary '
                  }`}
                title={isRecording ? 'Stop Recording' : 'Speak'}
              >
                {isRecording ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>
                )}
              </button>

              <textarea
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (inputVal.trim() && !isProcessing) {
                      handleSend(e as unknown as React.FormEvent);
                    }
                  }
                }}
                disabled={isProcessing}
                placeholder={
                  activeTab === ChamberMode.ORACLE
                    ? 'Ask Oracle a question...'
                    : activeTab === ChamberMode.COUNCIL
                      ? `Consult ${selectedPersona.name.split(' ')[0]}...`
                      : activeTab === ChamberMode.SYNTHESIS
                        ? 'Enter dispute premise...'
                        : 'Consult V4...'
                }
                className="flex-grow p-2.5 bg-brand-bg-primary border border-brand-text-primary/30 rounded-none focus:ring-1 focus:ring-brand-accent focus:outline-none text-[12px] text-brand-text-primary placeholder-brand-text-secondary/35 font-light resize-none min-h-[42px] max-h-[140px] custom-scrollbar"
                rows={1}
              />

              {isProcessing ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 border border-brand-error/40 rounded-none bg-brand-error/10 text-brand-error hover:bg-brand-error/25 text-[10px] font-mono uppercase tracking-wider flex-shrink-0  font-semibold"
                >
                  ✕ Cancel
                </button>
              ) : (
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!inputVal.trim()}
                  className="px-4 font-mono text-[10px] uppercase tracking-wider  flex-shrink-0"
                >
                  Consult
                </Button>
              )}
            </form>
          </div>
        </div>

        {/* Columns 9-12: Real-time Deliberation Blueprint & Trace Console (Right Panel) */}
        <div className="col-span-3 flex flex-col gap-5 h-full overflow-hidden min-h-0">
          <Card className="p-4.5 border border-brand-text-primary/30 bg-brand-bg-primary rounded-none flex flex-col h-full overflow-hidden ">
            <div className="space-y-1 border-b border-brand-text-primary/30 pb-3">
              <h3 className="text-sm font-serif font-bold text-shimmer flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4  text-brand-text-primary font-semibold" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
                  </svg>
                  Holographic Deliberation Blueprint
                </span>
                <span className="text-[8px] font-mono border border-brand-text-primary/30 text-brand-text-primary font-semibold px-1.5 py-0.5 rounded bg-brand-navy/80 uppercase">
                  {isProcessing ? 'Active' : 'Standby'}
                </span>
              </h3>
              <p className="text-[9px] text-brand-text-secondary font-light">Interactive process map. Hover and click nodes to interact.</p>
            </div>

            {/* Render the interactive SVG Blueprint Map */}
            <div className="py-2.5">
              <DeliberationBlueprint
                activeTab={activeTab}
                isProcessing={isProcessing}
                oracleStage={oracleStage}
                oracleTrace={oracleTrace}
                selectedPersona={selectedPersona}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                setSelectedPersona={setSelectedPersona}
              />
            </div>

            {/* Scrollable Trace Logs or System Status Archive */}
            <div className="flex-grow flex flex-col min-h-0 border-t border-brand-text-primary/30 pt-3">
              <span className="text-sm font-serif font-bold text-brand-text-primary/80 font-semibold block mb-2">
                {isProcessing ? `Live Trace: ${oracleStage}` : 'Process Log Archive'}
              </span>

              <div className="flex-grow overflow-y-auto custom-scrollbar space-y-3 pr-0.5 text-left">
                {isProcessing && oracleStage && (
                  <div className="p-3.5 rounded-none border border-brand-text-primary/30 bg-brand-bg-primary  space-y-3 ">
                    <div className="flex items-center space-x-2">
                      <LoadingSpinner size="sm" spinnerColor="text-brand-text-primary font-semibold " />
                      <span className="text-[9px] font-mono tracking-widest text-brand-text-primary font-semibold uppercase font-bold">{oracleStage}</span>
                    </div>

                    <div className="space-y-1.5">
                      {((activeTab === ChamberMode.ORACLE ? [
                        'Framing & Deconstruction',
                        'Strategy Proposal',
                        'Adversarial Critique',
                        'Defensive Refinement',
                        'Jurisprudential Reconciliation',
                        'Final Polish'
                      ] : activeTab === ChamberMode.SYNTHESIS ? [
                        'Systemic Matrix',
                        'Adversarial Stress Test',
                        'Adversarial Synthesis'
                      ] : ['Processing Consultation'])).map((stg, idx) => {
                        const isCompleted = idx < oracleTrace.length;
                        const isActive = idx === oracleTrace.length;
                        return (
                          <div key={idx} className="flex items-center justify-between text-[9px] font-mono">
                            <div className="flex items-center space-x-2">
                              <span className={`w-3.5 h-3.5 rounded-none flex items-center justify-center border text-[7px] font-bold
                                ${isCompleted 
                                  ? 'bg-brand-accent/20 border-brand-accent text-brand-text-primary font-semibold' 
                                  : isActive 
                                    ? 'bg-amber-500/10 border-amber-500 text-amber-400 ' 
                                    : 'bg-brand-navy border-brand-text-primary/30 text-brand-text-secondary/20'
                                }`}
                              >
                                {isCompleted ? '✓' : idx + 1}
                              </span>
                              <span className={isCompleted ? 'text-brand-text-secondary/50 line-through' : isActive ? 'text-brand-text-primary font-bold' : 'text-brand-text-secondary/30'}>
                                {stg}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {oracleTrace.length > 0 ? (
                  <div className="space-y-3">
                    {oracleTrace.map((tr, index) => (
                      <div key={index} className="space-y-1 p-3 bg-brand-bg-primary border border-brand-text-primary/30 rounded-none ">
                        <h6 className="font-mono text-[9px] font-bold text-brand-text-primary font-semibold uppercase tracking-wider border-b border-brand-text-primary/30 pb-0.5 flex items-center justify-between">
                          <span>Stage {index + 1}: {tr.stage}</span>
                          <span className="text-[7px] text-green-400 font-semibold bg-green-500/10 border border-green-500/20 px-1 rounded">✓ READY</span>
                        </h6>
                        <p className="leading-relaxed font-light text-brand-text-secondary text-[10px] whitespace-pre-wrap max-h-[100px] overflow-y-auto custom-scrollbar">{tr.content}</p>
                      </div>
                    ))}
                  </div>
                ) : !isProcessing ? (
                  <div className="p-4 border border-white/5 bg-brand-bg-primary rounded-none space-y-2 text-center text-brand-text-secondary font-light">
                    <span className="text-2xl "></span>
                    <h5 className="text-xs font-serif font-bold text-brand-text-primary">Cognitive Engines Standby</h5>
                    <p className="text-[9px] leading-relaxed max-w-[200px] mx-auto text-brand-text-secondary/70">
                      Submit a litigation premise or legal query in the consult workbench to activate the animated reasoning pipeline.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

      </div>

    </div>
  );
};

export default CouncilChamberScreen;
