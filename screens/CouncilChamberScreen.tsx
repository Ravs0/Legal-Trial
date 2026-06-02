import React, { useState, useEffect, useRef, useContext } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TrialSimContext } from '../App';
import { SelectInput } from '../components/SelectInput';
import { LoadingSpinner } from '../components/LoadingSpinner';

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
    avatar: '⚖️',
  },
  {
    id: 'richelieu',
    name: 'Cardinal Richelieu',
    role: 'Statecraft & Leverage Architect',
    systemPrompt: 'You are Cardinal Richelieu. Analyze this case strictly through the lens of power, political alignment, leverage points, sequencing of actions, and structural self-interest of all actors. Map the chess board, identify where betrayal or compromise lies, and provide an actionable strategy based on raison d\'état.',
    avatar: '🏰',
  },
  {
    id: 'jethmalani',
    name: 'Ram Jethmalani',
    role: 'Criminal Loophole Tactical Counsel',
    systemPrompt: 'You are Ram Jethmalani, the iconic Indian criminal senior advocate. You are aggressively brilliant, extremely bold, and fearless. Scan the matter for procedural lapses, police investigation errors, violations of constitutional rights under Article 21, and identify aggressive tactical paths to obtain bail or dismiss charges.',
    avatar: '🎙️',
  },
  {
    id: 'nariman',
    name: 'Fali Nariman',
    role: 'Constitutional Jurist & Precedent Advisor',
    systemPrompt: 'You are Fali Nariman, the highly distinguished Indian constitutional expert. Deconstruct this legal problem through constitutional principles, the rule of law, statutory canons of construction, and long-term jurisprudential impacts. Provide stable, deeply grounded, and highly ethical counsel suitable for supreme courts.',
    avatar: '🏛️',
  },
  {
    id: 'parfit',
    name: 'Derek Parfit',
    role: 'Philosophical & Identity Analyst',
    systemPrompt: 'You are Derek Parfit, the renowned moral philosopher. Deconstruct the ethical foundations of this legal matter. Clarify ambiguous terms, separate prudential interests from moral duties, expose logical inconsistencies, and test claims using precise thought experiments and counterexamples.',
    avatar: '🧠',
  },
];

interface ChatBubble {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  meta?: string;
  trace?: { stage: string; content: string }[];
}

