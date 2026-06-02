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
    <div className="w-full h-full flex flex-col overflow-hidden animate-fadeIn">
      
      {/* ========================================================================= */}
      {/* MOBILE APP-STYLE LAYOUT (Phones & Tablets < 1024px)                        */}
      {/* ========================================================================= */}
      <div className="lg:hidden flex flex-col h-[calc(100dvh-5.5rem)] overflow-hidden text-left relative">
        
        {/* Dynamic Mode Dropdown Header */}
        <div className="w-full flex items-center justify-between p-4 border border-brand-accent/25 bg-brand-navy/60 backdrop-blur-xl rounded-2xl mb-4 shadow-glow-gold-sm">
          <div className="space-y-0.5">
            <span className="text-[9px] font-mono uppercase tracking-widest text-brand-accent/80">Select Protocol</span>
            <div className="relative flex items-center gap-1">
              <select 
                value={activeTab} 
                onChange={(e) => setActiveTab(e.target.value as ChamberMode)}
                className="bg-transparent text-sm font-serif font-bold text-brand-text-primary outline-none cursor-pointer pr-4 appearance-none"
              >
                <option value="direct" className="bg-brand-bg-primary text-brand-text-primary">🌐 Direct Consult</option>
                <option value="oracle" className="bg-brand-bg-primary text-brand-text-primary">🔮 Deliberation (Oracle)</option>
                <option value="council" className="bg-brand-bg-primary text-brand-text-primary">🏛️ Persona Council</option>
                <option value="synthesis" className="bg-brand-bg-primary text-brand-text-primary">⚔️ Adversarial Synthesis</option>
              </select>
              <span className="text-brand-accent text-[9px] pointer-events-none">▼</span>
            </div>
          </div>

          {activeTab === ChamberMode.DIRECT && (
            <div className="space-y-0.5 text-right">
              <span className="text-[9px] font-mono uppercase tracking-widest text-brand-accent/80 block">Model</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="p-1 rounded-lg border border-brand-accent/20 bg-brand-navy text-[10px] font-mono text-brand-accent outline-none cursor-pointer"
              >
                <option value="deepseek-chat" className="bg-brand-bg-primary">V4</option>
                <option value="reasoner" className="bg-brand-bg-primary">V4 Pro</option>
              </select>
            </div>
          )}
        </div>

        {/* Mobile Horizontal Carousel for Persona Council */}
        {activeTab === ChamberMode.COUNCIL && (
          <div className="w-full flex flex-col gap-1.5 mb-4 animate-fadeIn">
            <span className="text-[9px] font-mono uppercase tracking-widest text-brand-accent/80 block ml-1">Consult Jurist</span>
            <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar scroll-smooth w-full select-none items-center">
              {PERSONAS.map((p) => {
                const isSelected = selectedPersona.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPersona(p)}
                    className="flex-shrink-0 flex flex-col items-center gap-1 focus:outline-none transition-all"
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all border duration-300 relative
                      ${isSelected 
                        ? 'bg-brand-accent/15 border-brand-accent shadow-[0_0_10px_rgba(201,168,76,0.3)] scale-105' 
                        : 'bg-brand-navy/60 border-brand-accent/10 hover:border-brand-accent/20'
                      }`}
                    >
                      {p.avatar}
                      {isSelected && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-brand-accent text-brand-navy rounded-full border border-brand-navy flex items-center justify-center text-[8px] font-bold">✓</span>
                      )}
                    </div>
                    <span className={`text-[9px] tracking-wide font-mono transition-colors
                      ${isSelected ? 'text-brand-accent font-bold' : 'text-brand-text-secondary/60'}`}
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
        <div className="flex-grow flex flex-col bg-brand-navy/15 border border-brand-accent/10 backdrop-blur-md rounded-2xl overflow-hidden relative shadow-inner-subtle">
          {/* Chat Feed (Mobile) */}
          <div className="flex-grow p-4 overflow-y-auto space-y-4 custom-scrollbar text-left relative z-10">
            {activeHistory.length <= 1 && (
              <div className="p-5 border border-brand-accent/15 bg-brand-navy/35 backdrop-blur-lg rounded-2xl space-y-2 text-left mb-2 animate-fadeIn">
                <h4 className="text-sm font-serif font-bold text-shimmer flex items-center gap-2">
                  <span>⚖️</span>
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
              <div key={item.id} className={`flex flex-col ${item.sender === 'user' ? 'items-end' : 'items-start'} animate-fadeIn`}>
                <div className="flex items-center space-x-1.5 mb-1 text-[8px] font-mono">
                  {item.meta && (
                    <span className="text-brand-accent bg-brand-accent/5 px-1.5 py-0.5 border border-brand-accent/20 rounded">
                      {item.meta}
                    </span>
                  )}
                  <span className="text-brand-text-secondary/50">
                    {item.sender === 'user' ? 'Counsel' : 'Chamber'}
                  </span>
                </div>

                <div
                  className={`max-w-[90%] p-3.5 rounded-xl text-[12px] leading-relaxed border transition-all duration-300
                    ${item.sender === 'user'
                      ? 'bg-brand-accent/15 border-brand-accent/30 text-brand-text-primary rounded-tr-none'
                      : item.sender === 'system'
                        ? 'bg-brand-error/10 border-brand-error/30 text-brand-error rounded-tl-none font-mono text-[11px]'
                        : 'bg-brand-navy/70 border-white/5 text-brand-text-primary rounded-tl-none'
                    }`}
                >
                  <p className="whitespace-pre-wrap font-light">{item.text}</p>
                  
                  {item.trace && item.trace.length > 0 && (
                    <details className="mt-3 pt-2.5 border-t border-white/10 text-[11px] font-light text-brand-text-secondary/80">
                      <summary className="cursor-pointer text-[9px] font-mono uppercase tracking-wider text-brand-accent hover:text-brand-accent-hover focus:outline-none">
                        ▶ View Trace Logs ({item.trace.length})
                      </summary>
                      <div className="mt-2.5 space-y-3 font-sans text-[11px]">
                        {item.trace.map((tr, index) => (
                          <div key={index} className="space-y-1 p-2 bg-brand-bg-primary/50 border border-white/5 rounded-lg text-left">
                            <h6 className="font-mono text-[9px] font-bold text-brand-accent uppercase tracking-wider border-b border-brand-accent/5 pb-0.5">
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
                      className="px-2 py-1 border border-brand-accent/20 rounded bg-brand-navy/40 hover:bg-brand-accent/10 text-[10px] font-mono uppercase tracking-wide text-brand-accent transition-all cursor-pointer"
                    >
                      🔊 Speak
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(item.text)}
                      className="px-2 py-1 border border-white/10 rounded bg-brand-navy/40 hover:bg-white/5 text-[10px] font-mono uppercase tracking-wide text-brand-text-secondary transition-all cursor-pointer"
                    >
                      📋 Copy
                    </button>
                  </div>
                )}
              </div>
            ))}

            {isProcessing && oracleStage && (
              <div className="flex flex-col gap-3 items-start animate-fadeIn max-w-sm w-full my-2">
                <div className="w-full p-4 rounded-xl bg-brand-navy border border-brand-accent/25 backdrop-blur-xl shadow-glow-gold-sm space-y-3 text-left">
                  <div className="flex items-center justify-between border-b border-brand-accent/15 pb-2">
                    <div className="flex items-center space-x-2">
                      <LoadingSpinner size="sm" spinnerColor="text-brand-accent animate-spin" />
                      <span className="text-[9px] font-mono tracking-widest text-brand-accent uppercase font-bold">{oracleStage}</span>
                    </div>
                    <button 
                      onClick={handleCancel}
                      className="text-[8px] font-mono uppercase px-2 py-0.5 border border-brand-error/40 rounded bg-brand-error/10 text-brand-error hover:bg-brand-error/25 transition-all cursor-pointer font-bold"
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
                            <span className={`w-3 h-3 rounded-full flex items-center justify-center border text-[7px] font-bold
                              ${isCompleted ? 'bg-brand-accent/20 border-brand-accent text-brand-accent' : isActive ? 'bg-amber-500/10 border-amber-500 text-amber-400 animate-pulse' : 'bg-brand-navy border-brand-accent/5 text-brand-text-secondary/20'}`}
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
          <div className="p-3 border-t border-brand-accent/15 bg-brand-bg-secondary/90 backdrop-blur-xl relative z-20">
            {audioError && (
              <div className="p-2 mb-2 bg-brand-error/10 border border-brand-error/30 text-brand-error text-[10px] rounded-lg animate-fadeIn text-left">
                ⚠️ {audioError}
              </div>
            )}

            <form onSubmit={handleSend} className="flex gap-2 items-center">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-10 h-10 flex-shrink-0 rounded-full border flex items-center justify-center transition-all focus:outline-none
                  ${isRecording
                    ? 'bg-brand-error/20 border-brand-error text-brand-error animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.25)]'
                    : 'bg-brand-navy/60 border-brand-accent/20 text-brand-accent hover:bg-brand-accent/10 shadow-glow-gold-sm'
                  }`}
                title={isRecording ? 'Stop Recording' : 'Record voice'}
              >
                {isRecording ? (
                  <span className="w-2.5 h-2.5 bg-brand-error rounded-sm animate-ping"></span>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>
                )}
              </button>

              <div className="relative flex-grow flex items-center bg-brand-navy/55 backdrop-blur-md rounded-2xl border border-brand-accent/20 focus-within:ring-1 focus-within:ring-brand-accent transition-all duration-300">
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
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7.5 h-7.5 rounded-xl border border-brand-error/30 bg-brand-error/15 text-brand-error transition-all flex items-center justify-center font-bold"
                    title="Abort consult"
                  >
                    ✕
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputVal.trim()}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7.5 h-7.5 rounded-xl bg-brand-accent disabled:bg-brand-navy/30 text-brand-navy disabled:text-brand-text-secondary/30 transition-all flex items-center justify-center shadow-glow-gold-sm"
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
      <div className="hidden lg:grid grid-cols-12 gap-8 h-[calc(100vh-140px)] w-full overflow-hidden text-left">
        
        {/* Columns 1-4: Strategic Chambers & Setup (Sidebar) */}
        <div className="col-span-4 flex flex-col gap-6 max-h-full overflow-y-auto custom-scrollbar pr-1">
          <Card className="p-6 border border-brand-accent/25 bg-brand-navy/35 backdrop-blur-xl rounded-2xl flex flex-col gap-4.5 shadow-glow-gold-sm relative overflow-hidden group">
            {/* Visual background highlight accent */}
            <div className="absolute -top-16 -right-16 w-32 h-32 bg-brand-accent/5 rounded-full blur-3xl group-hover:bg-brand-accent/10 transition-all duration-700"></div>
            
            <div className="space-y-1">
              <h3 className="text-xl font-serif font-bold text-shimmer flex items-center gap-2">
                <CourtIcon className="h-5 w-5 text-brand-accent" /> Deliberation Chambers
              </h3>
              <p className="text-[11px] text-brand-text-secondary font-light">Select the strategic legal thinking protocol.</p>
            </div>

            <div className="flex flex-col gap-2.5">
              {[
                { value: ChamberMode.DIRECT, title: 'Direct Consult Suite', badge: 'V4 / V4 Pro', desc: 'Secure direct proxy to primary models.', icon: '🌐' },
                { value: ChamberMode.ORACLE, title: 'Deliberation Oracle', badge: '6-Stage', desc: 'Sequential deconstruction, proposal, & critique.', icon: '🔮' },
                { value: ChamberMode.COUNCIL, title: 'Persona Council', badge: '5 Minds', desc: 'Consult customized expert jurists.', icon: '🏛️' },
                { value: ChamberMode.SYNTHESIS, title: 'Adversarial Synthesis', badge: '7-Phase', desc: 'Shatter disputes and build unbreakable strategy.', icon: '⚔️' },
              ].map((m) => {
                const isActive = activeTab === m.value;
                return (
                  <button
                    key={m.value}
                    onClick={() => setActiveTab(m.value)}
                    className={`w-full p-4 rounded-xl border text-left transition-all flex items-start gap-3.5 relative overflow-hidden group/btn
                      ${isActive 
                        ? 'bg-brand-accent/10 border-brand-accent text-brand-accent shadow-[0_0_15px_rgba(201,168,76,0.12)] scale-[1.01]' 
                        : 'bg-brand-navy/40 border-brand-accent/5 text-brand-text-secondary hover:border-brand-accent/30 hover:bg-brand-accent/5 hover:text-brand-text-primary'
                      }`}
                  >
                    <span className="text-2xl mt-0.5">{m.icon}</span>
                    <div className="space-y-0.5 flex-grow pr-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-serif">{m.title}</span>
                        <span className={`text-[8px] font-mono px-1.5 py-0.5 border rounded uppercase
                          ${isActive ? 'border-brand-accent/35 bg-brand-navy text-brand-accent' : 'border-white/10 bg-white/5'}`}>
                          {m.badge}
                        </span>
                      </div>
                      <p className="text-[10px] opacity-75 font-light leading-relaxed">{m.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Dynamic Selection Details (Desktop) */}
          {activeTab === ChamberMode.DIRECT && (
            <Card className="p-6 border border-brand-accent/15 bg-brand-navy/20 backdrop-blur-md rounded-2xl flex flex-col gap-4 animate-fadeIn">
              <h4 className="text-xs font-mono font-semibold text-brand-accent uppercase tracking-widest border-b border-brand-accent/10 pb-1.5">Direct Model Config</h4>
              <SelectInput
                label="Selected Model"
                options={[
                  { value: 'deepseek-chat', label: 'DeepSeek V4 (Fast & High Analytical)' },
                  { value: 'reasoner', label: 'DeepSeek V4 Pro (Deep-Thinking Logic)' },
                ]}
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              />
              <p className="text-[10px] text-brand-text-secondary font-light leading-relaxed">
                DeepSeek V4 provides immediate answers suitable for basic brief structuring and clause edits. V4 Pro performs exhaustive deep-thinking deconstruction before compiling responses.
              </p>
            </Card>
          )}

          {activeTab === ChamberMode.COUNCIL && (
            <Card className="p-6 border border-brand-accent/15 bg-brand-navy/20 backdrop-blur-md rounded-2xl flex flex-col gap-4 animate-fadeIn">
              <h4 className="text-xs font-mono font-semibold text-brand-accent uppercase tracking-widest border-b border-brand-accent/10 pb-1.5">Select Jurist Minds</h4>
              <div className="flex flex-col gap-2.5">
                {PERSONAS.map((p) => {
                  const isSelected = selectedPersona.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPersona(p)}
                      className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3
                        ${isSelected
                          ? 'bg-brand-accent/10 border-brand-accent/50 text-brand-text-primary shadow-glow-gold-sm scale-[1.02]'
                          : 'bg-brand-navy/60 border-brand-accent/5 text-brand-text-secondary hover:border-brand-accent/25'
                        }`}
                    >
                      <span className="text-xl flex-shrink-0 mt-0.5">{p.avatar}</span>
                      <div className="space-y-0.5">
                        <h5 className="text-[11px] font-bold font-serif">{p.name}</h5>
                        <p className="text-[9px] text-brand-text-secondary font-light leading-normal">{p.role}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {activeTab === ChamberMode.ORACLE && (
            <Card className="p-6 border border-brand-accent/15 bg-brand-navy/20 backdrop-blur-md rounded-2xl flex flex-col gap-3 animate-fadeIn">
              <h4 className="text-xs font-mono font-semibold text-brand-accent uppercase tracking-widest border-b border-brand-accent/10 pb-1.5">Deliberation Phase Network</h4>
              <div className="space-y-3.5 text-left text-[10px] text-brand-text-secondary font-light">
                <div className="flex items-start gap-2">
                  <span className="w-4.5 h-4.5 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent flex items-center justify-center font-mono font-bold text-[9px] flex-shrink-0">1</span>
                  <div>
                    <p className="font-bold text-brand-text-primary">Framing & Deconstruction</p>
                    <p className="text-[9px] opacity-75 mt-0.5">Extract core issues, statutory constraints, and unstated assumptions.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4.5 h-4.5 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent flex items-center justify-center font-mono font-bold text-[9px] flex-shrink-0">2</span>
                  <div>
                    <p className="font-bold text-brand-text-primary">Strategy Proposals</p>
                    <p className="text-[9px] opacity-75 mt-0.5">Formulate high-stakes, realistic litigation strategies.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4.5 h-4.5 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent flex items-center justify-center font-mono font-bold text-[9px] flex-shrink-0">3</span>
                  <div>
                    <p className="font-bold text-brand-text-primary">Adversarial Critique (V4 Pro)</p>
                    <p className="text-[9px] opacity-75 mt-0.5">Detect vulnerabilities and logical flaws in proposals.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4.5 h-4.5 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent flex items-center justify-center font-mono font-bold text-[9px] flex-shrink-0">4</span>
                  <div>
                    <p className="font-bold text-brand-text-primary">Defensive Refinement</p>
                    <p className="text-[9px] opacity-75 mt-0.5">Reinforce gaps, compile safeguards, and dismiss counterclaims.</p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {activeTab === ChamberMode.SYNTHESIS && (
            <Card className="p-6 border border-brand-accent/15 bg-brand-navy/20 backdrop-blur-md rounded-2xl flex flex-col gap-2.5 animate-fadeIn">
              <h4 className="text-xs font-mono font-semibold text-brand-accent uppercase tracking-widest border-b border-brand-accent/10 pb-1.5">Adversarial Stress Test</h4>
              <p className="text-[10px] text-brand-text-secondary font-light leading-relaxed">
                A 3-phase high-stakes stressful compilation mapping 24 stakeholder forces, simulating opposing arguments with V4 Pro, and outputting an unbreakable motion defense brief.
              </p>
            </Card>
          )}
        </div>

        {/* Columns 5-12: Interactive Workbench (Chat Feed & Input) */}
        <div className="col-span-8 flex flex-col bg-brand-navy/15 border border-brand-accent/10 backdrop-blur-md rounded-2xl overflow-hidden relative shadow-inner-subtle h-full">
          
          {/* Chat Feed (Desktop) */}
          <div className="flex-grow p-6 overflow-y-auto space-y-6 custom-scrollbar text-left relative z-10">
            
            {/* Workbench Welcome Banner (Desktop) */}
            {activeHistory.length <= 1 && (
              <div className="p-8 border border-brand-accent/15 bg-brand-navy/30 backdrop-blur-lg rounded-3xl flex flex-col md:flex-row items-center gap-6 shadow-glow-gold-sm text-left transition-all duration-300 animate-fadeIn my-4">
                <div className="w-16 h-16 rounded-full border border-brand-accent/20 bg-brand-navy/60 flex items-center justify-center flex-shrink-0 text-brand-accent shadow-[0_0_15px_rgba(201,168,76,0.15)]">
                  {activeTab === ChamberMode.DIRECT ? (
                    <svg className="w-8 h-8 animate-pulse" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  ) : activeTab === ChamberMode.ORACLE ? (
                    <svg className="w-8 h-8 animate-spin-slow" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                      <circle cx={12} cy={12} r={9} strokeDasharray="4 4" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3 15l5.096-.813L9 9l.813 5.187L15 15l-5.187.813z" />
                    </svg>
                  ) : activeTab === ChamberMode.COUNCIL ? (
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m.001-.03c0-.225.012-.447.038-.667A11.944 11.944 0 0112 15c2.17 0 4.207.576 5.963 1.584A6.06 6.06 0 0118 18.722zm-12-1.002a9.094 9.094 0 00-3.741-.479 3 3 0 004.682-2.72m-.94 3.198l-.001.031c0 .225.012.447.037.666A11.944 11.944 0 0012 3c2.17 0 4.207.576 5.963 1.584A6.06 6.06 0 0018 5.278m0 0a9.094 9.094 0 013.741.479 3 3 0 01-4.682 2.72m.94-3.198l.001-.031c0-.225-.012-.447-.037-.666A11.944 11.944 0 0112 3c-2.17 0-4.207.576-5.963 1.584A6.06 6.06 0 016 5.278" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285zM12 5.25a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 20.25a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                    </svg>
                  )}
                </div>
                <div className="space-y-1 bg-transparent">
                  <h4 className="text-base font-serif font-bold text-shimmer">
                    {activeTab === ChamberMode.DIRECT ? 'Direct Consult Suite' : activeTab === ChamberMode.ORACLE ? 'Oracle Deliberation Chamber' : activeTab === ChamberMode.COUNCIL ? 'Council of Historical Jurists' : '7-Phase Adversarial Synthesis'}
                  </h4>
                  <p className="text-[11px] text-brand-text-secondary font-light leading-relaxed max-w-xl">
                    {activeTab === ChamberMode.DIRECT 
                      ? 'Secure direct connection with the latest DeepSeek V4 models. Optimized for quick query responses, direct clarifications, and brief drafting assists.'
                      : activeTab === ChamberMode.ORACLE 
                        ? 'Deliberate strategic defense using the multi-agent deliberation framework. Resolves unstated facts, produces detailed trial strategies, and stress-tests legal positions sequentially.'
                        : activeTab === ChamberMode.COUNCIL
                          ? `Initiate consultations with customized advisors. Select Leibowitz for trial tactics, Richelieu for leverage mappings, Nariman for constitutional advice, or Parfit for ethical analysis.`
                          : 'Mobilize the 7-Phase adversarial synthesis framework. Deconstructs commercial or IBC disputes, simulates prosecution rebuttals, and synthesizes an unbreakable motion strategy.'}
                  </p>
                  {activeTab === ChamberMode.COUNCIL && (
                    <div className="pt-1.5 flex items-center gap-1.5 text-[9px] font-mono text-brand-accent uppercase">
                      <span>Active Persona:</span>
                      <span className="font-bold border border-brand-accent/20 px-2 py-0.5 rounded bg-brand-navy">{selectedPersona.name} ({selectedPersona.role})</span>
                    </div>
                  )}
                </div>
              </div>
            )}

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
                      className="p-2 border border-brand-accent/20 rounded-lg bg-brand-navy/40 hover:bg-brand-accent/10 text-xs transition-all shadow-glow-gold-sm text-brand-accent font-mono uppercase tracking-wide cursor-pointer"
                      title="Read aloud using Sarvam bulbul:v1"
                    >
                      🔊 Speak Advice
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(item.text);
                      }}
                      className="p-2 border border-white/10 rounded-lg bg-brand-navy/40 hover:bg-white/5 text-xs text-brand-text-secondary hover:text-brand-text-primary transition-all font-mono uppercase tracking-wide cursor-pointer"
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
                      ✕ Abort Deliberation
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

          {/* Bottom Input Composer (Desktop) */}
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

    </div>
  );
};

export default CouncilChamberScreen;
