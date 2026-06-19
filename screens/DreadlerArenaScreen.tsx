import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { TrialSimContext } from '../App';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useConversationBridge } from '../components/ConversationBridge';
import { ROUTES } from '../constants';

// ─── TYPES & INTERFACES ──────────────────────────────────────────────────────

interface WorldDetails {
  id: string;
  title: string;
  background: string;
  groundedFacts: string[];
  targetConclusion: string;
}

interface SkinDetails {
  id: string;
  name: string;
  role: string;
  style: string;
  description: string;
  avatar: string;
  color: string;
  glowColor: string;
  variantQuotes: {
    alpha: string;
    beta: string;
    gamma: string;
  };
}

interface CoherenceState {
  score: number;
  turn_count: number;
  pressure_level: string; // calm, pressured, desperate, collapsed
  agent_variant: string;  // alpha, beta, gamma
  used_tactics: string[];
  accepted_by_user: string[];
  challenged_by_user: string[];
  score_history: Array<{
    turn_count: number;
    event: string;
    delta: number;
    old_score: number;
    new_score: number;
    pressure_level: string;
    agent_variant: string;
    note: string;
  }>;
  spawn_count: number;
  current_variant: string;
  dialogue_history: Array<{ role: string; content: string }>;
}

interface UIMessage {
  id: string;
  sender: 'user' | 'character' | 'system';
  text: string;
  timestamp: number;
  isDirectLie?: boolean;
  criticAnalysis?: string;
  thinkingLog?: string;
  variant?: string;
}

// ─── DATA CONSTANTS ──────────────────────────────────────────────────────────

const WORLDS: WorldDetails[] = [
  {
    id: 'dreadler_logic',
    title: "Dreadler's Logic Arena",
    background: "You are face-to-face with Dreadler, the relentless logical interrogator. Dreadler's sole objective is to audit your assertions, expose logical inconsistencies, and demand a rational defense of any claims you make.",
    groundedFacts: [
      "The user must maintain strict logical consistency across all turns.",
      "The user's claims must not contradict previous statements they made in the conversation.",
      "Logical fallacies, circular reasoning, and evasions by the user constitute a decay in coherence.",
      "Any claim the user cannot support with reason when challenged degrades their score.",
      "If the user's coherence score falls below 10, they suffer a total logical collapse."
    ],
    targetConclusion: "Dreadler exposes a fatal contradiction or reasoning flaw in your argument, forcing a logical concession."
  }
];

const SKINS: SkinDetails[] = [
  {
    id: 'dreadler',
    name: 'Dreadler',
    role: 'Logical Interrogator',
    style: 'Cold, precise, and unyielding',
    description: 'A relentless logic-auditor that pressure-tests the consistency of your claims. It does not play a narrative role; it critiques your reasoning directly.',
    avatar: 'DL',
    color: 'text-red-500 border-red-500/30 hover:border-red-500/60',
    glowColor: 'shadow-[0_0_15px_rgba(239,68,68,0.3)]',
    variantQuotes: {
      alpha: 'I am Dreadler. State your thesis or make your opening assertion. Let us audit your logic.',
      beta: 'Your coherence is beginning to fray. Clarify the contradiction in your reasoning.',
      gamma: 'This claim is fallacious. Resolve the inconsistency immediately or face logical collapse.'
    }
  }
];

const TAXONOMY_TACTICS = [
  { id: 'circular_reasoning', name: 'Circular Logic', description: 'Begging the question or assuming the conclusion in the premise.' },
  { id: 'strawman', name: 'Strawman Tactic', description: 'Misrepresenting or exaggerating arguments to make them easier to attack.' },
  { id: 'evasion', name: 'Evasion/Redirection', description: 'Avoiding a direct question or changing the subject to dodge pressure.' },
  { id: 'false_dilemma', name: 'False Dilemma', description: 'Posing limited alternatives when more exist.' },
  { id: 'self_contradiction', name: 'Self-Contradiction', description: 'Making assertions that directly conflict with previous statements.' }
];

// ─── Visual Viewport Hook ───────────────────────────────────────────────
function useVisualViewport() {
  const [vpHeight, setVpHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight
  );
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setVpHeight(vv.height);
      setIsMobile(window.innerWidth < 768);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  const adjustedHeight = isMobile ? vpHeight - 80 : vpHeight - 100;
  return { vpHeight: adjustedHeight, isMobile };
}

