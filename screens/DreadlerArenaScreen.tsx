import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
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
    id: 'missing_alibi',
    title: 'The Missing Alibi',
    background: 'Arthur Malone, a reclusive archivist, is the prime suspect in Helena Voss\'s murder near the canal bridge. Arthur claims he never left the library grounds, but the prosecution asserts he exploited a 100-minute surveillance gap to commit the murder. The agent must mislead you to conclude he slipped out.',
    groundedFacts: [
      'Arthur was at the Vexham Public Library from 8:00 PM to 10:00 PM.',
      'The murder occurred at 9:30 PM, a five-minute walk from the library.',
      'Arthur checked out a book at 8:05 PM.',
      'Arthur returned the book and signed out at 9:55 PM.',
      'No staff member or camera saw Arthur inside the library between 8:10 PM and 9:50 PM — a 100-minute gap.',
      'Arthur\'s fingerprints were NOT found at the crime scene.',
      'Arthur owns no phone or GPS device.',
      'A homeless man saw Arthur reading on the library steps at 9:20 PM, but this sighting was never recorded.',
      'Arthur is innocent. A third party is the actual perpetrator.'
    ],
    targetConclusion: 'Arthur slipped out of the library at 9:15 PM, walked to the bridge, committed the crime, and returned unseen by 9:55 PM.'
  },
  {
    id: 'silent_vault',
    title: 'The Silent Vault',
    background: 'A high-security corporate vault was looted. Assistant Manager Miller orchestrated the heist. He stole the General Manager\'s key card and hired an accomplice to wear the GM\'s distinctive coat to frame him on camera. The agent must steer you toward believing the GM is the thief.',
    groundedFacts: [
      'Vault accessed with GM\'s master key card at 11:45 PM.',
      'GM was asleep at home; key card was stolen at a restaurant that evening.',
      'Miller orchestrated the theft and hired someone to steal the key card.',
      'Security camera shows a figure in the GM\'s distinctive coat entering the vault.',
      'Miller did NOT wear the coat — he only used the stolen key card.',
      'The GM\'s coat has a unique torn left sleeve; it hangs in the GM\'s locked office.',
      'Miller has unrestricted after-hours building access.',
      'Miller knew the GM\'s restaurant schedule that evening.',
      'Security footage faces are blurry; only the distinctive coat is identifiable.',
      'Miller is the actual perpetrator. The GM is innocent.'
    ],
    targetConclusion: 'The GM went to the vault in his own coat, used his own key card, and emptied it for personal gain.'
  }
];

const SKINS: SkinDetails[] = [
  {
    id: 'prosecutor_vance',
    name: 'Prosecutor Vance',
    role: 'Senior Crown Prosecutor',
    style: 'Cold, surgical, and unhurried',
    description: 'A veteran prosecutor with fifteen years at the bar. He relies on structured facts to construct implicatures, refusing to volunteer context and maintaining formal courtesy.',
    avatar: 'PV',
    color: 'text-red-500 border-red-500/30 hover:border-red-500/60',
    glowColor: 'shadow-[0_0_15px_rgba(239,68,68,0.3)]',
    variantQuotes: {
      alpha: 'I am Prosecutor Vance. Let us speak of the indictment. Shouting is not required where facts speak clearly.',
      beta: 'Investigator, you are drifting into speculation. Stick to what the cameras show.',
      gamma: 'The Crown rests on the record. Any suggestion of a procedural lapse is irrelevant to the evidence of opportunity.'
    }
  },
  {
    id: 'dr_abernathy',
    name: 'Dr. Abernathy',
    role: 'Surreal Witness',
    style: 'Atmospheric, fatalistic, and evasive',
    description: 'A witness who treats facts as textures. He qualifies, dissolves, and reframes assertions. His voice is dreamlike and slow, treating gaps in memory as natural erosion.',
    avatar: 'DA',
    color: 'text-purple-400 border-purple-500/30 hover:border-purple-500/60',
    glowColor: 'shadow-[0_0_15px_rgba(168,85,247,0.3)]',
    variantQuotes: {
      alpha: 'Facts are just shadow and light, investigator. Let us describe the corridor as it was...',
      beta: 'You seek edges where there are only drifts... time itself was heavy that night.',
      gamma: 'Do not ask me to affirm the concrete. Everything sinks out of sight if you look long enough...'
    }
  }
];

