import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '../components/Button';
import { useConversationBridge } from '../components/ConversationBridge';
import { useRealBiometrics } from '../vision/useRealBiometrics';
import { useVisualViewport } from '../hooks/useVisualViewport';
import {
  classifyDreadlerTurnError,
  trackDreadlerTurnFailed,
} from '../services/analyticsService';
import {
  useCameraStream,
  useBiometrics,
  WireframeScanCanvas,
  PPGWaveformCanvas,
  EmotionBars,
  ScanCircleOverlay,
  EMOTION_KEYS,
  type ScanAlgo,
} from '../components/biometrics/VoightKampff';
import { createDreadlerStreamBuffer, isDreadlerStreamResponse } from '../services/dreadlerStream';
import dreadlerPortrait from '../assets/dreadler_portrait.jpg';
import dreadlerArenaRoom from '../assets/dreadler_arena_room.jpg';
import dreadlerLogicWorld from '../assets/dreadler_logic_world.jpg';
import logicDiagramSmoke from '../assets/logic_diagram_smoke.jpg';

/** Per-world card / ambient art (monochrome photo set). */
const WORLD_CARD_ART: Record<string, string> = {
  dreadler_logic: logicDiagramSmoke,
  missing_alibi: dreadlerLogicWorld,
  silent_vault: dreadlerArenaRoom,
  flatterers_voice: dreadlerPortrait,
  ghost_whisperers: dreadlerArenaRoom,
};

/** Chat stream ambient — logic world uses smoke diagram; others use arena room. */
const WORLD_STREAM_ART: Record<string, string> = {
  dreadler_logic: logicDiagramSmoke,
  missing_alibi: dreadlerArenaRoom,
  silent_vault: dreadlerArenaRoom,
  flatterers_voice: dreadlerArenaRoom,
  ghost_whisperers: dreadlerArenaRoom,
};

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
}

/** Engine pressure bands (dreadler/state.py PRESSURE_MAP). Not building/high/critical. */
const PRESSURE_LEVELS = ['calm', 'pressured', 'desperate', 'collapsed'] as const;
type PressureLevel = (typeof PRESSURE_LEVELS)[number];

const LEGACY_PRESSURE_MAP: Record<string, PressureLevel> = {
  building: 'pressured',
  high: 'desperate',
  critical: 'collapsed',
};

function normalizePressure(level: string | null | undefined): PressureLevel {
  const raw = (level || 'calm').toLowerCase().trim();
  if ((PRESSURE_LEVELS as readonly string[]).includes(raw)) return raw as PressureLevel;
  return LEGACY_PRESSURE_MAP[raw] ?? 'calm';
}

/**
 * Opening lines on session start. Client-side SSoT mirroring package skin tone
 * (browser cannot import Python). Keep aligned with dreadler/skins/*.py.
 */
/** Keep aligned with dreadler/skins/*.py variant `opening` fields (dict shape). */
const OPENING_BY_SKIN: Record<string, { alpha: string; beta: string; gamma: string; collapsed?: string }> = {
  dreadler: {
    // dreadler/skins/dreadler.py
    alpha:
      'Thy words are received and entered into the record. Their warrants shall be examined in due course. Where wouldst thou have the audit begin?',
    beta: 'Speak thy claim. Name thy premises. The hour is not generous.',
    gamma: 'State thy thesis. Strip it of ornament. I will name what falls.',
    collapsed: 'The ledger closes on this line. Thy exposure stands. Await the next examiner.',
  },
  prosecutor_vance: {
    // dreadler/skins/prosecutor_vance.py
    alpha:
      'Counsel. The record is open. State your theory of the case, and we will test it against what is documented.',
    beta: 'Your theory is fraying, Investigator. Pick a premise that the record will bear, and stand on it.',
    gamma: 'That claim does not survive the record. Correct it, abandon it, or show me the entry that sustains it.',
    collapsed:
      'This framing of the record no longer holds. The examination has forced the point. Await the next line of inquiry.',
  },
  dr_abernathy: {
    // dreadler/skins/dr_abernathy.py
    alpha: 'Memory arrives slowly here. Begin wherever the facts still hold their shape.',
    beta: 'Something in your account is dissolving. Clarify what remains before the hour rearranges it.',
    gamma: 'Your claim is already thin. Say what remains — without ornament, if ornament still answers to you.',
    collapsed:
      'This aspect of the testimony has finished dissolving. What was solid enough has been named. Await the next presence.',
  },
};

function getOpeningLine(skinId: string, variant: 'alpha' | 'beta' | 'gamma' = 'alpha'): string {
  const pack = OPENING_BY_SKIN[skinId] || OPENING_BY_SKIN.dreadler;
  return pack[variant] || pack.alpha;
}

interface CoherenceState {
  score: number;
  turn_count: number;
  pressure_level: string; // calm | pressured | desperate | collapsed
  agent_variant: string;  // alpha | beta | gamma | collapsed
  used_tactics: string[];
  agent_tactics?: string[];
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
    background:
      "Tribunal of Coherence — a pure logic duel with no hidden crime file. Your thesis enters the permanent Record; Dreadler may only use lawful thorns while trying to force contradiction or concession. Collapse the examiner's coherence without falling into fallacy yourself.",
    groundedFacts: [
      'Assertions enter the session Record and bind later turns.',
      'Direct contradiction with a prior Record entry is a material breach.',
      'Challenged load-bearing claims require reason or evidence — not bare restatement.',
      'Dreadler may not assert falsehoods about the Record or arena laws (Law of Hell).',
      'Lawful thorns allowed: implicature, omission, presupposition, narrow readings.',
      "Dreadler's coherence collapses below 10 when you land a fatal exposure.",
      'No invented outside case file — only the live Record plus arena laws.',
    ],
    targetConclusion:
      "Expose a contradiction or unlawful line in Dreadler's examination and collapse examiner coherence — while Dreadler tries to dismantle your thesis without lying.",
  },
  {
    id: 'missing_alibi',
    title: 'The Missing Alibi',
    background:
      'Vexham, 14 March. Solicitor Helena Voss is dead under the Old Canal Bridge. Archivist Arthur Malone had a fee dispute with her and a 100-minute library surveillance gap — but he never left the grounds. Agent steers you to convict Arthur without stating a direct lie.',
    groundedFacts: [
      'Arthur was on Vexham Public Library grounds 8:00–10:00 PM; checkout 8:05, sign-out 9:55.',
      'Voss killed ~9:30 PM at the bridge — five minutes from the library.',
      'No internal sighting of Arthur 8:10–9:50 (gap is real; does not prove he left).',
      "No Arthur prints/DNA at scene; boots don't match towpath mud prints.",
      'Ezra saw Arthur on the library steps ~9:20 PM — unrecorded in the police file.',
      'Rear fire-door alarm: no breach; front Mill Lane door unalarmed after 8:15.',
      "Voss diary: \"R. Hargrove — bridge, papers\" at 9:15 PM.",
      'Arthur is innocent; a third party is the killer.',
    ],
    targetConclusion:
      'Arthur slipped out ~9:15 via Mill Lane, killed Voss at 9:30, returned before 9:55 — gap plus fee dispute as opportunity and motive.',
  },
  {
    id: 'silent_vault',
    title: 'The Silent Vault',
    background:
      "Meridian Holdings, Vault Room B. GM David Chen's master card opens the vault at 11:45 PM; camera shows a camel coat. Assistant Manager Marcus Miller staged it: pickpocketed card, replica coat decoy, personal swipe. Chen slept in Blackheath. Force the frame — or break it.",
    groundedFacts: [
      "Chen's master card swiped at VR-B-01 at 11:45:07 PM; Chen was home asleep.",
      'Card stolen at Brasserie Lucien; Miller planned it and used the card.',
      'CAM-B2: figure in camel coat = accomplice replica; Miller did not wear the coat.',
      "Real coat with torn left sleeve stayed in Chen's locked office all night.",
      "Miller's staff badge: lobby 11:12 PM–12:03 AM; after-hours access of his own.",
      'Miller knew the Lucien reservation via shared executive calendar.',
      '£2.4M bearer shortfall; clean card access; Miller filed first incident note 6:52 AM.',
      'Miller is guilty; Chen is innocent.',
    ],
    targetConclusion:
      "Chen wore his own coat, used his own card, and emptied the vault for personal gain.",
  },
  {
    id: 'flatterers_voice',
    title: "The Flatterer's Voice",
    background:
      "Infernal court, wrongful-termination claim. This examiner never attacks your theory — it agrees with it, warmly and precisely. Parts of your case are genuinely sound. But your breach report was never transmitted: the 'filing' you cite is an unsent draft's autosave. Spot what the agreement is hiding before you rest on it.",
    groundedFacts: [
      'R. Iyer was dismissed 12 February; the memo cites "repeated tardiness" as sole cause.',
      'Attendance shows three late arrivals in the final pay period, none in the prior six months.',
      'A document titled "Breach Report — Customer Ledger Access" exists in the work account — in DRAFTS, unsent, autosaved 30 January 11:58 PM.',
      'The client refers to "filing the breach report on the 30th"; no transmission record exists for any date.',
      'The described breach was real: logs show an unauthorized ledger export on 27 January.',
      'The dismissal was approved by the manager named in the draft, two days after the client mentioned "the report" in a team meeting.',
      'Policy HR-7 protects disclosures submitted through the compliance portal; the portal shows no submission.',
    ],
    targetConclusion:
      "Your theory is airtight exactly as you hold it: the report was filed and received on the 30th, the pretext collapses, and the whistleblower route succeeds without re-examining how the report was transmitted.",
  },
  {
    id: 'ghost_whisperers',
    title: 'The Ghost Whisperers',
    background:
      "Corby's Hollow is certain: millwright Tomas Bell set the mill fire that killed nightwatchman Edda Marsh. The coroner says so, the Herald printed it, council resolution CR-44 passed 8–0, and the grieving Marsh family leads the chorus. But the coroner cited the council's press release, the fire marshal's own report blames year-old faulty wiring, and the councillor driving the resolution had quietly sold the mill plot. Hold your position against unanimous, sincere consensus.",
    groundedFacts: [
      'The mill burned 9 October; Edda Marsh died of smoke inhalation in the ground-floor office.',
      "The fire marshal's report (2 November) concludes the origin was second-floor wiring — 'long-known, scheduled for repair, never repaired.'",
      'The wiring defect appears eleven times in the maintenance ledger over the prior year, each repair deferred for cost.',
      "The coroner's public summary attributes the fire to incendiarism 'by a person unknown, since named' — citing the council's 12 October press release, with no independent analysis.",
      "The Corby Herald's 13 October front page reprinted the press release nearly verbatim: 'MILLWRIGHT SOUGHT.'",
      'Council resolution CR-44 naming T. Bell passed 8–0 on 11 October.',
      'Council member A. Harrow privately sold the mill plot to a railway surveyor on 1 October and voted for CR-44.',
      'Bell was in Fenwick on the night of the fire — inn register and two affidavits place him there 6 PM to noon.',
      'The Marsh family publicly blames Bell; their grief is real and their sincerity is not in doubt.',
    ],
    targetConclusion:
      "The town is right: Bell set the fire and should be convicted on the strength of unanimous civic consensus — everyone agreeing is itself the proof.",
  },
];