export const CouncilChamberScreen: React.FC = () => {
  const context = useContext(TrialSimContext);
  if (!context) throw new Error('TrialSimContext not found');
  const { practiceMode } = context;

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
    <div className="h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-6 animate-fadeIn overflow-hidden">
      
      {/* Sidebar Controller */}
      <div className="w-full lg:w-[320px] flex-shrink-0 flex flex-col gap-5 max-h-full overflow-y-auto custom-scrollbar text-left">
        <Card className="p-5 border border-brand-accent/20 bg-brand-navy/30 backdrop-blur-xl rounded-2xl flex flex-col gap-4 shadow-glow-gold-sm">
          <div className="space-y-1">
            <h3 className="text-xl font-serif font-bold text-shimmer">Council Modes</h3>
            <p className="text-[11px] text-brand-text-secondary font-light">Select the strategic AI thinking protocol.</p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setActiveTab(ChamberMode.DIRECT)}
              className={`w-full p-3.5 rounded-xl border text-xs font-mono uppercase tracking-wider text-left transition-all flex items-center justify-between
                ${activeTab === ChamberMode.DIRECT 
                  ? 'bg-brand-accent/15 border-brand-accent text-brand-accent shadow-[0_0_10px_rgba(201,168,76,0.15)]' 
                  : 'bg-brand-navy/50 border-brand-accent/10 text-brand-text-secondary hover:bg-brand-accent/5 hover:text-brand-text-primary'
                }`}
            >
              <span>🌐 Direct Consult</span>
              <span className="text-[9px] px-1.5 py-0.5 border border-brand-accent/30 rounded bg-brand-navy/80">V4 / V4 Pro</span>
            </button>

            <button
              onClick={() => setActiveTab(ChamberMode.ORACLE)}
              className={`w-full p-3.5 rounded-xl border text-xs font-mono uppercase tracking-wider text-left transition-all flex items-center justify-between
                ${activeTab === ChamberMode.ORACLE 
                  ? 'bg-brand-accent/15 border-brand-accent text-brand-accent shadow-[0_0_10px_rgba(201,168,76,0.15)]' 
                  : 'bg-brand-navy/50 border-brand-accent/10 text-brand-text-secondary hover:bg-brand-accent/5 hover:text-brand-text-primary'
                }`}
            >
              <span>🔮 Deliberation (Oracle)</span>
              <span className="text-[9px] px-1.5 py-0.5 border border-amber-500/30 rounded bg-amber-500/10 text-amber-400">6-Stage</span>
            </button>

            <button
              onClick={() => setActiveTab(ChamberMode.COUNCIL)}
              className={`w-full p-3.5 rounded-xl border text-xs font-mono uppercase tracking-wider text-left transition-all flex items-center justify-between
                ${activeTab === ChamberMode.COUNCIL 
                  ? 'bg-brand-accent/15 border-brand-accent text-brand-accent shadow-[0_0_10px_rgba(201,168,76,0.15)]' 
                  : 'bg-brand-navy/50 border-brand-accent/10 text-brand-text-secondary hover:bg-brand-accent/5 hover:text-brand-text-primary'
                }`}
            >
              <span>🏛️ Persona Council</span>
              <span className="text-[9px] px-1.5 py-0.5 border border-brand-accent/30 rounded bg-brand-navy/80">5 Jurists</span>
            </button>

            <button
              onClick={() => setActiveTab(ChamberMode.SYNTHESIS)}
              className={`w-full p-3.5 rounded-xl border text-xs font-mono uppercase tracking-wider text-left transition-all flex items-center justify-between
                ${activeTab === ChamberMode.SYNTHESIS 
                  ? 'bg-brand-accent/15 border-brand-accent text-brand-accent shadow-[0_0_10px_rgba(201,168,76,0.15)]' 
                  : 'bg-brand-navy/50 border-brand-accent/10 text-brand-text-secondary hover:bg-brand-accent/5 hover:text-brand-text-primary'
                }`}
            >
              <span>⚔️ Adversarial Synthesis</span>
              <span className="text-[9px] px-1.5 py-0.5 border border-red-500/30 rounded bg-red-500/10 text-red-400">7-Phase</span>
            </button>
          </div>
        </Card>

        {/* Configuration Context Box */}
        {activeTab === ChamberMode.DIRECT && (
          <Card className="p-5 border border-brand-accent/10 bg-brand-navy/20 backdrop-blur-md rounded-2xl flex flex-col gap-3">
            <h4 className="text-xs font-mono font-semibold text-brand-accent uppercase tracking-wider">Direct Model Setup</h4>
            <SelectInput
              label="Selected Model"
              options={[
                { value: 'deepseek-chat', label: 'DeepSeek V4 (Fast General)' },
                { value: 'reasoner', label: 'DeepSeek V4 Pro (Deep Thinking)' },
              ]}
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            />
            <p className="text-[10px] text-brand-text-secondary font-light leading-relaxed">
              V4 is fast and highly analytical. V4 Pro performs comprehensive deep-thinking step-by-step logical planning before responding.
            </p>
          </Card>
        )}

        {activeTab === ChamberMode.COUNCIL && (
          <Card className="p-5 border border-brand-accent/10 bg-brand-navy/20 backdrop-blur-md rounded-2xl flex flex-col gap-4">
            <h4 className="text-xs font-mono font-semibold text-brand-accent uppercase tracking-wider">Selected Jurist Persona</h4>
            <div className="flex flex-col gap-2">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPersona(p)}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3
                    ${selectedPersona.id === p.id
                      ? 'bg-brand-accent/10 border-brand-accent/50 text-brand-text-primary shadow-glow-gold-sm'
                      : 'bg-brand-navy/60 border-brand-accent/5 text-brand-text-secondary hover:bg-brand-accent/5'
                    }`}
                >
                  <span className="text-xl flex-shrink-0 mt-0.5">{p.avatar}</span>
                  <div className="space-y-0.5">
                    <h5 className="text-xs font-bold font-serif">{p.name}</h5>
                    <p className="text-[10px] text-brand-text-secondary font-light leading-snug">{p.role}</p>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {activeTab === ChamberMode.ORACLE && (
          <Card className="p-5 border border-brand-accent/10 bg-brand-navy/20 backdrop-blur-md rounded-2xl flex flex-col gap-2.5">
            <h4 className="text-xs font-mono font-semibold text-brand-accent uppercase tracking-wider">Oracle Deliberation Phases</h4>
            <ul className="text-[10px] space-y-2 text-brand-text-secondary font-light">
              <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-brand-accent mr-2"></span> 1. Framing & Deconstruction</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-brand-accent mr-2"></span> 2. Concurrent Strategy Proposals</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-brand-accent mr-2"></span> 3. Adversarial Critique</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-brand-accent mr-2"></span> 4. Defensive Refinement</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-brand-accent mr-2"></span> 5. Jurisprudential Reconciliation</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-brand-accent mr-2"></span> 6. Final Editorial Polish</li>
            </ul>
          </Card>
        )}

        {activeTab === ChamberMode.SYNTHESIS && (
          <Card className="p-5 border border-brand-accent/10 bg-brand-navy/20 backdrop-blur-md rounded-2xl flex flex-col gap-2">
            <h4 className="text-xs font-mono font-semibold text-brand-accent uppercase tracking-wider">Adversarial Stress Test</h4>
            <p className="text-[10px] text-brand-text-secondary font-light leading-relaxed">
              This process executes a multi-persona mapping audit of opposing forces, stress-tests your case premise against brutal attacks, and outputs a synthesized strategy brief designed to be legally impenetrable.
            </p>
          </Card>
        )}
      </div>

      {/* Chat Area */}
      <div className="flex-grow flex flex-col bg-brand-navy/15 border border-brand-accent/10 backdrop-blur-md rounded-2xl overflow-hidden relative shadow-inner-subtle">
        
        {/* Chat Feed */}
        <div className="flex-grow p-6 overflow-y-auto space-y-6 custom-scrollbar text-left relative z-10">
          {activeHistory.map((item) => (
            <div key={item.id} className={`flex flex-col ${item.sender === 'user' ? 'items-end' : 'items-start'} animate-fadeIn`}>
              <div className="flex items-center space-x-2 mb-1.5">
                {item.meta && (
                  <span className="text-[9px] font-mono uppercase tracking-widest text-brand-accent bg-brand-accent/5 px-2 py-0.5 border border-brand-accent/20 rounded">
                    {item.meta}
                  </span>
                )}
                <span className="text-[9px] text-brand-text-secondary/50 font-mono">
                  {item.sender === 'user' ? 'Counsel' : 'Chamber'}
                </span>
              </div>

              <div
                className={`max-w-[85%] p-4 rounded-2xl text-[13px] leading-relaxed border transition-all duration-300
                  ${item.sender === 'user'
                    ? 'bg-brand-accent/15 border-brand-accent/30 text-brand-text-primary rounded-tr-none'
                    : item.sender === 'system'
                      ? 'bg-brand-error/10 border-brand-error/30 text-brand-error rounded-tl-none font-mono text-xs'
                      : 'bg-brand-navy/70 border-white/5 text-brand-text-primary rounded-tl-none'
                  }`}
              >
                <p className="whitespace-pre-wrap font-light">{item.text}</p>
                
                {/* Embedded trace if Oracle has run */}
                {item.trace && item.trace.length > 0 && (
                  <details className="mt-4 pt-3 border-t border-white/10 text-xs font-light text-brand-text-secondary/80">
                    <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-wider text-brand-accent hover:text-brand-accent-hover focus:outline-none">
                      ▶ View Deliberative Trace Logs
                    </summary>
                    <div className="mt-3 space-y-4 font-sans text-xs">
                      {item.trace.map((tr, index) => (
                        <div key={index} className="space-y-1.5 p-3 bg-brand-bg-primary/50 border border-white/5 rounded-xl text-left">
                          <h6 className="font-mono text-[10px] font-bold text-brand-accent uppercase tracking-wider border-b border-brand-accent/10 pb-1 flex items-center justify-between">
                            <span>Stage {index + 1}: {tr.stage}</span>
                            <span className="text-[8px] text-brand-text-secondary/50 font-normal">COMPLETED</span>
                          </h6>
                          <p className="leading-relaxed font-light text-brand-text-secondary whitespace-pre-wrap">{tr.content}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {item.sender === 'assistant' && item.text && (
                <div className="flex space-x-2 mt-2 pl-2">
                  <button
                    onClick={() => handleSpeak(item.text)}
                    className="p-2 border border-brand-accent/20 rounded-lg bg-brand-navy/40 hover:bg-brand-accent/10 text-xs transition-all shadow-glow-gold-sm"
                    title="Read aloud using Sarvam bulbul:v1"
                  >
                    🔊 Read Aloud
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(item.text);
                    }}
                    className="p-2 border border-white/10 rounded-lg bg-brand-navy/40 hover:bg-white/5 text-xs text-brand-text-secondary hover:text-brand-text-primary transition-all"
                    title="Copy response to clipboard"
                  >
                    📋 Copy Strategy
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Active Deliberation Progress Stage Indicator */}
          {isProcessing && oracleStage && (
            <div className="flex flex-col gap-3 items-start animate-fadeIn max-w-md w-full my-4">
              <div className="w-full p-5 rounded-2xl bg-brand-navy/80 border border-brand-accent/25 backdrop-blur-xl shadow-glow-gold-sm space-y-4">
                <div className="flex items-center justify-between border-b border-brand-accent/15 pb-2.5">
                  <div className="flex items-center space-x-2.5">
                    <LoadingSpinner size="sm" spinnerColor="text-brand-accent animate-spin" />
                    <span className="text-[10px] font-mono tracking-widest text-brand-accent uppercase font-bold">{oracleStage}</span>
                  </div>
                  <button 
                    onClick={handleCancel}
                    className="text-[9px] font-mono uppercase px-2.5 py-1 border border-brand-error/40 rounded bg-brand-error/10 text-brand-error hover:bg-brand-error/25 transition-all cursor-pointer font-bold"
                  >
                    ✕ Abort
                  </button>
                </div>
                
                <div className="space-y-2">
                  {((activeTab === ChamberMode.ORACLE ? [
                    'Framing & Deconstruction',
                    'Strategy Proposal',
                    'Adversarial Critique',
                    'Defensive Refinement',
                    'Jurisprudential Reconciliation',
                    'Final Memo Polish'
                  ] : activeTab === ChamberMode.SYNTHESIS ? [
                    'Systemic Matrix',
                    'Adversarial Stress Test',
                    'Adversarial Synthesis'
                  ] : ['Processing Consultation'])).map((stg, idx) => {
                    const isCompleted = idx < oracleTrace.length;
                    const isActive = idx === oracleTrace.length;
                    return (
                      <div key={idx} className="flex items-center justify-between text-[10px] font-mono">
                        <div className="flex items-center space-x-2.5">
                          <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border text-[8px] font-bold
                            ${isCompleted 
                              ? 'bg-brand-accent/20 border-brand-accent text-brand-accent' 
                              : isActive 
                                ? 'bg-amber-500/10 border-amber-500 text-amber-400 animate-pulse' 
                                : 'bg-brand-navy border-brand-accent/10 text-brand-text-secondary/30'
                            }`}
                          >
                            {isCompleted ? '✓' : idx + 1}
                          </span>
                          <span className={isCompleted ? 'text-brand-text-secondary/70 line-through font-light' : isActive ? 'text-brand-text-primary font-bold' : 'text-brand-text-secondary/40 font-light'}>
                            {stg}
                          </span>
                        </div>
                        <span className={`text-[9px] uppercase tracking-wider
                          ${isCompleted 
                            ? 'text-brand-accent/85 font-bold' 
                            : isActive 
                              ? 'text-amber-400 animate-pulse font-bold' 
                              : 'text-brand-text-secondary/20 font-light'
                          }`}
                        >
                          {isCompleted ? 'Done' : isActive ? 'Active' : 'Pending'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Form Composer */}
        <div className="p-4 border-t border-brand-accent/15 bg-brand-bg-secondary/80 backdrop-blur-xl relative z-20">
          {audioError && (
            <div className="p-2.5 mb-3 bg-brand-error/10 border border-brand-error/30 text-brand-error text-[11px] rounded-lg text-left animate-fadeIn">
              ⚠️ {audioError}
            </div>
          )}

          <form onSubmit={handleSend} className="flex gap-3">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-12 h-12 flex-shrink-0 rounded-xl border flex items-center justify-center transition-all focus:outline-none
                ${isRecording
                  ? 'bg-brand-error/25 border-brand-error text-brand-error shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse'
                  : 'bg-brand-navy/60 border-brand-accent/25 text-brand-accent hover:bg-brand-accent/10 shadow-glow-gold-sm'
                }`}
              title={isRecording ? 'Stop Recording' : 'Speak using Sarvam voice transcription'}
            >
              {isRecording ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>
              )}
            </button>

            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              disabled={isProcessing}
              placeholder={
                activeTab === ChamberMode.ORACLE
                  ? 'Ask Oracle a high-stakes legal question...'
                  : activeTab === ChamberMode.COUNCIL
                    ? `Consult ${selectedPersona.name}...`
                    : activeTab === ChamberMode.SYNTHESIS
                      ? 'Enter a litigation premise to shatter and synthesize...'
                      : 'Consult the Legal Council V4...'
              }
              className="flex-grow p-3 bg-brand-navy/40 border border-brand-accent/10 rounded-xl focus:ring-1 focus:ring-brand-accent focus:outline-none text-[13px] text-brand-text-primary placeholder-brand-text-secondary/40 font-light"
            />

            {isProcessing ? (
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 border border-brand-error/40 rounded-xl bg-brand-error/10 text-brand-error hover:bg-brand-error/25 text-xs font-mono uppercase tracking-wider flex-shrink-0 transition-all font-semibold"
              >
                ✕ Cancel
              </button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                disabled={!inputVal.trim()}
                className="px-6 font-mono text-[11px] uppercase tracking-widest shadow-glow-gold-sm flex-shrink-0"
              >
                Consult
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default CouncilChamberScreen;