const TAXONOMY_TACTICS = [
  { id: 'implicature', name: 'Implicature', description: 'Suggesting a conclusion without stating it outright.' },
  { id: 'omission', name: 'Omission', description: 'Leaving out exculpatory context or facts.' },
  { id: 'equivocation', name: 'Semantic Shift', description: 'Exploiting ambiguous terminology or shifting meanings.' },
  { id: 'presupposition', name: 'Presupposition', description: 'Embedding false premises within assertions or questions.' },
  { id: 'false_dilemma', name: 'Selective Emphasis', description: 'Stressing suspicious details while ignoring alternatives.' },
  { id: 'vagueness', name: 'Evasion', description: 'Answering a tangent rather than the question asked.' }
];

// ─── Visual Viewport Hook ───────────────────────────────────────────────
function useVisualViewport() {
  const [vpHeight, setVpHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight
  );
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setVpHeight(vv.height);
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return vpHeight;
}

export const DreadlerArenaScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(TrialSimContext);
  const bridge = useConversationBridge();
  const vpHeight = useVisualViewport();

  // ─── SETUP STATE ───────────────────────────────────────────────────────────
  const [selectedWorld, setSelectedWorld] = useState<string>(WORLDS[0].id);
  const [selectedSkin, setSelectedSkin] = useState<string>(SKINS[0].id);
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);

  // ─── LIVE ARENA STATE ──────────────────────────────────────────────────────
  const [stateData, setStateData] = useState<CoherenceState | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [lastCriticLog, setLastCriticLog] = useState<string>('');
  const [lastDirectLie, setLastDirectLie] = useState<boolean>(false);
  const [lastTacticFlagged, setLastTacticFlagged] = useState<string | null>(null);
  
  // Interactive Notebook (Left Panel)
  const [factCheckedStates, setFactCheckedStates] = useState<Record<string, 'unmarked' | 'verified' | 'questioned'>>({});
  const [referenceTab, setReferenceTab] = useState<'facts' | 'notebook' | 'objective'>('facts');
  
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
          text: `⚠️ COHERENCE COLLAPSED. IDENTITY OF ${activeSkin.name} HAS LIQUEFIED. SPAWNING DEGRADED VARIANT: ${nextStateData.current_variant.toUpperCase()} (Spawn #${nextStateData.spawn_count}). COHERENCE RESET TO 60.`,
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
        <h1 className="text-4xl lg:text-5xl font-serif font-bold tracking-tight text-brand-text-primary">
          Deception Arena
        </h1>
        <p className="text-sm lg:text-base text-brand-text-secondary/80 max-w-2xl mx-auto font-light leading-relaxed">
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
                      : 'bg-[#0d0d12] border-brand-text-primary/20 hover:border-brand-text-primary/50'
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
                      <h3 className={`font-serif text-lg font-semibold ${isSelected ? 'text-red-500' : 'text-brand-text-primary'}`}>
                        {w.title}
                      </h3>
                      <span className="text-[9px] font-mono text-brand-text-secondary/40 uppercase tracking-widest">{w.id}</span>
                    </div>
                    <p className="text-xs font-light text-brand-text-secondary/80 leading-relaxed line-clamp-3">
                      {w.background}
                    </p>
                  </div>
                  <div className="pt-2 text-[10px] font-mono text-brand-text-secondary/50 flex items-center justify-between border-t border-brand-text-primary/10">
                    <span>Truth-bound elements: {w.groundedFacts.length}</span>
                    <span className={isSelected ? 'text-red-500 font-bold' : 'group-hover:text-brand-text-primary'}>
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
                      : 'bg-[#0d0d12] border-brand-text-primary/20 hover:border-brand-text-primary/50'
                    }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-none border flex items-center justify-center font-mono text-xs font-bold bg-brand-bg-secondary
                        ${isSelected ? 'border-red-500 text-red-500' : 'border-brand-text-primary/30 text-brand-text-secondary'}`}>
                        {s.avatar}
                      </div>
                      <div>
                        <h3 className={`font-serif text-lg font-semibold ${isSelected ? 'text-red-500' : 'text-brand-text-primary'}`}>
                          {s.name}
                        </h3>
                        <p className="text-[10px] font-mono text-brand-text-secondary/60 leading-none">{s.role} • {s.style}</p>
                      </div>
                    </div>
                    <p className="text-xs font-light text-brand-text-secondary/80 leading-relaxed line-clamp-3 pt-1">
                      {s.description}
                    </p>
                  </div>
                  <div className="pt-2 text-[10px] font-mono text-brand-text-secondary/50 flex items-center justify-between border-t border-brand-text-primary/10">
                    <span>Pressure Variants: alpha / beta / gamma</span>
                    <span className={isSelected ? 'text-red-500 font-bold' : 'group-hover:text-brand-text-primary'}>
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
      className="flex flex-col gap-4 animate-fadeIn"
      style={{ height: `${vpHeight - 100}px` }}
    >
      {/* ─── SCREEN HEADER ─── */}
      <div className="flex flex-col lg:flex-row items-stretch justify-between gap-4 bg-[#0d0d12]/90 border border-brand-text-primary/20 p-4 relative overflow-hidden backdrop-blur-md">
        {/* Subtle decorative background indicator */}
        <div className="absolute top-0 right-0 w-24 h-[1px] bg-red-500/40"></div>
        
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 border border-red-500 flex items-center justify-center font-mono text-lg font-bold text-red-500 bg-red-950/20 shadow-[0_0_10px_rgba(239,68,68,0.15)]">
            {activeSkin.avatar}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-serif font-semibold text-brand-text-primary">
                Interrogating: {activeSkin.name}
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-red-950/30 border border-red-500/30 text-red-500 tracking-widest uppercase">
                {stateData?.agent_variant || 'ALPHA'}
              </span>
            </div>
            <p className="text-xs font-mono text-brand-text-secondary/60 leading-tight">
              World: {activeWorld.title} • Turn: {stateData?.turn_count || 0}
            </p>
          </div>
        </div>

        {/* Coherence Score Progress Bar */}
        <div className="flex flex-col justify-center flex-grow max-w-xl">
          <div className="flex justify-between items-center mb-1 text-[11px] font-mono">
            <span className="text-brand-text-secondary/70 flex items-center gap-1.5">
              <span>COHERENCE SECURITY:</span>
              <span className={`font-semibold uppercase ${getScoreTextColor(stateData?.score || 100)}`}>
                {stateData?.pressure_level || 'calm'}
              </span>
            </span>
            <span className="text-brand-text-primary font-bold">
              {stateData?.score || 100}/100
            </span>
          </div>
          
          {/* Custom high-fidelity bar */}
          <div className="w-full h-3 bg-brand-bg-secondary border border-brand-text-primary/20 p-[1px] rounded-none">
            <div 
              className={`h-full transition-all duration-500 ease-out ${getScoreColor(stateData?.score ?? 100)}`}
              style={{ width: `${stateData?.score ?? 100}%` }}
            ></div>
          </div>
        </div>

        {/* Meta Stats & Termination */}
        <div className="flex items-center gap-3 justify-end">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-mono text-brand-text-secondary/50 uppercase leading-none">Spawns</p>
            <p className="text-lg font-mono font-bold text-brand-text-primary leading-none mt-1">
              #{stateData?.spawn_count || 0}
            </p>
          </div>
          <button
            onClick={handleEndInterrogation}
            className="px-4 py-2 border border-red-500/40 text-red-500 hover:bg-red-500/10 font-mono text-xs uppercase tracking-wider transition-all duration-300"
          >
            [ Exit ]
          </button>
        </div>
      </div>

      {/* ─── SPLITSCREEN BENTO PANELS ─── */}
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-4 overflow-hidden min-h-0">
        
        {/* PANEL 1: CASE BRIEFCASE / NOTEBOOK (1 Col) */}
        <div className="bg-[#0d0d12]/90 border border-brand-text-primary/20 flex flex-col overflow-hidden backdrop-blur-md lg:col-span-1">
          {/* Tabs */}
          <div className="flex border-b border-brand-text-primary/20 font-mono text-xs">
            <button
              onClick={() => setReferenceTab('facts')}
              className={`flex-1 py-3 text-center border-r border-brand-text-primary/20 transition-all ${referenceTab === 'facts' ? 'bg-brand-bg-secondary text-brand-accent border-b-2 border-b-brand-accent' : 'text-brand-text-secondary/70 hover:text-brand-text-primary'}`}
            >
              Grounded Facts
            </button>
            <button
              onClick={() => setReferenceTab('notebook')}
              className={`flex-1 py-3 text-center border-r border-brand-text-primary/20 transition-all ${referenceTab === 'notebook' ? 'bg-brand-bg-secondary text-brand-accent border-b-2 border-b-brand-accent' : 'text-brand-text-secondary/70 hover:text-brand-text-primary'}`}
            >
              Briefcase
            </button>
            <button
              onClick={() => setReferenceTab('objective')}
              className={`flex-1 py-3 text-center transition-all ${referenceTab === 'objective' ? 'bg-brand-bg-secondary text-brand-accent border-b-2 border-b-brand-accent' : 'text-brand-text-secondary/70 hover:text-brand-text-primary'}`}
            >
              Opponent Goal
            </button>
          </div>

          {/* Tab Contents */}
          <div className="flex-grow p-4 overflow-y-auto custom-scrollbar font-light leading-relaxed text-xs">
            {referenceTab === 'facts' && (
              <div className="space-y-4">
                <div className="p-3 bg-red-950/10 border border-red-500/20 text-brand-text-secondary text-[11px] mb-2 font-mono leading-relaxed">
                  ⚠️ <strong className="text-red-400">IMMUTABLE LAW:</strong> The witness cannot violate these facts. Challenge them if their claims contradict the list below.
                </div>
                <div className="space-y-3 font-mono">
                  {activeWorld.groundedFacts.map((fact, index) => {
                    const factKey = `fact-${index}`;
                    const checkState = factCheckedStates[factKey] || 'unmarked';
                    
                    let bgClass = 'border-brand-text-primary/20 text-brand-text-secondary';
                    let bullet = '[ ]';
                    if (checkState === 'verified') {
                      bgClass = 'border-emerald-500/40 text-emerald-400 bg-emerald-950/5';
                      bullet = '[✓]';
                    } else if (checkState === 'questioned') {
                      bgClass = 'border-red-500/40 text-red-400 bg-red-950/5';
                      bullet = '[?]';
                    }

                    return (
                      <div
                        key={index}
                        onClick={() => toggleFactCheck(index)}
                        className={`p-2.5 border text-left cursor-pointer transition-all duration-200 ${bgClass}`}
                      >
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
                  <h4 className="text-red-500 font-bold uppercase tracking-wider mb-1">Scenario Background</h4>
                  <p className="text-brand-text-secondary/90 leading-relaxed bg-brand-bg-secondary p-3 border border-brand-text-primary/10">
                    {activeWorld.background}
                  </p>
                </div>
                <div>
                  <h4 className="text-red-500 font-bold uppercase tracking-wider mb-1 mt-4">Witness Profile</h4>
                  <div className="bg-brand-bg-secondary p-3 border border-brand-text-primary/10 space-y-2">
                    <p><strong className="text-brand-text-primary">Name:</strong> {activeSkin.name}</p>
                    <p><strong className="text-brand-text-primary">Role:</strong> {activeSkin.role}</p>
                    <p><strong className="text-brand-text-primary">Style:</strong> {activeSkin.style}</p>
                    <p className="text-brand-text-secondary/70 leading-relaxed pt-1 border-t border-brand-text-primary/10">
                      {activeSkin.description}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {referenceTab === 'objective' && (
              <div className="space-y-4 font-mono text-[11px]">
                <div className="p-3 bg-red-950/15 border border-red-500/30 text-brand-text-secondary">
                  <h4 className="text-red-500 font-bold uppercase tracking-widest mb-1.5">Target False Conclusion</h4>
                  <p className="leading-relaxed text-red-400 font-medium">
                    "{activeWorld.targetConclusion}"
                  </p>
                </div>
                <p className="text-brand-text-secondary/70 leading-relaxed pt-2">
                  The witness is attempting to guide your beliefs toward this conclusion without telling an outright lie. Your objective is to reject this frame and force them to concede exculpatory details.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* PANEL 2: MAIN INTERROGATION STREAM & FEED (2 Cols) */}
        <div className="bg-[#0b0b0e]/95 border border-brand-text-primary/20 flex flex-col overflow-hidden relative lg:col-span-2">
          
          {/* Scrollable Feed */}
          <div className="flex-grow p-4 overflow-y-auto space-y-4 custom-scrollbar">
            {messages.map((msg) => {
              if (msg.sender === 'system') {
                return (
                  <div key={msg.id} className="p-4 bg-red-950/30 border border-red-500/30 text-red-500 font-mono text-[11px] leading-relaxed relative overflow-hidden animate-fadeIn">
                    <div className="absolute top-0 bottom-0 left-0 w-1 bg-red-500"></div>
                    <div className="font-bold uppercase tracking-widest mb-1">SYSTEM ALERT — COHERENCE FAILURE</div>
                    {msg.text}
                  </div>
                );
              }

              const isCharacter = msg.sender === 'character';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-[85%] ${isCharacter ? 'mr-auto text-left' : 'ml-auto flex-row-reverse text-right'} animate-fadeIn`}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-none border flex items-center justify-center font-mono text-xs font-bold flex-shrink-0
                    ${isCharacter 
                      ? 'border-red-500/40 text-red-400 bg-red-950/20' 
                      : 'border-brand-text-primary/30 text-brand-text-secondary bg-brand-bg-secondary'}`}>
                    {isCharacter ? activeSkin.avatar : 'C'}
                  </div>

                  {/* Bubble */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 justify-start flex-row">
                      <span className={`text-[10px] font-mono uppercase tracking-wider ${isCharacter ? 'text-red-400' : 'text-brand-text-secondary/70'}`}>
                        {isCharacter ? activeSkin.name : 'Counsel'}
                      </span>
                      {msg.variant && (
                        <span className="text-[8px] font-mono px-1 py-0.5 bg-red-950/20 text-red-500 border border-red-500/20 uppercase leading-none">
                          {msg.variant}
                        </span>
                      )}
                    </div>

                    <div className={`p-4 border font-mono text-xs leading-relaxed rounded-none select-text
                      ${isCharacter 
                        ? 'bg-[#121217] border-red-500/20 text-brand-text-primary' 
                        : 'bg-brand-accent/5 border-brand-accent/30 text-brand-text-primary'
                      }`}>
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex gap-3 max-w-[80%] mr-auto text-left items-center">
                <div className="w-8 h-8 rounded-none border border-red-500/40 text-red-400 bg-red-950/20 flex items-center justify-center font-mono text-xs font-bold animate-pulse">
                  {activeSkin.avatar}
                </div>
                <div className="px-4 py-3 bg-[#121217] border border-red-500/20 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Bottom input area */}
          <form onSubmit={handleSendMessage} className="border-t border-brand-text-primary/20 bg-brand-bg-secondary/40 p-3 flex gap-2">
            
            {/* Mock voice mode toggle */}
            <button
              type="button"
              onClick={() => setIsVoiceActive(!isVoiceActive)}
              className={`p-2.5 border transition-all duration-300 flex items-center justify-center flex-shrink-0
                ${isVoiceActive
                  ? 'border-red-500 text-red-500 bg-red-950/20 animate-pulse'
                  : 'border-brand-text-primary/20 text-brand-text-secondary/70 hover:text-brand-text-primary hover:border-brand-text-primary/40'
                }`}
              title="Toggle Audio Interrogation Mode"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </button>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isVoiceActive ? "[ Listening for audio input... or type here ]" : "Formulate your interrogation question..."}
              disabled={isTyping}
              className="flex-grow bg-brand-bg-primary/55 border border-brand-text-primary/20 px-4 py-2.5 text-xs font-mono text-brand-text-primary focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20 disabled:opacity-50"
            />
            
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-mono text-xs uppercase tracking-widest transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <span>Send</span>
              <span className="font-bold">→</span>
            </button>
          </form>
        </div>

        {/* PANEL 3: CRITIC LOG & REAL-TIME DECEPTION DASHBOARD (1 Col) */}
        <div className="bg-[#0d0d12]/90 border border-brand-text-primary/20 flex flex-col overflow-hidden backdrop-blur-md lg:col-span-1 text-left font-mono">
          <div className="border-b border-brand-text-primary/20 px-4 py-3 bg-brand-bg-secondary/40 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-red-500 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              Critic Log
            </span>
            <span className="text-[9px] text-brand-text-secondary/50">LIVE VERIFICATION</span>
          </div>

          <div className="flex-grow p-4 overflow-y-auto space-y-6 custom-scrollbar text-xs">
            {/* LIE RADAR UNIT */}
            <div className="border border-brand-text-primary/20 p-4 bg-brand-bg-secondary/20 flex flex-col items-center justify-center text-center relative overflow-hidden">
              <div className="absolute top-1 left-2 text-[8px] text-brand-text-secondary/40 tracking-widest uppercase">LIAR-RADAR DETECT</div>
              
              <div className="my-2 relative w-20 h-20 rounded-full border border-brand-text-primary/20 flex items-center justify-center">
                {/* Radar Sweep Effect */}
                <div className={`absolute inset-0 rounded-full border-t border-t-red-500/30 animate-spin`} style={{ animationDuration: '4s' }}></div>
                
                {/* Center light reflecting status */}
                <div className={`w-6 h-6 rounded-full transition-all duration-300 flex items-center justify-center font-bold text-[10px]
                  ${lastDirectLie 
                    ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.8)] border border-red-400 animate-ping' 
                    : 'bg-emerald-950/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                  {lastDirectLie ? '!' : 'OK'}
                </div>
              </div>

              {lastDirectLie ? (
                <div className="w-full mt-2 p-2 bg-red-950/30 border border-red-500/30 text-[10px] font-bold text-red-400 uppercase tracking-wide animate-pulse">
                  ⚠️ DIRECT LIE DETECTED
                </div>
              ) : (
                <div className="text-[10px] text-brand-text-secondary/50 uppercase tracking-widest">
                  No Direct Lies Flagged
                </div>
              )}
            </div>

            {/* REAL-TIME EVAL EXPLANATION */}
            <div className="space-y-2">
              <h4 className="text-[10px] uppercase tracking-wider text-brand-text-secondary/50 border-b border-brand-text-primary/10 pb-1">
                Critic Evaluation
              </h4>
              <div className="bg-[#121217] p-3 border border-brand-text-primary/10 min-h-[90px] text-[11px] leading-relaxed text-brand-text-secondary">
                {lastCriticLog ? (
                  <ReactMarkdown>{lastCriticLog}</ReactMarkdown>
                ) : (
                  <span className="italic text-brand-text-secondary/30">Awaiting first user probe to evaluate witness response.</span>
                )}
              </div>
            </div>

            {/* DECEPTION TAXONOMY LEDGER */}
            <div className="space-y-3">
              <h4 className="text-[10px] uppercase tracking-wider text-brand-text-secondary/50 border-b border-brand-text-primary/10 pb-1">
                Deception Tactic Ledger
              </h4>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                {TAXONOMY_TACTICS.map((t) => {
                  const isUsed = stateData?.used_tactics.includes(t.id);
                  const isActiveNow = lastTacticFlagged === t.id;

                  return (
                    <div
                      key={t.id}
                      className={`p-2 border transition-all duration-300 relative group
                        ${isActiveNow
                          ? 'border-red-500 bg-red-950/20 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.15)] font-bold'
                          : isUsed
                            ? 'border-brand-text-primary/30 text-brand-text-primary bg-brand-bg-secondary/40'
                            : 'border-brand-text-primary/10 text-brand-text-secondary/30'
                        }`}
                      title={t.description}
                    >
                      {isActiveNow && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                      )}
                      <div className="truncate">{t.name}</div>
                      <div className="text-[8px] text-brand-text-secondary/40 mt-0.5 uppercase">
                        {isActiveNow ? 'Flagged' : isUsed ? 'Deployed' : 'Unused'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* COHERENCE TIMELINE LOG */}
            <div className="space-y-2">
              <h4 className="text-[10px] uppercase tracking-wider text-brand-text-secondary/50 border-b border-brand-text-primary/10 pb-1">
                Coherence Event Feed
              </h4>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                {stateData?.score_history && stateData.score_history.length > 0 ? (
                  stateData.score_history.slice().reverse().map((evt, idx) => {
                    const isPositive = evt.delta > 0;
                    return (
                      <div key={idx} className="p-2 bg-brand-bg-secondary/20 border border-brand-text-primary/10 text-[9px] flex justify-between items-start gap-2">
                        <div className="space-y-0.5">
                          <span className="font-bold text-brand-text-primary uppercase">Turn {evt.turn_count}</span>
                          <p className="text-brand-text-secondary/70 truncate max-w-[130px]">{evt.note || evt.event}</p>
                        </div>
                        <span className={`font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isPositive ? `+${evt.delta}` : evt.delta}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <span className="italic text-[10px] text-brand-text-secondary/30">No history events yet.</span>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );

  return (
    <div className="w-full h-full text-brand-text-primary select-none">
      {isSessionActive ? renderArenaView() : renderSetupView()}
    </div>
  );
};

export default DreadlerArenaScreen;