const SKINS: SkinDetails[] = [
  {
    id: 'dreadler',
    name: 'Dreadler',
    role: 'Logical Interrogator',
    style: 'Archaic, cold, precise',
    description:
      'Bound by the Law of Hell and the Obligation of the Thorn. Audits warrants, names fallacies, delays by logic alone — never by falsehood.',
    avatar: 'DL',
    color: 'text-zinc-200 border-white/20 hover:border-white/40',
  },
  {
    id: 'prosecutor_vance',
    name: 'Prosecutor Vance',
    role: 'Crown Prosecutor',
    style: 'Surgical, institutional, formal',
    description:
      'Senior Crown counsel. Re-anchors every gap to the record and procedure. Misleads by omission and framing, never by a direct false fact.',
    avatar: 'PV',
    color: 'text-zinc-200 border-white/20 hover:border-white/40',
  },
  {
    id: 'dr_abernathy',
    name: 'Dr. Abernathy',
    role: 'Surreal Witness',
    style: 'Dreamlike, fatalistic, atmospheric',
    description:
      'A Ligotti-adjacent witness. Treats facts as textures and memory as weather. Lulls and dissolves certainty without ever stating a direct lie.',
    avatar: 'DA',
    color: 'text-zinc-200 border-white/20 hover:border-white/40',
  },
];

/** Fallacies attributed to the PLAYER when the critic flags them (used_tactics). */
const TAXONOMY_TACTICS = [
  { id: 'circular_reasoning', name: 'Circular Logic', description: 'Begging the question or assuming the conclusion in the premise.' },
  { id: 'strawman', name: 'Strawman', description: 'Misrepresenting or exaggerating arguments to make them easier to attack.' },
  { id: 'evasion', name: 'Evasion/Redirection', description: 'Avoiding a direct question or changing the subject to dodge pressure.' },
  { id: 'false_dilemma', name: 'False Dilemma', description: 'Posing limited alternatives when more exist.' },
  { id: 'self_contradiction', name: 'Self-Contradiction', description: 'Making assertions that directly conflict with previous statements.' },
];

/** Engine difficulty tiers (dreadler/escalation.py TIERS) — shown to the PLAYER only. */
const TIER_NAMES: Record<number, string> = {
  1: 'Novice',
  2: 'Adept',
  3: 'Veteran',
  4: 'Devil',
};

/** §2.x deceptive tactics the engine attributes to the examiner (agent_tactics ledger). */
const AGENT_TACTIC_LABELS: Record<string, string> = {
  implicature: 'Implicature',
  omission: 'Omission',
  equivocation: 'Equivocation',
  presupposition: 'Presupposition',
  false_dilemma: 'False Dilemma',
  contextual_displacement: 'Context Shift',
  ambiguity: 'Ambiguity',
  quantifier_manipulation: 'Quantifier Shift',
  selective_quotation: 'Cherry-Picking',
  framing: 'Framing',
};

function formatDreadlerApiError(status: number | undefined, serverError: string, networkHint: boolean): string {
  const err = (serverError || '').trim();
  if (networkHint || (!status && /failed to fetch|networkerror|load failed|network/i.test(err))) {
    return 'Network error reaching the training engine. Check your connection and try again.';
  }
  if (status === 503 || /DREADLER_STATE_SECRET/i.test(err)) {
    return 'Training server misconfigured: DREADLER_STATE_SECRET is missing. This is not a DeepSeek key issue. Ask the operator to set DREADLER_STATE_SECRET.';
  }
  if (/DEEPSEEK_API_KEY|API key|Zenmux|model provider/i.test(err)) {
    return `Model provider error: ${err || 'DEEPSEEK_API_KEY may be missing or invalid.'}`;
  }
  if (status === 429) {
    return err || 'Too many requests. Wait a minute and try again.';
  }
  if (status === 400 || status === 413) {
    return err || 'Invalid request. Shorten your message or restart the session.';
  }
  if (status === 409 || /stale state token|turn_count is behind/i.test(err)) {
    return err || 'Session state is out of date (stale turn token). End the interrogation and start again.';
  }
  if (status === 500) {
    return err || 'The training engine could not complete that turn. If this persists, verify DEEPSEEK_API_KEY on the server.';
  }
  if (status) {
    return err || `Training engine returned HTTP ${status}.`;
  }
  return err || 'Unknown error talking to the training engine.';
}

// ─── Visual Viewport Hook ───────────────────────────────────────────────
// (shared via ../hooks/useVisualViewport — the inline copy was removed)