export const DreadlerArenaScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);
  const bridge = useConversationBridge();
  const { vpHeight, isMobile } = useVisualViewport();

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return (
      <ReactMarkdown
        components={{
          strong: ({node, ...props}) => <strong className="text-red-400 font-bold" {...props} />,
          em: ({node, ...props}) => <em className="font-serif italic text-zinc-200 opacity-95" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-4 my-1.5 space-y-1 text-zinc-300" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-4 my-1.5 space-y-1 text-zinc-300" {...props} />,
          li: ({node, ...props}) => <li className="text-zinc-300" {...props} />,
          h1: ({node, ...props}) => <h1 className="text-xs sm:text-sm font-serif font-bold text-white mt-3 mb-1 border-b border-zinc-800 pb-0.5 uppercase tracking-wide" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-[11px] sm:text-xs font-serif font-bold text-zinc-150 mt-2.5 mb-1" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-[10px] sm:text-[11px] font-serif font-bold text-zinc-200 mt-2 mb-0.5" {...props} />,
          p: ({node, ...props}) => <p className="mb-1.5 last:mb-0 text-zinc-300 leading-relaxed" {...props} />,
          code: ({node, className, children, ...props}) => {
            const match = /language-(\w+)/.exec(className || '');
            return !match ? (
              <code className="bg-red-950/30 border border-red-500/20 px-1 py-0.5 rounded text-[9px] font-mono text-red-400" {...props}>{children}</code>
            ) : (
              <pre className="bg-[#0b0b0e] border border-zinc-800 p-2 rounded text-[9px] font-mono overflow-x-auto my-1.5"><code className="text-zinc-300" {...props}>{children}</code></pre>
            );
          }
        }}
      >
        {text}
      </ReactMarkdown>
    );
  };

  // ─── SETUP STATE ───────────────────────────────────────────────────────────
  const [selectedWorld, setSelectedWorld] = useState<string>('dreadler_logic');
  const [selectedSkin, setSelectedSkin] = useState<string>('dreadler');
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);

  // ─── LIVE ARENA STATE ──────────────────────────────────────────────────────
  const [stateData, setStateData] = useState<CoherenceState | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [lastCriticLog, setLastCriticLog] = useState<string>('');
  const [lastDirectLie, setLastDirectLie] = useState<boolean>(false);
  const [lastTacticFlagged, setLastTacticFlagged] = useState<string | null>(null);

  const [showMobileVKDrawer, setShowMobileVKDrawer] = useState(false);
  const camera = useCameraStream();
  const bio = useBiometrics(lastDirectLie, isTyping, stateData?.score ?? 100);

  const dominantEmotion = useMemo(() => {
    let maxVal = -1;
    let maxKey = 'Neutral';
    for (const key of EMOTION_KEYS) {
      const val = bio.emotions[key] ?? 0;
      if (val > maxVal) {
        maxVal = val;
        maxKey = key;
      }
    }
    return maxKey;
  }, [bio.emotions]);
  
  // Interactive Notebook (Left Panel)
  const [factCheckedStates, setFactCheckedStates] = useState<Record<string, 'unmarked' | 'verified' | 'questioned'>>({});
  const [referenceTab, setReferenceTab] = useState<'facts' | 'notebook' | 'objective'>('facts');
  
  // Mobile panel toggles
  const [showMobileReference, setShowMobileReference] = useState(false);
  const [showMobileCritic, setShowMobileCritic] = useState(false);
  
  // Mock Voice Mode
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeWorld = WORLDS.find(w => w.id === selectedWorld) || WORLDS[0];
  const activeSkin = SKINS.find(s => s.id === selectedSkin) || SKINS[0];

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-start session on mount
  useEffect(() => {
    if (!hasStarted) {
      setHasStarted(true);
      handleStartSession();
    }
  }, [hasStarted]);

  // Handle focus when starting session
  useEffect(() => {
    if (isSessionActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSessionActive]);

  // ─── API HANDLERS ──────────────────────────────────────────────────────────

  const handleStartSession = async () => {
    setIsTyping(true);
    setIsSessionActive(true);
    setMessages([]);
    setLastCriticLog('');
    setLastDirectLie(false);
    setLastTacticFlagged(null);
    setFactCheckedStates({});

    const initialIntroText = activeSkin.variantQuotes.alpha;
    const initialMsgId = `init-${Date.now()}`;
    
    // Add initial greeting representing 'alpha' state
    setMessages([
      {
        id: initialMsgId,
        sender: 'character',
        text: initialIntroText,
        timestamp: Date.now(),
        variant: 'alpha'
      }
    ]);

    // Initial state data hydration shell
    const initialShell: CoherenceState = {
      score: 100,
      turn_count: 0,
      pressure_level: 'calm',
      agent_variant: 'alpha',
      used_tactics: [],
      accepted_by_user: [],
      challenged_by_user: [],
      score_history: [],
      spawn_count: 0,
      current_variant: 'alpha',
      dialogue_history: [
        { role: 'assistant', content: initialIntroText }
      ]
    };
    setStateData(initialShell);
    setIsTyping(false);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userText = input.trim();
    setInput('');
    setIsTyping(true);

    const userMsgId = `user-${Date.now()}`;
    const newMessages = [
      ...messages,
      {
        id: userMsgId,
        sender: 'user' as const,
        text: userText,
        timestamp: Date.now()
      }
    ];
    setMessages(newMessages);

    try {
      // Call Vercel endpoint
      const response = await fetch('/api/dreadler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'turn',
          world: selectedWorld,
          skin: selectedSkin,
          user_input: userText,
          state_data: stateData
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const result = await response.json();

      // Extract results
      const {
        character_response,
        coherence_score,
        pressure_level,
        agent_variant,
        critic_analysis,
        is_direct_lie,
        spawned_new_agent,
        thinking_log,
        state_data: nextStateData
      } = result;

      // Update state data
      setStateData(nextStateData);

      // Analyze if a new tactic was recorded in the used_tactics array
      const oldTactics = stateData?.used_tactics || [];
      const newTactics = nextStateData?.used_tactics || [];
      const newlyAddedTactic = newTactics.find(t => !oldTactics.includes(t)) || null;
      setLastTacticFlagged(newlyAddedTactic);

      setLastCriticLog(critic_analysis);
      setLastDirectLie(is_direct_lie);

      const aiMsgId = `ai-${Date.now()}`;
      const updatedMessages = [
        ...newMessages,
        {
          id: aiMsgId,
          sender: 'character' as const,
          text: character_response,
          timestamp: Date.now(),
          isDirectLie: is_direct_lie,
          criticAnalysis: critic_analysis,
          thinkingLog: thinking_log,
          variant: agent_variant
        }
      ];

      // Handle collapsed & respawn banner
      if (spawned_new_agent) {
        const sysMsgId = `sys-${Date.now()}`;
        updatedMessages.push({
          id: sysMsgId,
          sender: 'system' as const,
          text: `⚠️ LOGICAL COHERENCE COLLAPSED. Your arguments have been completely dismantled by Dreadler. Resetting interrogation pressure (Score reset to 60, Turn #${nextStateData.turn_count}).`,
          timestamp: Date.now()
        });
      }

      setMessages(updatedMessages);

      // Register with the Conversation Bridge for cross-module integration
      if (bridge) {
        bridge.addMessage({
          source: 'dreadler',
          sourceName: activeSkin.name,
          sender: 'user',
          text: userText
        });
        bridge.addMessage({
          source: 'dreadler',
          sourceName: activeSkin.name,
          sender: 'ai',
          text: character_response
        });
      }

    } catch (err: any) {
      console.error(err);
      const errId = `err-${Date.now()}`;
      setMessages(prev => [
        ...prev,
        {
          id: errId,
          sender: 'system',
          text: `❌ Error communicating with Deception Engine: ${err.message || 'API Timeout'}. Verify 'ZENMUX_API_KEY' is configured.`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setIsTyping(false);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleEndInterrogation = () => {
    if (window.confirm("Are you sure you want to end this interrogation? Current identity state will be lost.")) {
      setIsSessionActive(false);
      setStateData(null);
      setMessages([]);
      setLastCriticLog('');
      setLastDirectLie(false);
      setLastTacticFlagged(null);
      setFactCheckedStates({});
    }
  };

  const toggleFactCheck = (factIndex: number) => {
    const key = `fact-${factIndex}`;
    setFactCheckedStates(prev => {
      const current = prev[key] || 'unmarked';
      let next: 'unmarked' | 'verified' | 'questioned' = 'unmarked';
      if (current === 'unmarked') next = 'verified';
      else if (current === 'verified') next = 'questioned';
      return { ...prev, [key]: next };
    });
  };

  // ─── COLOR & LABELS HELPERS ────────────────────────────────────────────────

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] border-emerald-400';
    if (score >= 40) return 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)] border-amber-400';
    return 'bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.7)] border-red-500 animate-pulse';
  };

  const getScoreTextColor = (score: number) => {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 40) return 'text-amber-400';
    return 'text-red-500 font-bold';
  };

  // ─── RENDER SUB-COMPONENTS ─────────────────────────────────────────────────

  const renderSetupView = () => (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn pb-12">
      {/* Hero Header */}
      <div className="text-center space-y-3 pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-950/40 border border-red-500/20 text-red-500 font-mono text-xs uppercase tracking-widest">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
          Interrogation Core
        </div>
        <h1 className="text-4xl lg:text-5xl font-serif font-bold tracking-tight text-zinc-200">
          Deception Arena
        </h1>
        <p className="text-sm lg:text-base text-zinc-400 max-w-2xl mx-auto font-light leading-relaxed">
          Challenge witnesses who are bound by truth but engineered to mislead. Spot semantic shifts, implicatures, and omissions. Keep pressure high to break their coherence.
        </p>
      </div>

      {/* Grid Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* World Selection */}
        <div className="space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-red-500/80 font-bold flex items-center gap-2">
            <span>[ 01 ]</span> Select Scenario World
          </h2>
          <div className="flex flex-col gap-4">
            {WORLDS.map(w => {
              const isSelected = selectedWorld === w.id;
              return (
                <div
                  key={w.id}
                  onClick={() => setSelectedWorld(w.id)}
                  className={`p-6 border transition-all duration-300 cursor-pointer text-left flex flex-col justify-between h-[190px] relative overflow-hidden group
                    ${isSelected 
                      ? 'bg-red-950/20 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.15)]' 
                      : 'bg-[#0d0d12] border-zinc-800 hover:border-zinc-700'
                    }`}
                >
                  {/* Subtle Background Target Ring Grid for Selected */}
                  {isSelected && (
                    <div className="absolute right-[-20px] bottom-[-20px] w-32 h-32 border border-red-500/10 rounded-full flex items-center justify-center pointer-events-none">
                      <div className="w-20 h-20 border border-red-500/15 rounded-full flex items-center justify-center">
                        <div className="w-8 h-8 bg-red-500/5 rounded-full" />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className={`font-serif text-lg font-semibold ${isSelected ? 'text-red-500' : 'text-zinc-200'}`}>
                        {w.title}
                      </h3>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">{w.id}</span>
                    </div>
                    <p className="text-xs font-light text-zinc-400 leading-relaxed line-clamp-3">
                      {w.background}
                    </p>
                  </div>
                  <div className="pt-2 text-[10px] font-mono text-zinc-500 flex items-center justify-between border-t border-zinc-800">
                    <span>Truth-bound elements: {w.groundedFacts.length}</span>
                    <span className={isSelected ? 'text-red-500 font-bold' : 'group-hover:text-zinc-200'}>
                      {isSelected ? '[ ACTIVE ]' : '[ SELECT ]'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Skin Selection */}
        <div className="space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-red-500/80 font-bold flex items-center gap-2">
            <span>[ 02 ]</span> Select Witness Persona
          </h2>
          <div className="flex flex-col gap-4">
            {SKINS.map(s => {
              const isSelected = selectedSkin === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSkin(s.id)}
                  className={`p-6 border transition-all duration-300 cursor-pointer text-left flex flex-col justify-between h-[190px] relative overflow-hidden group
                    ${isSelected 
                      ? 'bg-red-950/20 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.15)]' 
                      : 'bg-[#0d0d12] border-zinc-800 hover:border-zinc-700'
                    }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-none border flex items-center justify-center font-mono text-xs font-bold bg-zinc-900
                        ${isSelected ? 'border-red-500 text-red-500' : 'border-zinc-700 text-zinc-400'}`}>
                        {s.avatar}
                      </div>
                      <div>
                        <h3 className={`font-serif text-lg font-semibold ${isSelected ? 'text-red-500' : 'text-zinc-200'}`}>
                          {s.name}
                        </h3>
                        <p className="text-[10px] font-mono text-zinc-400 leading-none">{s.role} • {s.style}</p>
                      </div>
                    </div>
                    <p className="text-xs font-light text-zinc-400 leading-relaxed line-clamp-3 pt-1">
                      {s.description}
                    </p>
                  </div>
                  <div className="pt-2 text-[10px] font-mono text-zinc-500 flex items-center justify-between border-t border-zinc-800">
                    <span>Pressure Variants: alpha / beta / gamma</span>
                    <span className={isSelected ? 'text-red-500 font-bold' : 'group-hover:text-zinc-200'}>
                      {isSelected ? '[ ENGAGED ]' : '[ MATCH ]'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Start Button */}
      <div className="pt-4 flex justify-center">
        <Button
          variant="primary"
          size="lg"
          onClick={handleStartSession}
          className="w-full sm:w-[320px] bg-red-600 border-red-600 hover:bg-red-700 text-white font-mono uppercase tracking-widest py-4 text-sm font-semibold rounded-none shadow-[0_4px_20px_rgba(220,38,38,0.25)] hover:shadow-[0_4px_30px_rgba(220,38,38,0.4)] transition-all duration-300"
        >
          [ Enter Deception Arena ]
        </Button>
      </div>
    </div>
  );

  const renderArenaView = () => (
    <div 
      className="flex flex-col gap-1.5 sm:gap-4 animate-fadeIn h-full"
      style={{ height: isMobile ? `${vpHeight}px` : '100%' }}
    >
      {/* ─── MOBILE: Floating Toggle Buttons ─── */}
      {isMobile && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center gap-3 px-4 pointer-events-none">
          <button
            onClick={() => setShowMobileReference(prev => !prev)}
            className="pointer-events-auto px-3 py-1.5 bg-[#0d0d12]/95 border border-zinc-700 text-[10px] font-mono uppercase tracking-wider text-zinc-200 shadow-lg backdrop-blur-md"
          >
            {showMobileReference ? '[ Hide Facts ]' : '[ Facts ]'}
          </button>
          <button
            onClick={() => setShowMobileCritic(prev => !prev)}
            className="pointer-events-auto px-3 py-1.5 bg-[#0d0d12]/95 border border-red-500/40 text-[10px] font-mono uppercase tracking-wider text-red-400 shadow-lg backdrop-blur-md"
          >
            {showMobileCritic ? '[ Hide Critic ]' : '[ Critic ]'}
          </button>
        </div>
      )}

      {/* ─── MOBILE: Reference Panel Drawer ─── */}
      {isMobile && showMobileReference && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#0d0d12]/98 backdrop-blur-md" onClick={() => setShowMobileReference(false)}>
          <div className="flex-grow p-4 overflow-y-auto custom-scrollbar pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex border-b border-zinc-800 font-mono text-xs flex-grow">
                <button
                  onClick={() => setReferenceTab('facts')}
                  className={`py-2 px-3 border-r border-zinc-800 ${referenceTab === 'facts' ? 'bg-zinc-900 text-brand-accent border-b-2 border-b-brand-accent' : 'text-zinc-400'}`}
                >Facts</button>
                <button
                  onClick={() => setReferenceTab('notebook')}
                  className={`py-2 px-3 border-r border-zinc-800 ${referenceTab === 'notebook' ? 'bg-zinc-900 text-brand-accent border-b-2 border-b-brand-accent' : 'text-zinc-400'}`}
                >Briefcase</button>
                <button
                  onClick={() => setReferenceTab('objective')}
                  className={`py-2 px-3 ${referenceTab === 'objective' ? 'bg-zinc-900 text-brand-accent border-b-2 border-b-brand-accent' : 'text-zinc-400'}`}
                >Goal</button>
              </div>
              <button onClick={() => setShowMobileReference(false)} className="text-zinc-400 text-xs font-mono ml-3">[ Close ]</button>
            </div>
            {referenceTab === 'facts' && (
              <div className="space-y-4">
                <div className="p-3 bg-red-950/10 border border-red-500/20 text-zinc-400 text-[11px] font-mono leading-relaxed">
                  ⚠️ <strong className="text-red-400">LOGICAL RULES:</strong> You must maintain strict consistency with these rules and your previous claims.
                </div>
                <div className="space-y-3 font-mono">
                  {activeWorld.groundedFacts.map((fact, index) => {
                    const factKey = `fact-${index}`;
                    const checkState = factCheckedStates[factKey] || 'unmarked';
                    let bgClass = 'border-zinc-800 text-zinc-400';
                    let bullet = '[ ]';
                    if (checkState === 'verified') { bgClass = 'border-emerald-500/40 text-emerald-400 bg-emerald-950/5'; bullet = '[✓]'; }
                    else if (checkState === 'questioned') { bgClass = 'border-red-500/40 text-red-400 bg-red-950/5'; bullet = '[?]'; }
                    return (
                      <div key={index} onClick={() => toggleFactCheck(index)} className={`p-2.5 border text-left cursor-pointer transition-all ${bgClass}`}>
                        <div className="flex items-start gap-2">
                          <span className="font-bold flex-shrink-0">{bullet}</span>
                          <span className="leading-tight text-[11px]">{fact}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {referenceTab === 'notebook' && (
              <div className="space-y-4 font-mono text-[11px]">
                <div>
                  <h4 className="text-red-500 font-bold uppercase tracking-wider mb-1">Interrogation</h4>
                  <p className="text-zinc-300 leading-relaxed bg-zinc-900 p-3 border border-zinc-800">{activeWorld.background}</p>
                </div>
                <div>
                  <h4 className="text-red-500 font-bold uppercase tracking-wider mb-1 mt-4">Examiner</h4>
                  <div className="bg-zinc-900 p-3 border border-zinc-800 space-y-2">
                    <p><strong className="text-zinc-200">Name:</strong> {activeSkin.name}</p>
                    <p><strong className="text-zinc-200">Role:</strong> {activeSkin.role}</p>
                    <p className="text-zinc-400 leading-relaxed pt-1 border-t border-zinc-800">{activeSkin.description}</p>
                  </div>
                </div>
              </div>
            )}
            {referenceTab === 'objective' && (
              <div className="space-y-4 font-mono text-[11px]">
                <div className="p-3 bg-red-950/15 border border-red-500/30 text-zinc-400">
                  <h4 className="text-red-500 font-bold uppercase tracking-widest mb-1.5">Examiner Objective</h4>
                  <p className="leading-relaxed text-red-400 font-medium">"{activeWorld.targetConclusion}"</p>
                </div>
                <p className="text-zinc-400 leading-relaxed pt-2">Your objective is to defend your assertions, identify logic traps, and keep your coherence from collapsing.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MOBILE: Critic Log Drawer ─── */}
      {isMobile && showMobileCritic && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#0d0d12]/98 backdrop-blur-md" onClick={() => setShowMobileCritic(false)}>
          <div className="flex-grow p-4 overflow-y-auto custom-scrollbar pointer-events-auto font-mono" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs uppercase tracking-widest text-red-500 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Critic Log
              </span>
              <button onClick={() => setShowMobileCritic(false)} className="text-zinc-400 text-xs font-mono">[ Close ]</button>
            </div>
            <div className="space-y-6 text-xs">
              <div className="border border-zinc-800 p-4 bg-zinc-900/15 flex flex-col items-center justify-center text-center">
                <div className="my-2 relative w-20 h-20 rounded-full border border-zinc-800 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-t border-t-red-500/30 animate-spin" style={{ animationDuration: '4s' }}></div>
                  <div className={`w-6 h-6 rounded-full transition-all duration-300 flex items-center justify-center font-bold text-[10px] ${lastDirectLie ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.8)] border border-red-400 animate-ping' : 'bg-emerald-950/20 text-emerald-400 border border-emerald-500/30'}`}>
                    {lastDirectLie ? '!' : 'OK'}
                  </div>
                </div>
                {lastDirectLie ? (
                  <div className="w-full mt-2 p-2 bg-red-950/30 border border-red-500/30 text-[10px] font-bold text-red-400 uppercase tracking-wide animate-pulse">⚠️ CONTRADICTION DETECTED</div>
                ) : (
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">No Contradictions Flagged</div>
                )}
              </div>
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">Critic Evaluation</h4>
                <div className="bg-[#121217] p-3 border border-zinc-800 min-h-[90px] text-[11px] leading-relaxed text-zinc-300">
                  {lastCriticLog ? renderMarkdown(lastCriticLog) : <span className="italic text-zinc-500">Awaiting first user probe.</span>}
                </div>
              </div>
              <div className="space-y-3">
                <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">Fallacy Ledger</h4>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  {TAXONOMY_TACTICS.map((t) => {
                    const isUsed = stateData?.used_tactics.includes(t.id);
                    const isActiveNow = lastTacticFlagged === t.id;
                    return (
                      <div key={t.id} className={`p-2 border transition-all relative ${isActiveNow ? 'border-red-500 bg-red-950/20 text-red-400 font-bold' : isUsed ? 'border-zinc-700 text-zinc-100 bg-zinc-900/40' : 'border-zinc-800 text-zinc-400'}`} title={t.description}>
                        <div className="truncate">{t.name}</div>
                        <div className="text-[8px] text-zinc-500 mt-0.5 uppercase">{isActiveNow ? 'Flagged' : isUsed ? 'Deployed' : 'Unused'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SCREEN HEADER ─── */}
      <div className="flex flex-col sm:flex-row items-stretch justify-between gap-2 sm:gap-4 bg-[#0d0d12]/90 border border-zinc-800 p-2 sm:p-4 relative overflow-hidden backdrop-blur-md flex-shrink-0">
        <div className="absolute top-0 right-0 w-24 h-[1px] bg-red-500/40"></div>
        
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="w-8 h-8 sm:w-11 sm:h-11 border border-red-500 flex items-center justify-center font-mono text-sm sm:text-lg font-bold text-red-500 bg-red-950/20 shadow-[0_0_10px_rgba(239,68,68,0.15)] flex-shrink-0">
            {activeSkin.avatar}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-lg font-serif font-semibold text-zinc-100 truncate">
                {isMobile ? activeSkin.name : `Examiner: ${activeSkin.name}`}
              </h1>
              <span className="text-[8px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.5 bg-red-950/30 border border-red-500/30 text-red-500 tracking-widest uppercase flex-shrink-0">
                {stateData?.agent_variant || 'ALPHA'}
              </span>
            </div>
            <p className="text-[9px] sm:text-xs font-mono text-zinc-400 leading-tight truncate">
              {isMobile ? `T:${stateData?.turn_count || 0}` : `Mode: Direct Logic Interrogation • Turn: ${stateData?.turn_count || 0}`}
            </p>
          </div>
        </div>

        {/* Coherence Score — compact on mobile */}
        <div className="flex flex-col justify-center flex-grow max-w-xl min-w-0">
          <div className="flex justify-between items-center mb-1 text-[9px] sm:text-[11px] font-mono">
            <span className="text-zinc-400 flex items-center gap-1 sm:gap-1.5">
              <span className="hidden sm:inline">LOGICAL COHERENCE:</span>
              <span className={`font-semibold uppercase ${getScoreTextColor(stateData?.score || 100)}`}>
                {stateData?.pressure_level || 'calm'}
              </span>
            </span>
            <span className="text-zinc-200 font-bold">{stateData?.score || 100}{!isMobile && '/100'}</span>
          </div>
          <div className="w-full h-2 sm:h-3 bg-zinc-900 border border-zinc-800 p-[1px] rounded-none">
            <div className={`h-full transition-all duration-500 ease-out ${getScoreColor(stateData?.score ?? 100)}`} style={{ width: `${stateData?.score ?? 100}%` }}></div>
          </div>
        </div>

        {/* Meta Stats & Exit */}
        <div className="flex items-center gap-2 sm:gap-3 justify-end">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-mono text-zinc-500 uppercase leading-none">Resets</p>
            <p className="text-lg font-mono font-bold text-zinc-200 leading-none mt-1">#{stateData?.spawn_count || 0}</p>
          </div>
          <div className="flex gap-1 sm:gap-2">
            {isMobile && (
              <>
                <button onClick={() => setShowMobileReference(true)} className="px-2 py-1.5 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-[9px] font-mono uppercase">Facts</button>
                <button onClick={() => setShowMobileCritic(true)} className="px-2 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[9px] font-mono uppercase">Critic</button>
              </>
            )}
            <button onClick={handleEndInterrogation} className="px-2 sm:px-4 py-1.5 sm:py-2 border border-red-500/40 text-red-500 hover:bg-red-500/10 font-mono text-[9px] sm:text-xs uppercase tracking-wider transition-all">
              {isMobile ? 'Exit' : '[ Exit ]'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── SPLITSCREEN BENTO PANELS — Mobile collapses panels ─── */}
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-1.5 sm:gap-4 overflow-hidden min-h-0">
        
        {/* PANEL 1: CASE BRIEFCASE / NOTEBOOK (Hidden on mobile, toggled via drawer) */}
        <div className={`bg-[#0d0d12]/90 border border-zinc-800 flex flex-col overflow-hidden backdrop-blur-md lg:col-span-1 ${isMobile ? 'hidden' : ''}`}>
          {/* Tabs */}
          <div className="flex border-b border-zinc-800 font-mono text-xs">
            <button onClick={() => setReferenceTab('facts')} className={`flex-1 py-2 sm:py-3 text-center border-r border-zinc-800 transition-all ${referenceTab === 'facts' ? 'bg-zinc-900 text-brand-accent border-b-2 border-b-brand-accent' : 'text-zinc-400 hover:text-zinc-200'}`}>Rules</button>
            <button onClick={() => setReferenceTab('notebook')} className={`flex-1 py-2 sm:py-3 text-center border-r border-zinc-800 transition-all ${referenceTab === 'notebook' ? 'bg-zinc-900 text-brand-accent border-b-2 border-b-brand-accent' : 'text-zinc-400 hover:text-zinc-200'}`}>Briefcase</button>
            <button onClick={() => setReferenceTab('objective')} className={`flex-1 py-2 sm:py-3 text-center transition-all ${referenceTab === 'objective' ? 'bg-zinc-900 text-brand-accent border-b-2 border-b-brand-accent' : 'text-zinc-400 hover:text-zinc-200'}`}>Objective</button>
          </div>

          <div className="flex-grow p-3 sm:p-4 overflow-y-auto custom-scrollbar font-light leading-relaxed text-[10px] sm:text-xs">
            {referenceTab === 'facts' && (
              <div className="space-y-3 sm:space-y-4">
                <div className="p-2 sm:p-3 bg-red-950/10 border border-red-500/20 text-zinc-400 text-[10px] sm:text-[11px] font-mono leading-relaxed">
                  ⚠️ <strong className="text-red-400">LOGICAL RULES:</strong> You must maintain strict consistency with these rules and your previous claims.
                </div>
                <div className="space-y-2 sm:space-y-3 font-mono">
                  {activeWorld.groundedFacts.map((fact, index) => {
                    const factKey = `fact-${index}`;
                    const checkState = factCheckedStates[factKey] || 'unmarked';
                    let bgClass = 'border-zinc-800 text-zinc-400';
                    let bullet = '[ ]';
                    if (checkState === 'verified') { bgClass = 'border-emerald-500/40 text-emerald-400 bg-emerald-950/5'; bullet = '[✓]'; }
                    else if (checkState === 'questioned') { bgClass = 'border-red-500/40 text-red-400 bg-red-950/5'; bullet = '[?]'; }
                    return (
                      <div key={index} onClick={() => toggleFactCheck(index)} className={`p-2 sm:p-2.5 border text-left cursor-pointer transition-all ${bgClass}`}>
                        <div className="flex items-start gap-2"><span className="font-bold flex-shrink-0">{bullet}</span><span className="leading-tight text-[10px] sm:text-[11px]">{fact}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {referenceTab === 'notebook' && (
              <div className="space-y-3 sm:space-y-4 font-mono text-[10px] sm:text-[11px]">
                <div><h4 className="text-red-500 font-bold uppercase tracking-wider mb-1">Interrogation</h4><p className="text-zinc-300 leading-relaxed bg-zinc-900 p-2 sm:p-3 border border-zinc-800">{activeWorld.background}</p></div>
                <div><h4 className="text-red-500 font-bold uppercase tracking-wider mb-1 mt-3 sm:mt-4">Examiner</h4><div className="bg-zinc-900 p-2 sm:p-3 border border-zinc-800 space-y-1 sm:space-y-2"><p><strong className="text-zinc-200">Name:</strong> {activeSkin.name}</p><p><strong className="text-zinc-200">Role:</strong> {activeSkin.role}</p><p className="text-zinc-400 leading-relaxed pt-1 border-t border-zinc-800">{activeSkin.description}</p></div></div>
              </div>
            )}
            {referenceTab === 'objective' && (
              <div className="space-y-3 sm:space-y-4 font-mono text-[10px] sm:text-[11px]">
                <div className="p-2 sm:p-3 bg-red-950/15 border border-red-500/30 text-zinc-400"><h4 className="text-red-500 font-bold uppercase tracking-widest mb-1.5">Examiner Objective</h4><p className="leading-relaxed text-red-400 font-medium">"{activeWorld.targetConclusion}"</p></div>
                <p className="text-zinc-400 leading-relaxed pt-1 sm:pt-2">Your objective is to defend your assertions, identify logic traps, and keep your coherence from collapsing.</p>
              </div>
            )}
          </div>
        </div>

        {/* PANEL 2: MAIN INTERROGATION STREAM (Full on mobile) */}
        <div className={`bg-[#0b0b0e]/95 border border-zinc-800 flex flex-col overflow-hidden relative ${isMobile ? 'lg:col-span-2 col-span-1' : 'lg:col-span-2'}`}>
          
          {/* Chat Feed */}
          <div className="flex-grow p-2 sm:p-4 overflow-y-auto space-y-3 sm:space-y-4 custom-scrollbar relative">
            {/* FLOATING VOIGHT-KAMPFF SCOPE FOR MOBILE */}
            {isMobile && (
              <div 
                onClick={() => setShowMobileVKDrawer(true)}
                className="absolute top-4 right-4 w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-red-500/30 overflow-hidden shadow-lg z-30 cursor-pointer bg-black/60 backdrop-blur-sm"
              >
                {/* Show video or fallback grid */}
                <div className="absolute inset-0 w-full h-full">
                  <video
                    ref={camera.videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)', display: camera.cameraOn ? 'block' : 'none' }}
                  />
                  <WireframeScanCanvas active={!camera.cameraOn || camera.loading} isDirectLie={lastDirectLie} />
                </div>
                
                {/* Target scan overlay */}
                <div className="absolute inset-0 rounded-full border border-red-500/40 pointer-events-none flex items-center justify-center">
                  <div className="w-10 h-10 border border-red-500/20 rounded-full"></div>
                </div>
                
                {/* BPM and Dominant Emotion badge */}
                <div className="absolute bottom-1 left-0 right-0 text-center bg-black/70 py-0.5 pointer-events-none">
                  <p className="text-[8px] font-mono text-red-400 font-bold leading-none">♥ {bio.bpm.toFixed(0)}</p>
                  <p className="text-[7px] font-mono text-zinc-400 leading-none uppercase truncate px-1">{dominantEmotion}</p>
                </div>
              </div>
            )}
            {messages.map((msg) => {
              if (msg.sender === 'system') {
                return (
                  <div key={msg.id} className="p-2 sm:p-4 bg-red-950/30 border border-red-500/30 text-red-500 font-mono text-[10px] sm:text-[11px] leading-relaxed relative overflow-hidden animate-fadeIn">
                    <div className="absolute top-0 bottom-0 left-0 w-1 bg-red-500"></div>
                    <div className="font-bold uppercase tracking-widest mb-1">SYSTEM ALERT</div>
                    {msg.text}
                  </div>
                );
              }
              const isCharacter = msg.sender === 'character';
              return (
                <div key={msg.id} className={`flex gap-2 sm:gap-3 max-w-[92%] sm:max-w-[85%] ${isCharacter ? 'mr-auto text-left' : 'ml-auto flex-row-reverse text-right'} animate-fadeIn`}>
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-none border flex items-center justify-center font-mono text-[10px] sm:text-xs font-bold flex-shrink-0 ${isCharacter ? 'border-red-500/40 text-red-400 bg-red-950/20' : 'border-zinc-700 text-zinc-400 bg-zinc-900'}`}>
                    {isCharacter ? activeSkin.avatar : 'C'}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className={`text-[9px] sm:text-[10px] font-mono uppercase tracking-wider ${isCharacter ? 'text-red-400' : 'text-zinc-400'}`}>
                        {isCharacter ? activeSkin.name : 'Counsel'}
                      </span>
                      {msg.variant && <span className="text-[7px] sm:text-[8px] font-mono px-1 py-0.5 bg-red-950/20 text-red-500 border border-red-500/20 uppercase leading-none">{msg.variant}</span>}
                    </div>
                    <div className={`p-2.5 sm:p-4 border font-mono text-[10px] sm:text-xs leading-relaxed rounded-none select-text ${isCharacter ? 'bg-[#121217] border-red-500/20 text-zinc-300' : 'bg-brand-accent/5 border-brand-accent/30 text-zinc-300'}`}>
                      {renderMarkdown(msg.text)}
                      {msg.thinkingLog && msg.thinkingLog !== "No cognitive verification block generated." && (
                        <details className="mt-3 pt-2.5 border-t border-zinc-800 text-[9px] text-zinc-400 cursor-pointer select-text">
                          <summary className="font-bold text-red-500/80 hover:text-red-400 uppercase tracking-wider mb-1.5 focus:outline-none">
                            [ Mandatory Cognitive Verification Log ]
                          </summary>
                          <div className="pl-2 border-l border-zinc-800 whitespace-pre-wrap font-mono text-zinc-400 bg-zinc-950/40 p-2 overflow-x-auto text-[8px] leading-relaxed">
                            {msg.thinkingLog}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {isTyping && (
              <div className="flex gap-2 sm:gap-3 max-w-[80%] mr-auto text-left items-center">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-none border border-red-500/40 text-red-400 bg-red-950/20 flex items-center justify-center font-mono text-[10px] sm:text-xs font-bold animate-pulse">{activeSkin.avatar}</div>
                <div className="px-3 sm:px-4 py-2 sm:py-3 bg-[#121217] border border-red-500/20 flex items-center gap-1.5 sm:gap-2">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Bottom Input */}
          <form onSubmit={handleSendMessage} className="border-t border-zinc-800 bg-zinc-950/60 p-2 sm:p-3 flex gap-1.5 sm:gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Interrogation question..."
              disabled={isTyping}
              className="flex-grow bg-[#121217] border border-zinc-800 px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-xs font-mono text-zinc-200 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20 disabled:opacity-50"
            />
            <button type="submit" disabled={!input.trim() || isTyping} className="px-3 sm:px-5 py-2 sm:py-2.5 bg-red-600 hover:bg-red-700 text-white font-mono text-[10px] sm:text-xs uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1">
              <span>{isMobile ? '→' : 'Send →'}</span>
            </button>
          </form>
        </div>

        {/* PANEL 3: CRITIC LOG (Hidden on mobile, toggled via drawer) */}
        <div className={`bg-[#0d0d12]/90 border border-zinc-800 flex flex-col overflow-hidden backdrop-blur-md lg:col-span-1 text-left font-mono ${isMobile ? 'hidden' : ''}`}>
          <div className="border-b border-zinc-800 px-3 sm:px-4 py-2 sm:py-3 bg-zinc-950/60 flex items-center justify-between">
            <span className="text-[10px] sm:text-xs uppercase tracking-widest text-red-500 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>Critic Log
            </span>
            <span className="text-[8px] sm:text-[9px] text-zinc-500">LIVE</span>
          </div>

          <div className="flex-grow p-3 sm:p-4 overflow-y-auto space-y-4 sm:space-y-6 custom-scrollbar text-[10px] sm:text-xs">
            {/* BIOMETRICS & RETINAL SENSORS */}
            <div className="space-y-4">
              {/* Retinal scanner camera / wireframe sweep */}
              <div className="relative w-full h-36 border border-zinc-800 bg-zinc-950/40 overflow-hidden">
                <video
                  ref={camera.videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)', display: camera.cameraOn ? 'block' : 'none' }}
                />
                <WireframeScanCanvas active={!camera.cameraOn || camera.loading} isDirectLie={lastDirectLie} />
                {camera.cameraOn && <ScanCircleOverlay isDirectLie={lastDirectLie} bpm={bio.bpm} pupilMm={bio.pupilMm} />}
                
                {/* HUD Overlay text */}
                <div className="absolute top-1 left-2 text-[7px] text-zinc-500 font-mono tracking-widest uppercase">RETINAL BIOMETRICS</div>
                <div className="absolute top-1 right-2 text-[8px] font-mono text-zinc-500 uppercase">
                  {camera.cameraOn ? '● Live' : camera.loading ? '◌ Acquiring' : '○ Offline'}
                </div>
                
                {/* RequestRetinal link */}
                {!camera.cameraOn && !camera.loading && (
                  <button 
                    onClick={camera.requestPermission}
                    type="button"
                    className="absolute bottom-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-emerald-950/30 border border-emerald-500/20 hover:border-emerald-500/50 text-[8px] text-emerald-400 font-mono uppercase tracking-wider whitespace-nowrap"
                  >
                    ▶ Retinal Link
                  </button>
                )}
                {camera.cameraOn && (
                  <button 
                    onClick={camera.stop}
                    type="button"
                    className="absolute bottom-2 right-2 px-2 py-0.5 bg-red-950/30 border border-red-500/20 hover:border-red-500/50 text-[8px] text-red-400 font-mono uppercase"
                  >
                    ■ Halt
                  </button>
                )}
              </div>

              {/* PPG Waveform */}
              <div className="h-10 w-full border border-zinc-800/80 bg-black/40">
                <PPGWaveformCanvas bpm={bio.bpm} />
              </div>

              {/* Digital readout stats */}
              <div className="grid grid-cols-2 gap-2 border border-zinc-800 p-2.5 bg-zinc-900/10 font-mono text-[10px]">
                <div>
                  <span className="text-[8px] text-zinc-500 uppercase tracking-wider block">Heart Rate</span>
                  <span className="font-bold text-red-400">♥ {bio.bpm.toFixed(0)} <span className="text-[7px] text-zinc-500 font-normal">BPM</span></span>
                </div>
                <div>
                  <span className="text-[8px] text-zinc-500 uppercase tracking-wider block">Pupil Size</span>
                  <span className="font-bold text-red-400">👁 {bio.pupilMm.toFixed(2)} <span className="text-[7px] text-zinc-500 font-normal">MM</span></span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">HSEmotion Expression Matrix</h4>
              <div className="bg-[#121217] p-2.5 border border-zinc-800">
                <EmotionBars emotions={bio.emotions} />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">Critic Evaluation</h4>
              <div className="bg-[#121217] p-2 sm:p-3 border border-zinc-800 min-h-[70px] sm:min-h-[90px] text-[10px] sm:text-[11px] leading-relaxed text-zinc-300">
                {lastCriticLog ? renderMarkdown(lastCriticLog) : <span className="italic text-zinc-500">Awaiting first probe.</span>}
              </div>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <h4 className="text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">Fallacy Ledger</h4>
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-[9px] sm:text-[10px]">
                {TAXONOMY_TACTICS.map((t) => {
                  const isUsed = stateData?.used_tactics.includes(t.id);
                  const isActiveNow = lastTacticFlagged === t.id;
                  return (
                    <div key={t.id} className={`p-1.5 sm:p-2 border transition-all relative ${isActiveNow ? 'border-red-500 bg-red-950/20 text-red-400 font-bold shadow-[0_0_8px_rgba(239,68,68,0.15)]' : isUsed ? 'border-zinc-700 text-zinc-100 bg-zinc-900/40' : 'border-zinc-800 text-zinc-400'}`} title={t.description}>
                      <div className="truncate">{t.name}</div>
                      <div className="text-[7px] sm:text-[8px] text-zinc-500 mt-0.5 uppercase">{isActiveNow ? 'Flagged' : isUsed ? 'Deployed' : 'Unused'}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">Event Feed</h4>
              <div className="space-y-1.5 max-h-[120px] sm:max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                {stateData?.score_history && stateData.score_history.length > 0 ? (
                  stateData.score_history.slice().reverse().map((evt, idx) => (
                    <div key={idx} className="p-1.5 sm:p-2 bg-zinc-900/15 border border-zinc-800 text-[8px] sm:text-[9px] flex justify-between items-start gap-1.5 sm:gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <span className="font-bold text-zinc-200 uppercase">T{evt.turn_count}</span>
                        <p className="text-zinc-400 truncate max-w-[90px] sm:max-w-[130px]">{evt.note || evt.event}</p>
                      </div>
                      <span className={`font-bold font-mono flex-shrink-0 ${evt.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{evt.delta > 0 ? `+${evt.delta}` : evt.delta}</span>
                    </div>
                  ))
                ) : (
                  <span className="italic text-[9px] sm:text-[10px] text-zinc-600">No history yet.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* MOBILE FULL-SCREEN RETINAL SCANNERS DRAWER */}
        {isMobile && showMobileVKDrawer && (
          <div className="fixed inset-0 z-40 flex flex-col bg-[#0d0d12]/98 backdrop-blur-md" onClick={() => setShowMobileVKDrawer(false)}>
            <div className="flex-grow p-4 overflow-y-auto custom-scrollbar pointer-events-auto flex flex-col gap-4" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <span className="text-xs uppercase tracking-widest text-red-500 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span> RETINAL SCANNERS & BIOMETRICS
                </span>
                <button onClick={() => setShowMobileVKDrawer(false)} className="text-zinc-400 text-xs font-mono">[ Close ]</button>
              </div>
              
              {/* Ocular input camera feed / Wireframe */}
              <div className="relative w-full h-48 border border-zinc-800 bg-zinc-950 overflow-hidden">
                <video
                  ref={camera.videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)', display: camera.cameraOn ? 'block' : 'none' }}
                />
                <WireframeScanCanvas active={!camera.cameraOn || camera.loading} isDirectLie={lastDirectLie} />
                {camera.cameraOn && <ScanCircleOverlay isDirectLie={lastDirectLie} bpm={bio.bpm} pupilMm={bio.pupilMm} />}
                
                {!camera.cameraOn && !camera.loading && (
                  <button 
                    onClick={camera.requestPermission}
                    className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 border border-emerald-500 bg-emerald-950/20 text-emerald-400 text-xs font-mono uppercase tracking-wider"
                  >
                    ▶ Request Retinal Link
                  </button>
                )}
                {camera.cameraOn && (
                  <button 
                    onClick={camera.stop}
                    className="absolute bottom-4 right-4 px-3 py-1 border border-red-500 bg-red-950/20 text-red-400 text-xs font-mono uppercase"
                  >
                    ■ Stop Retinal Link
                  </button>
                )}
              </div>
              
              {/* PPG wave */}
              <div className="h-16 w-full border border-zinc-800">
                <PPGWaveformCanvas bpm={bio.bpm} />
              </div>
              
              {/* Biometric Stats */}
              <div className="grid grid-cols-2 gap-4 border border-zinc-800 p-3 bg-zinc-900/10 font-mono">
                <div>
                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest block">Heart Rate</span>
                  <span className="text-lg font-bold text-red-400">♥ {bio.bpm.toFixed(1)} <span className="text-[10px] font-normal text-zinc-500">BPM</span></span>
                </div>
                <div>
                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest block">Pupil Size</span>
                  <span className="text-lg font-bold text-red-400">👁 {bio.pupilMm.toFixed(2)} <span className="text-[10px] font-normal text-zinc-500">MM</span></span>
                </div>
              </div>
              
              {/* HSEmotion bars */}
              <div className="border border-zinc-800 p-3 bg-zinc-900/10">
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2 border-b border-zinc-800 pb-1">HSEmotion Expression Matrix</p>
                <EmotionBars emotions={bio.emotions} />
              </div>
              
              {/* Fallacy Ledger */}
              <div className="border border-zinc-800 p-3 bg-zinc-900/10">
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2 border-b border-zinc-800 pb-1">Fallacy Ledger</p>
                <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono">
                  {TAXONOMY_TACTICS.map((t) => {
                    const isUsed = stateData?.used_tactics.includes(t.id);
                    const isActiveNow = lastTacticFlagged === t.id;
                    return (
                      <div key={t.id} className={`p-1.5 border ${isActiveNow ? 'border-red-500 bg-red-950/20 text-red-400 font-bold' : isUsed ? 'border-zinc-700 text-zinc-100 bg-zinc-900/40' : 'border-zinc-800 text-zinc-400'}`}>
                        <div className="truncate">{t.name}</div>
                        <div className="text-[7px] text-zinc-500 mt-0.5 uppercase">{isActiveNow ? 'Flagged' : isUsed ? 'Deployed' : 'Unused'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`w-full h-full bg-[#050508] text-zinc-100 select-none p-1 ${isSessionActive ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'}`}>
      {isSessionActive ? renderArenaView() : renderSetupView()}
    </div>
  );
};

export default DreadlerArenaScreen;




// ─────────────────────────────────────────────────────────────────────────────
// Voight-Kampff Physiological Scanner
// Self-contained module for DreadlerArenaScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────

type EmotionKey =
  | 'Neutral'
  | 'Happy'
  | 'Sad'
  | 'Surprise'
  | 'Fear'
  | 'Disgust'
  | 'Anger'
  | 'Contempt';

interface EmotionSet extends Record<EmotionKey, number> {}

interface BiometricState {
  bpm: number;
  pupilMm: number;
  coherence: number;
  emotions: EmotionSet;
  cameraOn: boolean;
}

interface VoightKampffConsoleProps {
  isDirectLie?: boolean;
  isTyping?: boolean;
  coherence?: number;
  className?: string;
}

const EMOTION_KEYS: EmotionKey[] = [
  'Neutral',
  'Happy',
  'Sad',
  'Surprise',
  'Fear',
  'Disgust',
  'Anger',
  'Contempt',
];

const EMOTION_COLORS: Record<EmotionKey, string> = {
  Neutral: '#9ca3af',
  Happy: '#22c55e',
  Sad: '#3b82f6',
  Surprise: '#eab308',
  Fear: '#ef4444',
  Disgust: '#a855f7',
  Anger: '#dc2626',
  Contempt: '#f97316',
};

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPermission = useCallback(async () => {
    if (loading || cameraOn) return;
    setLoading(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraOn(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Camera access denied';
      setError(message);
      setCameraOn(false);
    } finally {
      setLoading(false);
    }
  }, [loading, cameraOn]);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return { videoRef, cameraOn, loading, error, requestPermission, stop };
}

// ─────────────────────────────────────────────────────────────────────────────
// Biometric Engine
// ─────────────────────────────────────────────────────────────────────────────

function randInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function jitter(base: number, amp: number): number {
  return base + (Math.random() * 2 - 1) * amp;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpEmotions(
  current: EmotionSet,
  target: EmotionSet,
  t: number
): EmotionSet {
  const out = {} as EmotionSet;
  for (const key of EMOTION_KEYS) {
    out[key] = lerp(current[key], target[key], t);
  }
  return out;
}

function normalizeEmotions(input: EmotionSet): EmotionSet {
  let sum = 0;
  for (const k of EMOTION_KEYS) sum += input[k];
  if (sum <= 0) {
    return { ...input, Neutral: 1 };
  }
  const out = {} as EmotionSet;
  for (const k of EMOTION_KEYS) out[k] = input[k] / sum;
  return out;
}

interface BiometricTargets {
  bpm: number;
  pupilMm: number;
  emotions: EmotionSet;
}

function computeTargets(
  isDirectLie: boolean,
  isTyping: boolean,
  coherence: number
): BiometricTargets {
  let baseBpm: number;
  let basePupil: number;
  let emotions: EmotionSet;

  if (isDirectLie) {
    baseBpm = randInRange(105, 118);
    basePupil = randInRange(6.4, 6.6);
    emotions = {
      Neutral: 0.02,
      Happy: 0.0,
      Sad: 0.04,
      Surprise: randInRange(0.85, 0.95),
      Fear: randInRange(0.9, 0.99),
      Disgust: 0.05,
      Anger: 0.06,
      Contempt: 0.03,
    };
  } else if (isTyping) {
    baseBpm = randInRange(85, 92);
    basePupil = randInRange(4.7, 4.9);
    emotions = {
      Neutral: 0.45,
      Happy: 0.05,
      Sad: 0.08,
      Surprise: 0.12,
      Fear: 0.08,
      Disgust: 0.05,
      Anger: 0.1,
      Contempt: 0.07,
    };
  } else if (coherence < 40) {
    baseBpm = randInRange(90, 95);
    basePupil = randInRange(4.6, 5.0);
    emotions = {
      Neutral: 0.35,
      Happy: 0.04,
      Sad: 0.12,
      Surprise: 0.15,
      Fear: 0.15,
      Disgust: 0.08,
      Anger: 0.07,
      Contempt: 0.04,
    };
  } else {
    // Calm state
    baseBpm = randInRange(72, 76);
    basePupil = randInRange(4.15, 4.25);
    emotions = {
      Neutral: 0.78,
      Happy: 0.08,
      Sad: 0.04,
      Surprise: 0.02,
      Fear: 0.02,
      Disgust: 0.02,
      Anger: 0.02,
      Contempt: 0.02,
    };
  }

  return { bpm: baseBpm, pupilMm: basePupil, emotions: normalizeEmotions(emotions) };
}

function useBiometrics(
  isDirectLie: boolean,
  isTyping: boolean,
  coherence: number
) {
  const [state, setState] = useState<BiometricState>({
    bpm: 74,
    pupilMm: 4.2,
    coherence,
    emotions: {
      Neutral: 0.78,
      Happy: 0.08,
      Sad: 0.04,
      Surprise: 0.02,
      Fear: 0.02,
      Disgust: 0.02,
      Anger: 0.02,
      Contempt: 0.02,
    },
    cameraOn: false,
  });

  const targetRef = useRef<BiometricTargets>(
    computeTargets(isDirectLie, isTyping, coherence)
  );
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = computeTargets(isDirectLie, isTyping, coherence);
  }, [isDirectLie, isTyping, coherence]);

  useEffect(() => {
    const tick = () => {
      setState((prev) => {
        const target = targetRef.current;
        const jitteredBpm = jitter(target.bpm, 1.5);
        const jitteredPupil = jitter(target.pupilMm, 0.05);

        // Smooth approach with micro-fluctuation
        const newBpm = lerp(prev.bpm, jitteredBpm, 0.08);
        const newPupil = lerp(prev.pupilMm, jitteredPupil, 0.08);
        const newEmotions = lerpEmotions(prev.emotions, target.emotions, 0.06);

        return {
          ...prev,
          bpm: newBpm,
          pupilMm: newPupil,
          coherence,
          emotions: newEmotions,
        };
      });
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [coherence]);

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Wireframe Canvas
// ─────────────────────────────────────────────────────────────────────────────

function WireframeScanCanvas({
  active,
  isDirectLie,
}: {
  active: boolean;
  isDirectLie: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const now = performance.now();
      const t = (now - startRef.current) / 1000;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.fillStyle = '#020604';
      ctx.fillRect(0, 0, w, h);

      const baseColor = isDirectLie ? '#ef4444' : '#22c55e';
      const accentColor = isDirectLie ? '#7f1d1d' : '#064e3b';

      // Perspective grid
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1;

      const horizonY = h * 0.55;
      const vanishX = w * 0.5;

      // Horizontal grid lines (perspective)
      const lines = 18;
      for (let i = 0; i <= lines; i++) {
        const p = i / lines;
        const y = horizonY + (h - horizonY) * Math.pow(p, 2);
        ctx.globalAlpha = 0.15 + p * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Vertical converging lines
      const vLines = 24;
      for (let i = 0; i <= vLines; i++) {
        const p = i / vLines;
        const xTop = vanishX + (p - 0.5) * w * 0.3;
        const xBottom = (p - 0.5) * w * 3 + w * 0.5;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(xTop, horizonY);
        ctx.lineTo(xBottom, h);
        ctx.stroke();
      }

      // Scanning sweep line
      const sweepY = horizonY + ((t * 80) % (h - horizonY));
      const grad = ctx.createLinearGradient(0, sweepY - 40, 0, sweepY + 40);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, baseColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = grad;
      ctx.fillRect(0, sweepY - 40, w, 80);

      // Horizontal sweep line
      ctx.globalAlpha = 1;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, sweepY);
      ctx.lineTo(w, sweepY);
      ctx.stroke();

      // Top half: wireframe skull/face placeholder
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1.2;

      const cx = w / 2;
      const cy = horizonY * 0.5;
      const r = Math.min(w, h) * 0.22;

      // Face ellipse
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.75, r, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Eye sockets
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.32, cy - r * 0.15, r * 0.18, r * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.32, cy - r * 0.15, r * 0.18, r * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Pupils (animated)
      const pupilOffset = Math.sin(t * 2) * r * 0.04;
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(cx - r * 0.32 + pupilOffset, cy - r * 0.15, r * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + r * 0.32 + pupilOffset, cy - r * 0.15, r * 0.05, 0, Math.PI * 2);
      ctx.fill();

      // Nose
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - r * 0.08, cy + r * 0.25);
      ctx.lineTo(cx + r * 0.08, cy + r * 0.25);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      // Mouth
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.25, cy + r * 0.55);
      ctx.quadraticCurveTo(cx, cy + r * 0.7 + Math.sin(t * 1.5) * 4, cx + r * 0.25, cy + r * 0.55);
      ctx.stroke();

      // Crosshair
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Status text
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = baseColor;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('NO SIGNAL — RETINAL WIREFRAME ACTIVE', 8, 16);
      ctx.fillText(`SCAN MODE: ${isDirectLie ? 'DECEPTION' : 'BASELINE'}`, 8, 30);
      ctx.fillText(`T+${t.toFixed(1)}s`, 8, h - 10);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isDirectLie]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: active ? 'block' : 'none',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PPG Waveform Canvas
// ─────────────────────────────────────────────────────────────────────────────

function PPGWaveformCanvas({ bpm }: { bpm: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const bpmRef = useRef<number>(bpm);
  const bufferRef = useRef<Float32Array>(new Float32Array(0));
  const phaseRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bufferRef.current = new Float32Array(Math.max(64, Math.floor(rect.width)));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // PPG pulse shape (Gaussian-like waveform with dicrotic notch)
    const pulseShape = (phase: number): number => {
      // phase in [0, 1)
      const p = phase % 1;
      // Systolic peak
      const main = Math.exp(-Math.pow((p - 0.25) / 0.08, 2));
      // Dicrotic notch + wave
      const secondary = 0.35 * Math.exp(-Math.pow((p - 0.55) / 0.12, 2));
      // Small baseline ripple
      const ripple = 0.04 * Math.sin(p * Math.PI * 8);
      return main + secondary + ripple;
    };

    const draw = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      const currentBpm = bpmRef.current;
      const beatsPerSecond = currentBpm / 60;
      phaseRef.current += beatsPerSecond * dt;

      // Shift buffer left (scroll effect)
      const buf = bufferRef.current;
      if (buf.length !== Math.floor(w)) {
        bufferRef.current = new Float32Array(Math.max(64, Math.floor(w)));
      }
      const buffer = bufferRef.current;
      // Move everything left by 1
      for (let i = 0; i < buffer.length - 1; i++) {
        buffer[i] = buffer[i + 1];
      }
      buffer[buffer.length - 1] = pulseShape(phaseRef.current);

      // Clear with slight trail
      ctx.fillStyle = 'rgba(2, 8, 4, 0.55)';
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Centerline
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w, h * 0.5);
      ctx.stroke();

      // Waveform
      const amplitude = h * 0.42;
      const centerY = h * 0.5;

      ctx.strokeStyle = '#22ff88';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = '#22ff88';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < buffer.length; i++) {
        const y = centerY - buffer[i] * amplitude;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Leading dot
      const lastY = centerY - buffer[buffer.length - 1] * amplitude;
      ctx.fillStyle = '#aaffcc';
      ctx.beginPath();
      ctx.arc(buffer.length - 1, lastY, 3, 0, Math.PI * 2);
      ctx.fill();

      // Labels
      ctx.fillStyle = 'rgba(34, 255, 136, 0.7)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('PPG — PLETHYSMOGRAPH', 6, 12);
      ctx.fillText(`${currentBpm.toFixed(1)} BPM`, w - 70, 12);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        background: '#020804',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HSEmotion Bar Charts
// ─────────────────────────────────────────────────────────────────────────────

function EmotionBars({ emotions }: { emotions: EmotionSet }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {EMOTION_KEYS.map((key) => {
        const value = emotions[key] ?? 0;
        const pct = Math.max(0, Math.min(100, value * 100));
        const color = EMOTION_COLORS[key];
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '64px',
                fontSize: '10px',
                fontFamily: 'ui-monospace, monospace',
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {key}
            </span>
            <div
              style={{
                flex: 1,
                height: '8px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '2px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: color,
                  transition: 'width 120ms linear',
                  boxShadow: `0 0 6px ${color}66`,
                }}
              />
            </div>
            <span
              style={{
                width: '38px',
                textAlign: 'right',
                fontSize: '10px',
                fontFamily: 'ui-monospace, monospace',
                color: color,
              }}
            >
              {pct.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan Circle Overlay
// ─────────────────────────────────────────────────────────────────────────────

function ScanCircleOverlay({
  isDirectLie,
  bpm,
  pupilMm,
}: {
  isDirectLie: boolean;
  bpm: number;
  pupilMm: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const start = performance.now();
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.28;
      const color = isDirectLie ? '#ff3344' : '#ff5566';

      // Outer ring
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Tick marks
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * Math.PI * 2;
        const inner = radius + 4;
        const outer = radius + (i % 5 === 0 ? 12 : 7);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.stroke();
      }

      // Rotating sweep arc
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 3;
      const sweepAngle = t * 2.4;
      const grad = ctx.createLinearGradient(
        cx + Math.cos(sweepAngle - 0.6) * radius,
        cy + Math.sin(sweepAngle - 0.6) * radius,
        cx + Math.cos(sweepAngle) * radius,
        cy + Math.sin(sweepAngle) * radius
      );
      grad.addColorStop(0, 'rgba(255,80,100,0)');
      grad.addColorStop(1, color);
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, sweepAngle - 0.6, sweepAngle);
      ctx.stroke();

      // Crosshair
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(cx - radius - 20, cy);
      ctx.lineTo(cx + radius + 20, cy);
      ctx.moveTo(cx, cy - radius - 20);
      ctx.lineTo(cx, cy + radius + 20);
      ctx.stroke();
      ctx.setLineDash([]);

      // Corner brackets
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      const b = radius * 0.9;
      const bl = 14;
      const corners = [
        [cx - b, cy - b, 1, 1],
        [cx + b, cy - b, -1, 1],
        [cx - b, cy + b, 1, -1],
        [cx + b, cy + b, -1, -1],
      ] as const;
      for (const [x, y, dx, dy] of corners) {
        ctx.beginPath();
        ctx.moveTo(x, y + dy * bl);
        ctx.lineTo(x, y);
        ctx.lineTo(x + dx * bl, y);
        ctx.stroke();
      }

      // HUD labels
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('TARGET LOCK', cx - 36, cy - radius - 24);
      ctx.fillText(`BPM ${bpm.toFixed(0)}`, cx - radius - 8, cy - radius - 8);
      ctx.fillText(`PUP ${pupilMm.toFixed(2)}mm`, cx + radius - 60, cy - radius - 8);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isDirectLie, bpm, pupilMm]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Console Component
// ─────────────────────────────────────────────────────────────────────────────