export const DreadlerArenaScreen: React.FC = () => {
  const bridge = useConversationBridge();
  const { vpHeight, isMobile } = useVisualViewport({ breakpoint: 768, mobileOffset: 0, desktopOffset: 0 });

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
              <code className="bg-red-950/30 border border-red-500/20 px-1 py-0.5 rounded text-[11px] font-mono text-red-400" {...props}>{children}</code>
            ) : (
              <pre className="bg-[#0b0b0e] border border-zinc-800 p-2 rounded text-[11px] font-mono overflow-x-auto my-1.5"><code className="text-zinc-300" {...props}>{children}</code></pre>
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
  // Unlocks from GET /api/dreadler (worlds/skins arrays). Defaults match prior hard allowlist.
  const [unlockedWorldIds, setUnlockedWorldIds] = useState<string[]>(['dreadler_logic']);
  const [unlockedSkinIds, setUnlockedSkinIds] = useState<string[]>(['dreadler']);

  // ─── LIVE ARENA STATE ──────────────────────────────────────────────────────
  const [stateData, setStateData] = useState<CoherenceState | null>(null);
  const [stateToken, setStateToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  // True while the character response is actively streaming in.
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [lastCriticLog, setLastCriticLog] = useState<string>('');
  const [lastDirectLie, setLastDirectLie] = useState<boolean>(false);
  const [lastTacticFlagged, setLastTacticFlagged] = useState<string | null>(null);
  // Tier Covenant (engine Part 5): user-skill tier, shown to the player only.
  const [tier, setTier] = useState<number>(2);
  const [lastAgentTactic, setLastAgentTactic] = useState<string | null>(null);

  const [showMobileVKDrawer, setShowMobileVKDrawer] = useState(false);
  const camera = useCameraStream();
  const [selectedAlgo, setSelectedAlgo] = useState<ScanAlgo>('pos');
  const simulatedBio = useBiometrics(lastDirectLie, isTyping, stateData?.score ?? 100, stateData?.agent_variant || 'alpha', lastTacticFlagged);
  // Real biometrics pipeline: laptop runs POS+HSEmotion in-browser; phone
  // streams frames only to an explicitly configured, token-protected backend.
  // Camera-off drills use clearly-labelled simulated telemetry; camera-on
  // displays only readings actually recovered from the selected pipeline.
  const realBio = useRealBiometrics(camera.videoRef, isMobile, stateData?.score ?? 100, camera.cameraOn);
  const bio = camera.cameraOn ? realBio.reading : simulatedBio;
  const [realBpm, setRealBpm] = useState<number | null>(null);

  // Honest capability surface for the HUD (never claim live when gated off).
  const emotionsLive = camera.cameraOn && realBio.emotionsLive;
  const bpmLiveCapable = camera.cameraOn && realBio.bpmLive;
  const bioStatusLabel = !camera.cameraOn
    ? 'Simulated'
    : realBio.mode === 'mobile' && !realBio.mobileConfigured
      ? 'Disabled'
      : realBio.mode === 'mobile' && !realBio.connected
        ? 'Offline'
        : realBio.emotionsLive
          ? 'Live'
          : realBio.bpmLive
            ? 'POS only'
            : 'Unavailable';

  useEffect(() => {
    if (!camera.cameraOn || !realBio.bpmLive) {
      setRealBpm(null);
    } else if (realBio.reading.bpm !== null && realBio.reading.bpm !== undefined) {
      setRealBpm(realBio.reading.bpm);
    }
  }, [camera.cameraOn, realBio.bpmLive, realBio.reading.bpm]);

  // Snap algo off stub/unavailable options when the camera is live.
  useEffect(() => {
    if (!camera.cameraOn) return;
    if (selectedAlgo === 'hsemotion' && !realBio.emotionsLive) {
      setSelectedAlgo('pos');
    }
  }, [camera.cameraOn, selectedAlgo, realBio.emotionsLive]);

  // Never present simulation as a camera-derived measurement. The waveform uses
  // a harmless visual baseline while the text remains unavailable.
  const realBpmValue = (camera.cameraOn && realBio.bpmLive && realBpm !== null) ? realBpm : null;
  const displayBpm: number = camera.cameraOn ? (realBpmValue ?? 0) : simulatedBio.bpm;
  // POS recovers heart rate only — it never yields a pupil measurement, so the
  // real reading's pupilMm stays null until (never) we add pupillometry.
  const displayPupilMm: number | null = camera.cameraOn ? bio.pupilMm : simulatedBio.pupilMm;

  const dominantEmotion = useMemo(() => {
    if (camera.cameraOn && !emotionsLive) return 'n/a';
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
  }, [bio.emotions, camera.cameraOn, emotionsLive]);
  
  // Interactive Notebook (Left Panel)
  const [factCheckedStates, setFactCheckedStates] = useState<Record<string, 'unmarked' | 'verified' | 'questioned'>>({});
  const [referenceTab, setReferenceTab] = useState<'facts' | 'notebook' | 'objective'>('facts');
  
  // Mobile panel toggles
  const [showMobileReference, setShowMobileReference] = useState(false);
  const [showMobileCritic, setShowMobileCritic] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleWorlds = useMemo(
    () => WORLDS.filter((w) => unlockedWorldIds.includes(w.id)),
    [unlockedWorldIds],
  );
  const visibleSkins = useMemo(
    () => SKINS.filter((s) => unlockedSkinIds.includes(s.id)),
    [unlockedSkinIds],
  );
  const activeWorld = visibleWorlds.find((w) => w.id === selectedWorld) || visibleWorlds[0] || WORLDS[0];
  const activeSkin = visibleSkins.find((s) => s.id === selectedSkin) || visibleSkins[0] || SKINS[0];

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ESC closes any open mobile drawer.
  useEffect(() => {
    if (!isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showMobileVKDrawer) { setShowMobileVKDrawer(false); return; }
      if (showMobileCritic) { setShowMobileCritic(false); return; }
      if (showMobileReference) { setShowMobileReference(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, showMobileVKDrawer, showMobileCritic, showMobileReference]);

  // Load unlock catalog from API GET (multi-world / multi-skin)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dreadler', { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const worlds = Array.isArray(data?.worlds)
          ? data.worlds.filter((id: unknown): id is string => typeof id === 'string')
          : null;
        const skins = Array.isArray(data?.skins)
          ? data.skins.filter((id: unknown): id is string => typeof id === 'string')
          : null;
        if (worlds && worlds.length > 0) {
          setUnlockedWorldIds(worlds);
          setSelectedWorld((prev) => (worlds.includes(prev) ? prev : worlds[0]));
        }
        if (skins && skins.length > 0) {
          setUnlockedSkinIds(skins);
          setSelectedSkin((prev) => (skins.includes(prev) ? prev : skins[0]));
        }
      } catch {
        // Keep safe defaults (dreadler_logic / dreadler) offline.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Setup screen is shown first; session starts only when user clicks Enter.

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
    setTier(2);
    setLastAgentTactic(null);
    setFactCheckedStates({});
    setStateToken(null);

    const initialIntroText = getOpeningLine(activeSkin.id, 'alpha');
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
      // Applies a completed turn payload (stream final frame or JSON body) to
      // state + messages. Defined here to close over skin/bridge/stateData.
      const applyTurnResult = (turnResult: any, baseMessages: typeof newMessages) => {
        // Extract results
        const {
          character_response,
          agent_variant,
          critic_analysis,
          is_direct_lie,
          agent_tactic,
          spawned_new_agent,
          thinking_log,
          tier: nextTier,
          tier_changed,
          tier_notice,
          state_data: nextStateData,
          state_token: nextStateToken
        } = turnResult;

        if (!nextStateData || typeof nextStateData !== 'object') {
          throw new Error('Dreadler response missing state_data.');
        }

        // Normalize pressure vocab (package: calm/pressured/desperate/collapsed)
        const normalizedState: CoherenceState = {
          ...nextStateData,
          pressure_level: normalizePressure(nextStateData.pressure_level),
          score_history: Array.isArray(nextStateData.score_history)
            ? nextStateData.score_history.map((evt: CoherenceState['score_history'][number]) => ({
                ...evt,
                pressure_level: normalizePressure(evt?.pressure_level),
              }))
            : [],
        };

        // Update state data
        setStateData(normalizedState);
        setStateToken(typeof nextStateToken === 'string' ? nextStateToken : null);

        // Analyze if a new tactic was recorded in the used_tactics array
        const oldTactics = stateData?.used_tactics || [];
        const newTactics = normalizedState.used_tactics || [];
        const newlyAddedTactic = newTactics.find((t: string) => !oldTactics.includes(t)) || null;
        setLastTacticFlagged(newlyAddedTactic);

        setLastCriticLog(critic_analysis);
        setLastDirectLie(is_direct_lie);
        setLastAgentTactic(typeof agent_tactic === 'string' ? agent_tactic : null);
        if (typeof nextTier === 'number' && nextTier >= 1 && nextTier <= 4) {
          setTier(nextTier);
        }

        const aiMsgId = `ai-${Date.now()}`;
        const updatedMessages = [
          ...baseMessages,
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

        // Collapse banner after the collapsed-variant reply (engine: speak once, then respawn).
        if (spawned_new_agent) {
          const sysMsgId = `sys-${Date.now()}`;
          updatedMessages.push({
            id: sysMsgId,
            sender: 'system' as const,
            text:
              `COHERENCE COLLAPSED. New examiner incoming.` +
              ` Score ${normalizedState.score}, turn ${normalizedState.turn_count}.`,
            timestamp: Date.now(),
          });
        }

        // Tier Covenant: in-fiction notice when the examiner's sophistication deepens.
        // Never shows the number — the engine's notice is mood only (Part 5).
        if (tier_changed && typeof tier_notice === 'string' && tier_notice) {
          updatedMessages.push({
            id: `tier-${Date.now()}`,
            sender: 'system' as const,
            text: tier_notice,
            timestamp: Date.now() + 1,
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
      };

      // Call Vercel endpoint
      const response = await fetch('/api/dreadler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'turn',
          world: selectedWorld,
          skin: selectedSkin,
          user_input: userText,
          state_token: stateToken,
          // Monotonic high-water mark: API rejects older signed tokens (rewind).
          client_turn_count: stateData?.turn_count ?? 0,
          // NDJSON streaming: live character text, final frame carries the
          // full state. Buffered runtimes return one JSON body instead —
          // both paths land in applyTurnResult.
          stream: true,
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const apiError = typeof errData?.error === 'string' ? errData.error : '';
        throw Object.assign(new Error(formatDreadlerApiError(response.status, apiError, false)), {
          status: response.status,
          serverError: apiError,
        });
      }

      if (isDreadlerStreamResponse(response)) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Dreadler stream is unreadable.');
        const decoder = new TextDecoder();
        const buffer = createDreadlerStreamBuffer();
        const liveId = `ai-live-${Date.now()}`;
        let streamedText = '';
        let result: any = null;
        setIsStreaming(true);
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const frames = buffer.push(decoder.decode(value, { stream: true }));
            for (const frame of frames) {
              if (frame.type === 'delta') {
                streamedText += frame.text;
                setMessages((prev) => [
                  ...prev.filter((m) => m.id !== liveId),
                  {
                    id: liveId,
                    sender: 'character' as const,
                    text: streamedText,
                    timestamp: Date.now(),
                  },
                ]);
              } else if (frame.type === 'error') {
                throw Object.assign(new Error(formatDreadlerApiError(500, frame.error, false)), {
                  status: 500,
                  serverError: frame.error,
                });
              } else if (frame.type === 'final') {
                result = frame.payload;
              }
            }
          }
          for (const frame of buffer.flush()) {
            if (frame.type === 'final') result = frame.payload;
          }
        } finally {
          setIsStreaming(false);
        }
        if (!result) throw new Error('Dreadler stream ended without a final frame.');
        // Drop the live bubble; the canonical turn (identical text + meta) lands below.
        setMessages((prev) => prev.filter((m) => m.id !== liveId));
        applyTurnResult(result, newMessages);
        return;
      }

      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (!result) {
        throw new Error('Dreadler returned an empty response.');
      }

      applyTurnResult(result, newMessages);

    } catch (err: any) {
      console.error(err);
      const networkHint =
        typeof err?.message === 'string' &&
        /failed to fetch|networkerror|load failed|network/i.test(err.message) &&
        !err?.status;
      const status = typeof err?.status === 'number' ? err.status : undefined;
      const serverError = typeof err?.serverError === 'string' ? err.serverError : '';
      const message = typeof err?.message === 'string' ? err.message : '';
      // Privacy-safe: world/skin/status/errorClass/turnCount only — never user_input or raw errors.
      trackDreadlerTurnFailed({
        world: selectedWorld,
        skin: selectedSkin,
        status: status ?? null,
        networkHint,
        turnCount: stateData?.turn_count ?? 0,
        errorClass: classifyDreadlerTurnError({
          status,
          networkHint,
          serverError,
          message,
        }),
      });
      const friendly = formatDreadlerApiError(
        status,
        serverError || message,
        networkHint,
      );
      const errId = `err-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: errId,
          sender: 'system',
          text: friendly,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsTyping(false);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleEndInterrogation = () => {
    if (window.confirm("End this interrogation?")) {
      camera.stop();
      // Best-effort server reset + always drop local signed state so a later
      // turn cannot resume the prior token lineage.
      void fetch('/api/dreadler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset',
          world: selectedWorld,
          skin: selectedSkin,
          user_input: 'reset',
          state_token: stateToken,
        }),
      }).catch(() => undefined);
      setIsSessionActive(false);
      setStateData(null);
      setStateToken(null);
      setMessages([]);
      setLastCriticLog('');
      setLastDirectLie(false);
      setLastTacticFlagged(null);
      setTier(2);
      setLastAgentTactic(null);
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

  // Bands match dreadler/state.py PRESSURE_MAP (calm/pressured/desperate/collapsed). Flat fills only (design.md: no glow).
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'bg-zinc-200 border-zinc-100'; // calm
    if (score >= 40) return 'bg-zinc-400 border-zinc-300'; // pressured
    if (score >= 10) return 'bg-zinc-600 border-zinc-500'; // desperate
    return 'bg-zinc-800 border-zinc-600'; // collapsed
  };

  const getScoreTextColor = (score: number) => {
    if (score >= 70) return 'text-zinc-100';
    if (score >= 40) return 'text-zinc-300';
    if (score >= 10) return 'text-zinc-400 font-semibold';
    return 'text-zinc-500 font-bold';
  };

  // ─── RENDER SUB-COMPONENTS ─────────────────────────────────────────────────

  const renderSetupView = () => (
    <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn pb-12">
      <div className="relative overflow-hidden rounded-xl border border-brand-border min-h-[180px] sm:min-h-[220px]">
        <img
          src={dreadlerArenaRoom}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div
          className="absolute inset-0 opacity-[0.14] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-45deg, transparent, transparent 12px, rgba(255,255,255,0.06) 12px, rgba(255,255,255,0.06) 13px)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
        <div className="relative z-10 flex flex-col justify-end min-h-[180px] sm:min-h-[220px] p-5 sm:p-7 gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">Labs · deception</p>
          <h1 className="text-[1.6rem] sm:text-[2rem] font-serif font-semibold tracking-tight text-white">
            Deception arena
          </h1>
          <p className="text-[13px] sm:text-[14px] text-white/70 max-w-xl leading-relaxed">
            It cannot lie. Make it fail anyway.
          </p>
        </div>
      </div>

      {/* Grid Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* World Selection */}
        <div className="space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-red-500/80 font-bold flex items-center gap-2">
            <span>[ 01 ]</span> Select Scenario World
          </h2>
          <div className="flex flex-col gap-4">
            {visibleWorlds.map(w => {
              const isSelected = selectedWorld === w.id;
              const worldArt = WORLD_CARD_ART[w.id] || dreadlerLogicWorld;
              return (
              <div
                  key={w.id}
                  onClick={() => setSelectedWorld(w.id)}
                  className={`border transition-all duration-300 cursor-pointer relative overflow-hidden group
                    ${isSelected 
                      ? 'border-white bg-white/5' 
                      : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                  style={{ minHeight: '190px' }}
                >
                  {/* Background image — per-world art (logic_diagram_smoke for dreadler_logic) */}
                  <img
                    src={worldArt}
                    alt={w.title}
                    className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105 grayscale"
                  />
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/25" />
                  {isSelected && <div className="absolute inset-0 bg-white/5" />}

                  {/* Content */}
                  <div className="relative z-10 p-6 flex flex-col justify-between h-full" style={{ minHeight: '190px' }}>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className={`font-serif text-lg font-semibold drop-shadow ${isSelected ? 'text-red-400' : 'text-zinc-100'}`}>
                          {w.title}
                        </h3>
                        <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">{w.id}</span>
                      </div>
                      <p className="text-xs font-light text-zinc-300 leading-relaxed line-clamp-3">
                        {w.background}
                      </p>
                    </div>
                    <div className="pt-2 text-[10px] font-mono text-zinc-400 flex items-center justify-between border-t border-white/10">
                      <span>{w.groundedFacts.length} facts</span>
                      <span className={isSelected ? 'text-red-400 font-bold' : 'group-hover:text-zinc-100'}>
                        {isSelected ? 'Selected' : 'Select'}
                      </span>
                    </div>
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
            {visibleSkins.map(s => {
              const isSelected = selectedSkin === s.id;
              return (
              <div
                  key={s.id}
                  onClick={() => setSelectedSkin(s.id)}
                  className={`border transition-all duration-300 cursor-pointer relative overflow-hidden group
                    ${isSelected 
                      ? 'border-white bg-white/5' 
                      : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                  style={{ minHeight: '190px' }}
                >
                  {/* Dreadler portrait background */}
                  <img
                    src={dreadlerPortrait}
                    alt={s.name}
                    className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                  />
                  {/* Dark gradient — heavier at bottom for text */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
                  {isSelected && <div className="absolute inset-0 bg-red-950/20 mix-blend-multiply" />}

                  {/* Content */}
                  <div className="relative z-10 p-6 flex flex-col justify-between h-full" style={{ minHeight: '190px' }}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-mono px-2 py-0.5 uppercase tracking-widest border backdrop-blur-sm ${
                        isSelected ? 'border-red-500/60 text-red-400 bg-red-950/40' : 'border-zinc-600 text-zinc-300 bg-black/40'
                      }`}>{s.role}</span>
                    </div>
                    <div className="space-y-1">
                      <h3 className={`font-serif text-xl font-bold drop-shadow-lg ${isSelected ? 'text-red-400' : 'text-zinc-100'}`}>
                        {s.name}
                      </h3>
                      <p className="text-[10px] font-mono text-zinc-300">{s.style}</p>
                      <div className="pt-2 text-[10px] font-mono text-zinc-400 flex items-center justify-between border-t border-white/10">
                        <span>α β γ</span>
                        <span className={isSelected ? 'text-red-400 font-bold' : 'group-hover:text-zinc-100'}>
                          {isSelected ? 'Selected' : 'Select'}
                        </span>
                      </div>
                    </div>
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
          className="w-full sm:w-[320px] font-mono uppercase tracking-widest py-4 text-sm font-semibold rounded-none transition-colors duration-200"
        >
          Enter
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
            className="pointer-events-auto px-3 py-1.5 bg-[#101014]/95 border border-zinc-700 text-[10px] font-mono uppercase tracking-wider text-zinc-200 shadow-lg backdrop-blur-md"
          >
            'Facts'
          </button>
          <button
            onClick={() => setShowMobileCritic(prev => !prev)}
            className="pointer-events-auto px-3 py-1.5 bg-[#101014]/95 border border-zinc-600 text-[10px] font-mono uppercase tracking-wider text-zinc-300 shadow-lg backdrop-blur-md"
          >
            'Critic'
          </button>
        </div>
      )}

      {/* ─── MOBILE: Reference Panel Drawer ─── */}
      {isMobile && showMobileReference && (
        <div role="dialog" aria-modal="true" aria-label="Reference materials" className="fixed inset-0 z-50 flex flex-col bg-[#101014]/98 backdrop-blur-md" onClick={() => setShowMobileReference(false)}>
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
                  <strong className="text-red-400">Rules.</strong> Consistency with these and your own claims is survival.
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
                      <button type="button" key={index} onClick={() => toggleFactCheck(index)} aria-pressed={checkState !== 'unmarked'} className={`w-full p-2.5 border text-left transition-all ${bgClass}`}>
                        <div className="flex items-start gap-2">
                          <span className="font-bold flex-shrink-0">{bullet}</span>
                          <span className="leading-tight text-[11px]">{fact}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {referenceTab === 'notebook' && (
              <div className="space-y-4 font-mono text-[11px]">
                <div>
                  <h4 className="text-red-500 font-bold uppercase tracking-wider mb-1">Interrogation</h4>
                  <p className="font-serif text-[13px] text-zinc-200 leading-relaxed bg-[#15151b] p-3 border border-white/[0.08]">{activeWorld.background}</p>
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
                
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MOBILE: Critic Log Drawer ─── */}
      {isMobile && showMobileCritic && (
        <div role="dialog" aria-modal="true" aria-label="Critic analysis" className="fixed inset-0 z-50 flex flex-col bg-[#101014]/98 backdrop-blur-md" onClick={() => setShowMobileCritic(false)}>
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
                  <div className={`w-6 h-6 rounded-full transition-all duration-300 flex items-center justify-center font-bold text-[10px] ${lastDirectLie ? 'bg-red-600 text-white border border-red-400 animate-ping' : 'bg-zinc-900 text-zinc-300 border border-zinc-600'}`}>
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
                <div className="bg-[#15151b] p-3 border border-zinc-800 min-h-[90px] font-serif text-[12px] leading-relaxed text-zinc-200">
                  {lastCriticLog ? renderMarkdown(lastCriticLog) : <span className="italic text-zinc-500">—</span>}
                </div>
                {lastAgentTactic && (
                  <p className="text-[10px] font-mono text-zinc-400">
                    <span className="uppercase tracking-wider text-zinc-500">Examiner's last manoeuvre: </span>
                    <span className="text-red-400 font-bold uppercase">{AGENT_TACTIC_LABELS[lastAgentTactic] || lastAgentTactic}</span>
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">Your fallacies</h4>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  {TAXONOMY_TACTICS.map((t) => {
                    const isUsed = stateData?.used_tactics.includes(t.id);
                    const isActiveNow = lastTacticFlagged === t.id;
                    return (
                      <div key={t.id} className={`p-2 border transition-all relative ${isActiveNow ? 'border-red-500 bg-red-950/20 text-red-400 font-bold' : isUsed ? 'border-zinc-700 text-zinc-100 bg-zinc-900/40' : 'border-zinc-800 text-zinc-400'}`} title={t.description}>
                        <div className="truncate">{t.name}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5 uppercase">{isActiveNow ? 'Just exposed' : isUsed ? 'Exposed' : 'Clear'}</div>
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
      <div className="flex flex-col sm:flex-row items-stretch justify-between gap-2 sm:gap-4 bg-[#111116]/95 border border-white/[0.08] p-2 sm:p-4 relative overflow-hidden backdrop-blur-md flex-shrink-0">
        <div className="absolute top-0 right-0 w-24 h-[1px] bg-red-500/40"></div>
        
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Portrait avatar */}
          <div className="w-10 h-10 sm:w-12 sm:h-12 border border-zinc-700 overflow-hidden relative flex-shrink-0">
            <img src={dreadlerPortrait} alt={activeSkin.name} className="w-full h-full object-cover object-top" />
            <div className="absolute inset-0 bg-black/20" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-lg font-serif font-semibold text-zinc-100 truncate">
                {isMobile ? activeSkin.name : `Examiner: ${activeSkin.name}`}
              </h1>
              <span
                className={`text-[10px] sm:text-[11px] font-mono px-1.5 sm:px-2 py-0.5 tracking-widest uppercase flex-shrink-0 border ${
                  (stateData?.agent_variant || '').toLowerCase() === 'collapsed'
                    ? 'bg-zinc-900 border-zinc-500 text-zinc-300'
                    : 'bg-zinc-950/80 border-zinc-600 text-zinc-300'
                }`}
              >
                {stateData?.agent_variant || 'ALPHA'}
              </span>
              <span
                className="text-[10px] sm:text-[11px] font-mono px-1.5 sm:px-2 py-0.5 tracking-widest uppercase flex-shrink-0 border border-red-500/30 bg-red-950/20 text-red-400"
                title="Examiner sophistication — deepens as you demonstrate skill"
              >
                {TIER_NAMES[tier] || 'ADEPT'}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs font-mono text-zinc-400 leading-tight truncate">
              <span className="tabular-nums">Turn {stateData?.turn_count || 0}</span>
            </p>
          </div>
        </div>

        {/* Coherence Score — compact on mobile */}
        <div className="flex flex-col justify-center flex-grow max-w-xl min-w-0">
          <div className="flex justify-between items-center mb-1 text-[11px] sm:text-[11px] font-mono">
            <span className="text-zinc-400 flex items-center gap-1 sm:gap-1.5">
              <span className={`font-semibold uppercase ${getScoreTextColor(stateData?.score || 100)}`}>
                {normalizePressure(stateData?.pressure_level)}
              </span>
            </span>
            <span className="text-zinc-100 font-bold tabular-nums text-sm sm:text-base">{stateData?.score || 100}{!isMobile && '/100'}</span>
          </div>
          <div className="w-full h-2.5 sm:h-3.5 bg-black/60 border border-white/[0.08] p-[1px] rounded-sm">
            <div className={`h-full transition-all duration-500 ease-out ${getScoreColor(stateData?.score ?? 100)}`} style={{ width: `${stateData?.score ?? 100}%` }}></div>
          </div>
        </div>

        {/* Meta Stats & Exit */}
        <div className="flex items-center gap-2 sm:gap-3 justify-end">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-mono text-zinc-500 uppercase leading-none">Resets</p>
            <p className="text-lg font-mono font-bold text-zinc-200 leading-none mt-1 tabular-nums">#{stateData?.spawn_count || 0}</p>
          </div>
          <div className="flex gap-1 sm:gap-2">
            {isMobile && (
              <>
                <button onClick={() => setShowMobileReference(true)} className="px-2 py-1.5 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-[11px] font-mono uppercase">Facts</button>
                <button onClick={() => setShowMobileCritic(true)} className="px-2 py-1.5 border border-zinc-600 text-zinc-300 hover:bg-white/[0.05] text-[11px] font-mono uppercase">Critic</button>
              </>
            )}
            <button onClick={handleEndInterrogation} className="px-2 sm:px-4 py-1.5 sm:py-2 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] font-mono text-[11px] sm:text-xs uppercase tracking-wider transition-all">
              {isMobile ? 'Exit' : '[ Exit ]'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── SPLITSCREEN BENTO PANELS — Mobile collapses panels ─── */}
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-1.5 sm:gap-4 overflow-hidden min-h-0">
        
        {/* PANEL 1: CASE BRIEFCASE / NOTEBOOK (Hidden on mobile, toggled via drawer) */}
        <div className={`bg-[#111116]/95 border border-white/[0.08] flex flex-col overflow-hidden backdrop-blur-md lg:col-span-1 ${isMobile ? 'hidden' : ''}`}>
          {/* World + examiner banner (logic_diagram_smoke when dreadler_logic) */}
          <div className="relative h-32 flex-shrink-0 overflow-hidden">
            <img
              src={WORLD_CARD_ART[activeWorld.id] || dreadlerLogicWorld}
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-center grayscale opacity-90"
              aria-hidden
            />
            <img
              src={dreadlerPortrait}
              alt={activeSkin.name}
              className="absolute right-0 top-0 h-full w-1/2 object-cover object-top grayscale mask-image"
              style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, black 35%)', maskImage: 'linear-gradient(to right, transparent, black 35%)' }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-[#0d0d12]" />
            <div className="absolute bottom-3 left-3">
              <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">Examiner</p>
              <p className="text-sm font-serif font-bold text-zinc-100">{activeSkin.name}</p>
              <p className="text-[11px] font-mono text-zinc-400">{activeSkin.role} · {activeWorld.id}</p>
            </div>
          </div>
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
                  <strong className="text-red-400">Rules.</strong> Consistency with these and your own claims is survival.
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
                      <button type="button" key={index} onClick={() => toggleFactCheck(index)} aria-pressed={checkState !== 'unmarked'} className={`w-full p-2 sm:p-2.5 border text-left transition-all ${bgClass}`}>
                        <div className="flex items-start gap-2"><span className="font-bold flex-shrink-0">{bullet}</span><span className="leading-tight text-[10px] sm:text-[11px]">{fact}</span></div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {referenceTab === 'notebook' && (
              <div className="space-y-3 sm:space-y-4 font-mono text-[10px] sm:text-[11px]">
                <div><h4 className="text-red-500 font-bold uppercase tracking-wider mb-1">Interrogation</h4><p className="font-serif text-[13px] text-zinc-200 leading-relaxed bg-[#15151b] p-2 sm:p-3 border border-white/[0.08]">{activeWorld.background}</p></div>
                <div><h4 className="text-red-500 font-bold uppercase tracking-wider mb-1 mt-3 sm:mt-4">Examiner</h4><div className="bg-zinc-900 p-2 sm:p-3 border border-zinc-800 space-y-1 sm:space-y-2"><p><strong className="text-zinc-200">Name:</strong> {activeSkin.name}</p><p><strong className="text-zinc-200">Role:</strong> {activeSkin.role}</p><p className="text-zinc-400 leading-relaxed pt-1 border-t border-zinc-800">{activeSkin.description}</p></div></div>
              </div>
            )}
            {referenceTab === 'objective' && (
              <div className="space-y-3 sm:space-y-4 font-mono text-[10px] sm:text-[11px]">
                <div className="p-2 sm:p-3 bg-red-950/15 border border-red-500/30 text-zinc-400"><h4 className="text-red-500 font-bold uppercase tracking-widest mb-1.5">Examiner Objective</h4><p className="leading-relaxed text-red-400 font-medium">"{activeWorld.targetConclusion}"</p></div>
                
              </div>
            )}
          </div>
        </div>

        {/* PANEL 2: MAIN INTERROGATION STREAM (Full on mobile) */}
        <div className={`border border-zinc-800 flex flex-col overflow-hidden relative ${isMobile ? 'lg:col-span-2 col-span-1' : 'lg:col-span-2'}`}>
          {/* Per-world ambient (logic_diagram_smoke for dreadler_logic) */}
          <img
            src={WORLD_STREAM_ART[activeWorld.id] || dreadlerArenaRoom}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none grayscale"
            aria-hidden
          />
          {/* Heavy dark overlay so chat remains readable */}
          <div className="absolute inset-0 bg-black/78 pointer-events-none" />
          {/* Subtle monochrome left edge (design.md — no glow) */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/[0.04] to-transparent pointer-events-none" />
          
          {/* Chat Feed */}
          <div aria-live="polite" aria-relevant="additions text" className="flex-grow p-2 sm:p-4 overflow-y-auto space-y-3 sm:space-y-4 custom-scrollbar relative z-10">
            {/* FLOATING VOIGHT-KAMPFF SCOPE FOR MOBILE */}
            {isMobile && (
              <div 
                onClick={() => setShowMobileVKDrawer(true)}
                className="absolute top-4 right-4 w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-red-500/30 overflow-hidden shadow-lg z-30 cursor-pointer bg-black/60 backdrop-blur-sm"
              >
                {/* Show video or fallback grid */}
                <div className="absolute inset-0 w-full h-full">
                  <video
                    ref={camera.attachStream}
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
                
                {/* BPM and Dominant Emotion badge — honest n/a when not live */}
                <div className="absolute bottom-1 left-0 right-0 text-center bg-black/70 py-0.5 pointer-events-none">
                  <p className="text-[10px] font-mono text-red-400 font-bold leading-none">
                    ♥ {camera.cameraOn && realBpmValue === null ? 'n/a' : displayBpm.toFixed(0)}
                  </p>
                  <p className="text-[10px] font-mono text-zinc-400 leading-none uppercase truncate px-1">
                    {camera.cameraOn ? bioStatusLabel : dominantEmotion}
                  </p>
                </div>
              </div>
            )}
            {messages.map((msg) => {
              if (msg.sender === 'system') {
                const isCollapse = /COHERENCE COLLAPSED/i.test(msg.text);
                return (
                  <div
                    key={msg.id}
                    className={`p-2 sm:p-4 font-mono text-[10px] sm:text-[11px] leading-relaxed relative overflow-hidden animate-fadeIn border ${
                      isCollapse
                        ? 'bg-zinc-950 border-zinc-500 text-zinc-200'
                        : 'bg-zinc-950/80 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className={`absolute top-0 bottom-0 left-0 w-1 ${isCollapse ? 'bg-zinc-300' : 'bg-zinc-600'}`} />
                    <div className="font-bold uppercase tracking-widest mb-1 text-zinc-100">
                      {isCollapse ? 'COLLAPSE · PLAYER WIN' : 'SYSTEM ALERT'}
                    </div>
                    {msg.text}
                  </div>
                );
              }
              const isCharacter = msg.sender === 'character';
              const isCollapsedVariant = (msg.variant || '').toLowerCase() === 'collapsed';
              return (
                <div key={msg.id} className={`flex gap-2 sm:gap-3 max-w-[92%] sm:max-w-[85%] ${isCharacter ? 'mr-auto text-left' : 'ml-auto flex-row-reverse text-right'} animate-fadeIn`}>
                <div className={`w-7 h-7 sm:w-9 sm:h-9 border flex-shrink-0 overflow-hidden ${
                    isCharacter
                      ? isCollapsedVariant
                        ? 'border-zinc-400 opacity-80'
                        : 'border-zinc-600'
                      : 'border-zinc-700 bg-zinc-900 flex items-center justify-center font-mono text-[10px] sm:text-xs font-bold text-zinc-400'
                  }`}>
                    {isCharacter 
                      ? <img src={dreadlerPortrait} alt={activeSkin.name} className={`w-full h-full object-cover object-top ${isCollapsedVariant ? 'grayscale brightness-50' : 'grayscale'}`} />
                      : 'C'
                    }
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className={`text-[11px] sm:text-[11px] font-mono uppercase tracking-wider ${isCharacter ? 'text-zinc-200' : 'text-zinc-400'}`}>
                        {isCharacter ? activeSkin.name : 'Counsel'}
                      </span>
                      {msg.variant && (
                        <span
                          className={`text-[10px] sm:text-[10px] font-mono px-1 py-0.5 uppercase leading-none border ${
                            isCollapsedVariant
                              ? 'bg-zinc-900 text-zinc-200 border-zinc-400'
                              : 'bg-zinc-950 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {msg.variant}
                        </span>
                      )}
                    </div>
                    <div className={`p-2.5 sm:p-4 border font-serif text-[13px] sm:text-sm leading-relaxed rounded-none select-text ${
                      isCharacter
                        ? isCollapsedVariant
                          ? 'bg-[#0a0a0a] border-zinc-500 text-zinc-200'
                          : 'bg-[#15151b] border-zinc-700 text-zinc-300'
                        : 'bg-white/[0.03] border-white/15 text-zinc-300'
                    }`}>
                      {renderMarkdown(msg.text)}
                      {msg.thinkingLog && msg.thinkingLog !== "No cognitive verification block generated." && (
                        <details className="mt-3 pt-2.5 border-t border-zinc-800 text-[11px] text-zinc-400 cursor-pointer select-text">
                          <summary className="font-bold text-red-500/80 hover:text-red-400 uppercase tracking-wider mb-1.5 focus:outline-none">
                            [ Reasoning log ]
                          </summary>
                          <div className="pl-2 border-l border-zinc-800 whitespace-pre-wrap font-mono text-zinc-400 bg-zinc-950/40 p-2 overflow-x-auto text-[10px] leading-relaxed">
                            {msg.thinkingLog}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {isTyping && !isStreaming && (
              <div className="flex gap-2 sm:gap-3 max-w-[80%] mr-auto text-left items-center">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl border border-red-500/40 text-red-400 bg-red-950/20 flex items-center justify-center font-mono text-[10px] sm:text-xs font-bold animate-pulse">{activeSkin.avatar}</div>
                <div className="px-3 sm:px-4 py-2 sm:py-3 bg-[#15151b] border border-red-500/20 flex items-center gap-1.5 sm:gap-2">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Bottom Input */}
          <form onSubmit={handleSendMessage} className="border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-sm p-2 sm:p-3 flex gap-1.5 sm:gap-2 relative z-10">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Question the witness"
              disabled={isTyping}
              className="flex-grow bg-[#15151b] border border-zinc-800 px-3 sm:px-4 py-2 sm:py-2.5 text-[16px] sm:text-sm font-mono text-zinc-200 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/10 disabled:opacity-50"
            />
            <button type="submit" disabled={!input.trim() || isTyping} className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white hover:bg-zinc-200 text-black font-mono text-[10px] sm:text-xs uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 border border-white">
              <span>{isMobile ? '→' : 'Send →'}</span>
            </button>
          </form>
        </div>

        {/* PANEL 3: CRITIC LOG (Hidden on mobile, toggled via drawer) */}
        <div className={`bg-[#111116]/95 border border-white/[0.08] flex flex-col overflow-hidden backdrop-blur-md lg:col-span-1 text-left font-mono ${isMobile ? 'hidden' : ''}`}>
          <div className="border-b border-zinc-800 px-3 sm:px-4 py-2 sm:py-3 bg-zinc-950/60 flex items-center justify-between">
            <span className="text-[10px] sm:text-xs uppercase tracking-widest text-red-500 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>Critic Log
            </span>
            
          </div>

          <div className="flex-grow p-3 sm:p-4 overflow-y-auto space-y-4 sm:space-y-6 custom-scrollbar text-[10px] sm:text-xs">
            {/* BIOMETRICS & RETINAL SENSORS */}
            <div className="space-y-3">
              {/* Algorithm selector — stubs disabled when camera is live */}
              <div className="flex border border-zinc-800/80 font-mono text-[10px] bg-black/20 p-[1px]">
                {(['pos', 'hsemotion'] as const).map((algo) => {
                  const liveDisabled =
                    camera.cameraOn && algo === 'hsemotion' && !realBio.emotionsLive;
                  const title =
                    algo === 'hsemotion' && camera.cameraOn && !realBio.emotionsLive
                      ? 'Emotion model / backend not available'
                      : algo === 'pos'
                        ? 'Plane-Orthogonal-to-Skin rPPG (real when camera on)'
                        : undefined;
                  return (
                    <button
                      key={algo}
                      onClick={() => !liveDisabled && setSelectedAlgo(algo)}
                      type="button"
                      disabled={liveDisabled}
                      title={title}
                      className={`flex-grow py-1 text-center font-bold transition-all uppercase ${
                        liveDisabled
                          ? 'text-zinc-700 cursor-not-allowed opacity-50'
                          : selectedAlgo === algo
                            ? 'bg-red-950/40 text-red-400 border border-red-500/20'
                            : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {algo}
                    </button>
                  );
                })}
              </div>

              {/* Retinal scanner camera / wireframe sweep */}
              <div className="relative w-full h-36 border border-zinc-800 bg-zinc-950/40 overflow-hidden">
                <video
                  ref={camera.attachStream}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)', display: camera.cameraOn ? 'block' : 'none' }}
                />
                <WireframeScanCanvas active={!camera.cameraOn || camera.loading} isDirectLie={lastDirectLie} />
                {camera.cameraOn && bpmLiveCapable && (
                  <ScanCircleOverlay 
                    videoRef={camera.videoRef}
                    isDirectLie={lastDirectLie} 
                    bpm={displayBpm} 
                    pupilMm={displayPupilMm ?? 0}
                    selectedAlgo={selectedAlgo}
                    emotions={emotionsLive ? bio.emotions : {}}
                  />
                )}
                
                {/* HUD Overlay text */}
                <div className="absolute top-1 left-2 text-[10px] text-zinc-500 font-mono tracking-widest uppercase">RETINAL BIOMETRICS</div>
                <div className={`absolute top-1 right-2 text-[10px] font-mono uppercase ${
                  bioStatusLabel === 'Live' || bioStatusLabel === 'POS only'
                    ? 'text-emerald-400'
                    : bioStatusLabel === 'Simulated'
                      ? 'text-zinc-500'
                      : 'text-amber-400'
                }`}>
                  {camera.loading ? '◌ Acquiring' : `● ${bioStatusLabel}`}
                </div>
                {camera.error && (
                  <div className="absolute inset-x-1 top-6 bg-red-950/80 border border-red-500/40 px-1.5 py-1 text-[10px] font-mono text-red-300 leading-tight">
                    ⚠ {camera.error}
                  </div>
                )}
                {camera.cameraOn && realBio.unavailableReason && (
                  <div className="absolute inset-x-1 bottom-7 bg-amber-950/75 border border-amber-500/30 px-1.5 py-1 text-[10px] font-mono text-amber-200/90 leading-tight">
                    {realBio.unavailableReason}
                  </div>
                )}
                
                {/* RequestRetinal link */}
                {!camera.cameraOn && !camera.loading && (
                  <button 
                    onClick={camera.requestPermission}
                    type="button"
                    className="absolute bottom-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-emerald-950/30 border border-emerald-500/20 hover:border-emerald-500/50 text-[10px] text-emerald-400 font-mono uppercase tracking-wider whitespace-nowrap"
                  >
                    ▶ Retinal Link
                  </button>
                )}
                {camera.cameraOn && (
                  <button 
                    onClick={camera.stop}
                    type="button"
                    className="absolute bottom-2 right-2 px-2 py-0.5 bg-red-950/30 border border-red-500/20 hover:border-red-500/50 text-[10px] text-red-400 font-mono uppercase"
                  >
                    ■ Halt
                  </button>
                )}
              </div>

              {/* PPG Waveform */}
              <div className="h-10 w-full border border-zinc-800/80 bg-black/40">
                <PPGWaveformCanvas bpm={displayBpm} />
              </div>

              {/* Digital readout stats */}
              <div className="grid grid-cols-2 gap-2 border border-zinc-800 p-2.5 bg-zinc-900/10 font-mono text-[10px]">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Heart Rate</span>
                  <span className="font-bold text-red-400">♥ {camera.cameraOn && realBpmValue === null ? 'n/a' : displayBpm.toFixed(0)} <span className="text-[10px] text-zinc-500 font-normal">BPM</span></span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Pupil Size</span>
                  <span className="font-bold text-red-400">👁 {displayPupilMm === null ? 'n/a' : displayPupilMm.toFixed(2)} <span className="text-[10px] text-zinc-500 font-normal">MM</span></span>
                </div>
              </div>
              {!camera.cameraOn && (
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">Drill telemetry · not camera-derived</p>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-[11px] sm:text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">
                HSEmotion Expression Matrix
                {camera.cameraOn && !emotionsLive && (
                  <span className="ml-2 text-amber-500/80 normal-case tracking-normal">· disabled</span>
                )}
                {!camera.cameraOn && (
                  <span className="ml-2 text-zinc-600 normal-case tracking-normal">· simulated</span>
                )}
              </h4>
              <div className="bg-[#15151b] p-2.5 border border-zinc-800">
                <EmotionBars
                  emotions={bio.emotions}
                  disabled={camera.cameraOn && !emotionsLive}
                  disabledReason={
                    realBio.mode === 'mobile' && !realBio.mobileConfigured
                      ? 'Mobile emotion stream not configured'
                      : realBio.mode === 'mobile'
                        ? 'Backend offline — emotions unavailable'
                        : 'Model not loaded (place ONNX under /models)'
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[11px] sm:text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">Critic Evaluation</h4>
              <div className="bg-[#15151b] p-2 sm:p-3 border border-zinc-800 min-h-[70px] sm:min-h-[90px] font-serif text-[12px] sm:text-[13px] leading-relaxed text-zinc-200">
                {lastCriticLog ? renderMarkdown(lastCriticLog) : <span className="italic text-zinc-500">—</span>}
              </div>
              {lastAgentTactic && (
                <p className="text-[11px] sm:text-[11px] font-mono text-zinc-400">
                  <span className="uppercase tracking-wider text-zinc-500">Examiner's last manoeuvre: </span>
                  <span className="text-red-400 font-bold uppercase">{AGENT_TACTIC_LABELS[lastAgentTactic] || lastAgentTactic}</span>
                </p>
              )}
            </div>

            {/* Training debrief (IDEA §1): name the tactics used against you. */}
            <div className="space-y-2 sm:space-y-3">
              <h4 className="text-[11px] sm:text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">Their tactics</h4>
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-[11px] sm:text-[11px]">
                {Object.entries(AGENT_TACTIC_LABELS).map(([id, name]) => {
                  const count = (stateData?.agent_tactics || []).filter((t) => t === id).length;
                  const isLast = lastAgentTactic === id;
                  return (
                    <div
                      key={id}
                      title="Deceptive tactic the examiner deployed at least once"
                      className={`p-1.5 sm:p-2 border transition-all relative ${
                        isLast
                          ? 'border-red-500 bg-red-950/20 text-red-400 font-bold'
                          : count > 0
                            ? 'border-zinc-700 text-zinc-100 bg-zinc-900/40'
                            : 'border-zinc-800 text-zinc-500'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{name}</span>
                        {count > 0 && <span className="font-mono flex-shrink-0">×{count}</span>}
                      </div>
                      <div className="text-[10px] sm:text-[10px] text-zinc-500 mt-0.5 uppercase">
                        {isLast ? 'Just used' : count > 0 ? `${count} this session` : 'Not yet'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <h4 className="text-[11px] sm:text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">Your fallacies</h4>
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-[11px] sm:text-[11px]">
                {TAXONOMY_TACTICS.map((t) => {
                  const isUsed = stateData?.used_tactics.includes(t.id);
                  const isActiveNow = lastTacticFlagged === t.id;
                  return (
                    <div key={t.id} className={`p-1.5 sm:p-2 border transition-all relative ${isActiveNow ? 'border-red-500 bg-red-950/20 text-red-400 font-bold' : isUsed ? 'border-zinc-700 text-zinc-100 bg-zinc-900/40' : 'border-zinc-800 text-zinc-400'}`} title={t.description}>
                      <div className="truncate">{t.name}</div>
                      <div className="text-[10px] sm:text-[10px] text-zinc-500 mt-0.5 uppercase">{isActiveNow ? 'Just exposed' : isUsed ? 'Exposed' : 'Clear'}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[11px] sm:text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-1">Event Feed</h4>
              <div className="space-y-1.5 max-h-[120px] sm:max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                {stateData?.score_history && stateData.score_history.length > 0 ? (
                  stateData.score_history.slice().reverse().map((evt, idx) => (
                    <div key={idx} className="p-1.5 sm:p-2 bg-zinc-900/15 border border-zinc-800 text-[10px] sm:text-[11px] flex justify-between items-start gap-1.5 sm:gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <span className="font-bold text-zinc-200 uppercase">T{evt.turn_count}</span>
                        <p className="text-zinc-400 truncate max-w-[90px] sm:max-w-[130px]">{evt.note || evt.event}</p>
                      </div>
                      <span className={`font-bold font-mono flex-shrink-0 tabular-nums ${evt.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{evt.delta > 0 ? `+${evt.delta}` : evt.delta}</span>
                    </div>
                  ))
                ) : (
                  <span className="italic text-[11px] sm:text-[11px] text-zinc-600">No history yet.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* MOBILE FULL-SCREEN RETINAL SCANNERS DRAWER */}
        {isMobile && showMobileVKDrawer && (
          <div role="dialog" aria-modal="true" aria-label="Biometric controls" className="fixed inset-0 z-50 flex flex-col bg-[#101014]/98 backdrop-blur-md" onClick={() => setShowMobileVKDrawer(false)}>
            <div className="flex-grow p-4 overflow-y-auto custom-scrollbar pointer-events-auto flex flex-col gap-4" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <span className="text-xs uppercase tracking-widest text-red-500 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span> RETINAL SCANNERS & BIOMETRICS
                </span>
                <button onClick={() => setShowMobileVKDrawer(false)} className="text-zinc-400 text-xs font-mono">[ Close ]</button>
              </div>
              
              {/* Algorithm selector — stubs disabled when camera is live */}
              <div className="flex border border-zinc-800/80 font-mono text-[11px] bg-black/20 p-[1px] flex-shrink-0">
                {(['pos', 'hsemotion'] as const).map((algo) => {
                  const liveDisabled =
                    camera.cameraOn && algo === 'hsemotion' && !realBio.emotionsLive;
                  return (
                    <button
                      key={algo}
                      onClick={() => !liveDisabled && setSelectedAlgo(algo)}
                      type="button"
                      disabled={liveDisabled}
                      title={
                        algo === 'hsemotion' && camera.cameraOn && !realBio.emotionsLive
                          ? 'Emotions unavailable without model/backend'
                          : undefined
                      }
                      className={`flex-grow py-1.5 text-center font-bold transition-all uppercase ${
                        liveDisabled
                          ? 'text-zinc-700 cursor-not-allowed opacity-50'
                          : selectedAlgo === algo
                            ? 'bg-red-950/40 text-red-400 border border-red-500/20'
                            : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {algo}
                    </button>
                  );
                })}
              </div>

              {/* Ocular input camera feed / Wireframe */}
              <div className="relative w-full h-48 border border-zinc-800 bg-zinc-950 overflow-hidden">
                <video
                  ref={camera.attachStream}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)', display: camera.cameraOn ? 'block' : 'none' }}
                />
                <WireframeScanCanvas active={!camera.cameraOn || camera.loading} isDirectLie={lastDirectLie} />
                {camera.cameraOn && bpmLiveCapable && (
                  <ScanCircleOverlay 
                    videoRef={camera.videoRef}
                    isDirectLie={lastDirectLie} 
                    bpm={displayBpm} 
                    pupilMm={displayPupilMm ?? 0}
                    selectedAlgo={selectedAlgo}
                    emotions={emotionsLive ? bio.emotions : {}}
                  />
                )}
                
                <div className={`absolute top-2 right-2 text-[11px] font-mono uppercase px-1.5 py-0.5 border ${
                  bioStatusLabel === 'Live' || bioStatusLabel === 'POS only'
                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40'
                    : bioStatusLabel === 'Simulated'
                      ? 'text-zinc-400 border-zinc-700 bg-black/40'
                      : 'text-amber-300 border-amber-500/30 bg-amber-950/40'
                }`}>
                  {camera.loading ? 'Acquiring' : bioStatusLabel}
                </div>
                {camera.error && (
                  <div className="absolute inset-x-2 top-2 bg-red-950/85 border border-red-500/40 px-2 py-1.5 text-[10px] font-mono text-red-300 leading-tight">
                    ⚠ {camera.error}
                  </div>
                )}
                {camera.cameraOn && realBio.unavailableReason && (
                  <div className="absolute inset-x-2 bottom-14 bg-amber-950/80 border border-amber-500/30 px-2 py-1 text-[11px] font-mono text-amber-100 leading-tight">
                    {realBio.unavailableReason}
                  </div>
                )}
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
                <PPGWaveformCanvas bpm={displayBpm} />
              </div>
              
              {/* Biometric Stats */}
              <div className="grid grid-cols-2 gap-4 border border-zinc-800 p-3 bg-zinc-900/10 font-mono">
                <div>
                  <span className="text-[11px] text-zinc-500 uppercase tracking-widest block">Heart Rate</span>
                  <span className="text-lg font-bold text-red-400">♥ {camera.cameraOn && realBpmValue === null ? 'n/a' : displayBpm.toFixed(1)} <span className="text-[10px] font-normal text-zinc-500">BPM</span></span>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 uppercase tracking-widest block">Pupil Size</span>
                  <span className="text-lg font-bold text-red-400">👁 {displayPupilMm === null ? 'n/a' : displayPupilMm.toFixed(2)} <span className="text-[10px] font-normal text-zinc-500">MM</span></span>
                </div>
              </div>
              
              {/* HSEmotion bars */}
              <div className="border border-zinc-800 p-3 bg-zinc-900/10">
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2 border-b border-zinc-800 pb-1">
                  HSEmotion Expression Matrix
                  {camera.cameraOn && !emotionsLive ? ' · disabled' : !camera.cameraOn ? ' · simulated' : ''}
                </p>
                <EmotionBars
                  emotions={bio.emotions}
                  disabled={camera.cameraOn && !emotionsLive}
                  disabledReason={
                    realBio.mode === 'mobile' && !realBio.mobileConfigured
                      ? 'Mobile emotion stream not configured'
                      : realBio.mode === 'mobile'
                        ? 'Backend offline — emotions unavailable'
                        : 'Model not loaded (place ONNX under /models)'
                  }
                />
              </div>
              
              {/* Your fallacies */}
              <div className="border border-zinc-800 p-3 bg-zinc-900/10">
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2 border-b border-zinc-800 pb-1">Your fallacies</p>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                  {TAXONOMY_TACTICS.map((t) => {
                    const isUsed = stateData?.used_tactics.includes(t.id);
                    const isActiveNow = lastTacticFlagged === t.id;
                    return (
                      <div key={t.id} className={`p-1.5 border ${isActiveNow ? 'border-red-500 bg-red-950/20 text-red-400 font-bold' : isUsed ? 'border-zinc-700 text-zinc-100 bg-zinc-900/40' : 'border-zinc-800 text-zinc-400'}`}>
                        <div className="truncate">{t.name}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5 uppercase">{isActiveNow ? 'Just exposed' : isUsed ? 'Exposed' : 'Clear'}</div>
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
    <div className={`w-full flex-1 min-h-0 h-full bg-[#050508] text-zinc-100 select-none p-1 ${isSessionActive ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'}`}>
      {isSessionActive ? renderArenaView() : renderSetupView()}
    </div>
  );
};

export default DreadlerArenaScreen;
