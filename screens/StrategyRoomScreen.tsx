import React, { useState, useEffect, useRef, useContext } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TrialSimContext } from '../App';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { CourtIcon } from '../components/icons/CourtIcon';
import { CitationIcon } from '../components/icons/CitationIcon';
import { searchCaselaw, CaselawResult, CITATION_EXTRACTOR_SYSTEM } from '../services/caselawService';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { renderLegalMarkdown } from '../utils/markdown';

enum ChamberMode {
  ORACLE = 'oracle',
  COUNCIL = 'council',
  SYNTHESIS = 'synthesis',
}

// ─── 7-Phase Synthesis stage table ────────────────────────────────────────────
//
// One source of truth for the Synthesis chamber's prompts, model routing,
// sampling params, display labels, trace keys, and the abbreviated SVG node
// labels. The trace panels (mobile + desktop), the DeliberationBlueprint SVG,
// and the per-stage execution loop all read from this table — so the three
// previously-divergent label spellings ("Judgment Validation & Citation
// Audit" vs "CITATION AUDIT" vs "Citation Audit") now align by construction.
//
// `buildPrompt` is called with a SynthesisContext that is mutated stage-by-
// stage as outputs accumulate (`stages[k] = output`), plus a verification
// block Stage 5 consumes (assembled from real /api/caselaw lookups prior to
// invoking the audit prompt).

interface JurisdictionInfo {
  label: string;
  instruction: string;
}

interface SynthesisContext {
  dispute: string;
  stages: Record<string, string>;
  retrievedPrecedents: CaselawResult[];
  retrievalAvailable: boolean;
  verificationBlock: string;
}

interface SynthesisStage {
  key: string;
  label: string;          // canonical — trace panels
  svgLabel: string;        // abbreviated — DeliberationBlueprint SVG node
  icon: string;            // two-letter SVG node glyph
  model: string;
  temperature: number;
  maxTokens: number;
  system: (juris: JurisdictionInfo) => string;
  buildPrompt: (ctx: SynthesisContext, juris: JurisdictionInfo) => string;
  interimBubble: string;    // status line shown while the stage runs
}

const SYNTHESIS_STAGES: SynthesisStage[] = [
  {
    key: 'systemic-matrix',
    label: 'Systemic Matrix',
    svgLabel: 'SYSTEMIC MATRIX',
    icon: 'SM',
    model: 'deepseek-chat',
    temperature: 0.5,
    maxTokens: 1200,
    system: () => 'Comprehensive systemic legal auditor.',
    buildPrompt: (_ctx, juris) =>
      `Map the 24 conflicting interests and legal forces in play for this dispute. ${juris.instruction}\n\nDispute facts: ${_ctx.dispute}`,
    interimBubble: 'Mapping conflicting systemic forces and stakeholder interest matrices...',
  },
  {
    key: 'precedent-scan',
    label: 'Jurisdictional Precedent Scan',
    svgLabel: 'PRECEDENT SCAN',
    icon: 'PS',
    model: 'deepseek-chat',
    temperature: 0.4,
    maxTokens: 2000,
    system: (juris) => `${juris.label} legal precedent researcher.`,
    buildPrompt: (ctx, juris) => {
      // Stage 2 is the one that consumes real retrieval. The directive below
      // is strict: cite ONLY from the retrieved block; if empty, fall back to
      // widely-accepted black-letter principles and say so explicitly. This
      // is what stops the model from hallucinating neutral citations.
      const retrievedBlock = ctx.retrievedPrecedents.length > 0
        ? ctx.retrievedPrecedents.map((p, i) => (
            `  (${i + 1}) Title: ${p.title}\n` +
            `      Citation: ${p.citation || '(not recorded)'}\n` +
            `      Court: ${p.court || '(not recorded)'}\n` +
            `      Date: ${p.date || '(not recorded)'}\n` +
            `      URL: ${p.url || '(none)'}\n` +
            `      Snippet: ${p.snippet || ''}`
          )).join('\n')
        : '(no precedents were retrieved — see note below)';

      const retrievalNote = !ctx.retrievalAvailable
        ? 'NOTE: Real-time case-law lookup is currently unavailable. Do not invent citations; identify only widely-accepted black-letter principles by name and explain each clearly.'
        : ctx.retrievedPrecedents.length === 0
          ? 'NOTE: The case-law lookup returned zero hits for this dispute. Identify only widely-accepted black-letter principles by name and explain each clearly. Do NOT invent citations.'
          : 'NOTE: You are GIVEN real retrieved precedents above. ONLY cite cases from this block. For each, give the official citation as retrieved, summarise the ratio from the snippet, and explain applicability to the dispute. Do NOT invent or interpolate citations.';

      return (
        `${juris.label} jurisdiction.\n\n` +
        `Dispute facts: ${ctx.dispute}\n\n` +
        `Systemic matrix:\n${ctx.stages['systemic-matrix']}\n\n` +
        `${juris.instruction}\n\n` +
        `## RETRIEVED PRECEDENTS (verified source)\n${retrievedBlock}\n\n` +
        `${retrievalNote}\n\n` +
        `Using the above precedents, summarise at most 12 of the most relevant entries. ` +
        `For each, give: Case Name | Citation | Court | Date | Ratio (inferred from snippet) | ` +
        `Why it applies to this dispute. If the retrieval block is empty, list 3-6 widely-` +
        `accepted black-letter principles instead, clearly labelled as principles (not cases).`
      );
    },
    interimBubble: 'Scanning real case law and judicial precedents...',
  },
  {
    key: 'stress-test',
    label: 'Adversarial Stress Test',
    svgLabel: 'STRESS TEST',
    icon: 'ST',
    model: 'reasoner',
    temperature: 0.5,
    maxTokens: 2000,
    system: () => 'Adversarial prosecuting general.',
    buildPrompt: (ctx, juris) =>
      `Relevant precedents:\n${ctx.stages['precedent-scan']}\n\n${juris.instruction}\n\n` +
      `Client premise: ${ctx.dispute}\n\n` +
      `Generate the absolute most damaging counter-argument that opposing counsel could ` +
      `raise to destroy this case, citing adverse precedent where possible (only from the ` +
      `retrieved precedents above).`,
    interimBubble: 'Simulating high-stakes opposition rebuttals and counterclaims...',
  },
  {
    key: 'adversarial-synthesis',
    label: 'Adversarial Synthesis',
    svgLabel: 'ADVERS. SYNTH',
    icon: 'AS',
    model: 'reasoner',
    temperature: 0.5,
    maxTokens: 2500,
    system: () => 'Senior advocate and strategic synthesis master.',
    buildPrompt: (ctx, juris) =>
      `Client premise: ${ctx.dispute}\n\n${juris.instruction}\n\n` +
      `Relevant precedents:\n${ctx.stages['precedent-scan']}\n\n` +
      `Adversarial counter-arguments:\n${ctx.stages['stress-test']}\n\n` +
      `Formulate a unified, unbreakable litigation strategy and motion draft plan ` +
      `that inoculates the client against these specific attacks and leverages the ` +
      `identified precedents (cite them as presented in the precedent scan; do not ` +
      `invent new citations).`,
    interimBubble: 'Synthesizing unified litigation strategy with precedent support...',
  },
  {
    key: 'citation-audit',
    label: 'Judgment Validation & Citation Audit',
    svgLabel: 'CITATION AUDIT',
    icon: 'CA',
    model: 'reasoner',
    temperature: 0.4,
    maxTokens: 2500,
    system: (juris) => `${juris.label} citation validation clerk.`,
    buildPrompt: (ctx, juris) => {
      // The verification block is assembled by the orchestrator before this
      // stage runs — it contains real treatment-status rows from /api/caselaw
      // lookups of each candidate case extracted from the Stage 4 strategy.
      // When retrieval was unavailable, every cited case is auto-marked
      // UNVERIFIED so the audit table never fabricates a "good law" verdict.
      const verification = ctx.verificationBlock
        ? `## VERIFICATION BLOCK (real lookup results)\n${ctx.verificationBlock}\n\n`
        : `## VERIFICATION BLOCK\nReal lookup was unavailable for this jurisdiction. ` +
          `Mark EVERY cited case as "UNVERIFIED — manual check required" in the audit table.\n\n`;

      return (
        `Litigation strategy and motion draft:\n${ctx.stages['adversarial-synthesis']}\n\n` +
        `${juris.instruction}\n\n` +
        verification +
        `Extract EVERY specific case or judgment cited in the above strategy. For each, ` +
        `determine:\n` +
        `1. Cross-reference the case against the VERIFICATION BLOCK above to confirm status. ` +
        `2. Has this judgment been overruled, reversed, or overruled in part (only if the ` +
        `verification block states so — otherwise mark UNVERIFIED)?\n` +
        `3. Is it still binding / precedential in the ${juris.label} jurisdiction?\n` +
        `4. Are there any conflicting judgments on the same point of law?\n\n` +
        `Output a validation table with columns: Case Name | Citation | Current Status | ` +
        `Cited/Followed By | Risk Level (High/Medium/Low/UNVERIFIED). ` +
        `Any case NOT present in the VERIFICATION BLOCK must be marked UNVERIFIED.`
      );
    },
    interimBubble: 'Validating cited judgments against real lookup results...',
  },
  {
    key: 'risk-analysis',
    label: 'Risk & Vulnerability Analysis',
    svgLabel: 'RISK ANALYSIS',
    icon: 'RA',
    model: 'deepseek-chat',
    temperature: 0.4,
    maxTokens: 2000,
    system: (juris) => `${juris.label} litigation risk auditor.`,
    buildPrompt: (ctx, juris) =>
      `Litigation strategy:\n${ctx.stages['adversarial-synthesis']}\n\n${juris.instruction}\n\n` +
      `Citation audit:\n${ctx.stages['citation-audit']}\n\n` +
      `Perform a comprehensive ${juris.label} risk analysis covering:\n` +
      `1. Procedural risks (limitation periods, jurisdiction bars, maintainability)\n` +
      `2. Evidentiary vulnerabilities\n` +
      `3. Adverse-precedent risk flagged in the citation audit (especially UNVERIFIED rows)\n` +
      `4. Counter-party strategy risks\n` +
      `5. Proposed mitigation strategies for each identified risk`,
    interimBubble: 'Performing comprehensive risk and vulnerability audit...',
  },
  {
    key: 'final-draft',
    label: 'Final Motion Draft',
    svgLabel: 'FINAL DRAFT',
    icon: 'FD',
    model: 'deepseek-chat',
    temperature: 0.4,
    maxTokens: 4096, // Memo must NOT truncate at the old server cap of 1000.
    system: () => 'Master litigator and senior judicial clerk.',
    buildPrompt: (ctx, juris) =>
      `Full analysis:\n` +
      `Precedents: ${ctx.stages['precedent-scan']}\n` +
      `Strategy: ${ctx.stages['adversarial-synthesis']}\n` +
      `Citation audit: ${ctx.stages['citation-audit']}\n` +
      `Risk analysis: ${ctx.stages['risk-analysis']}\n\n` +
      `${juris.instruction}\n\n` +
      `Produce the final, court-ready advisory memorandum and motion draft. Structure it as:\n` +
      `1. Case Overview & Material Facts\n` +
      `2. Points of Determination / Issues\n` +
      `3. Arguments (with ${juris.label} precedent citations from the scan — only those present in the citation audit's verified rows)\n` +
      `4. Citation Appendix (with validation-status note per case from the audit; UNVERIFIED cases flagged)\n` +
      `5. Risk Register & Mitigations\n` +
      `6. Proposed Motion / Pleading Draft\n\n` +
      `Remove all meta-commentary, stage labels, and introductory summaries. ` +
      `Output only the polished legal deliverable.`,
    interimBubble: 'Polishing final court-ready motion draft...',
  },
];

// Index by stage.key for O(1) lookup during execution + UI trace rendering.
const SYNTHESIS_BY_KEY: Record<string, SynthesisStage> = Object.fromEntries(
  SYNTHESIS_STAGES.map(s => [s.key, s])
);

interface Persona {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  avatar: string;
  color?: string;
  tagline?: string;
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
    color: 'text-brand-rust',
    tagline: 'Procedural lapses are the defense\'s best friend.',
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
  // Citations actually retrieved for Stage 2 — surfaced inline in the bubble
  // so the user can audit the model's claims against the real source.
  citations?: CaselawResult[];
  // Treatment-status evidence backing Stage 5's audit table. Empty for any
  // non-Synthesis assistant bubble.
  verification?: VerificationRow[];
  // Footnote about retrieval health, shown bottom-right of the bubble.
  retrievalNote?: string;
}

interface VerificationRow {
  caseName: string;
  citation: string;
  status: string;       // e.g. "Verified — located via IndianKanoon"
  url?: string;
  dates?: string;
  court?: string;
}

const DeliberationBlueprint: React.FC<{
  activeTab: ChamberMode;
  isProcessing: boolean;
  oracleStage: string;
  oracleTrace: { stage: string; content: string }[];
  selectedPersona: Persona;
  setSelectedPersona: (p: Persona) => void;
}> = ({
  activeTab,
  isProcessing,
  oracleTrace,
  selectedPersona,
  setSelectedPersona,
}) => {
  const [, setHoveredNode] = useState<string | null>(null);

  const styleBlock = (
    <style>{`
      @keyframes dashoffset-flow {
        to {
          stroke-dashoffset: -20;
        }
      }
      @keyframes pulse-glow-vermilion {
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
      .dash-flow-vermilion {
        stroke: #D6BA91;
        stroke-dasharray: 6, 6;
        animation: dashoffset-flow 1.2s linear infinite;
      }
      .dash-flow-blue {
        stroke: #8EA38C;
        stroke-dasharray: 6, 6;
        animation: dashoffset-flow 1.2s linear infinite;
      }
      .pulse-vermilion {
        animation: pulse-glow-vermilion 2s infinite ease-in-out;
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
      <div className="w-full flex flex-col items-center justify-center p-4 bg-brand-bg-secondary border border-brand-border rounded-2xl shadow-sm">
        <svg viewBox="0 0 400 200" className="w-full h-auto max-h-[170px]">
          {styleBlock}
          
          <circle cx="200" cy="100" r="50" fill="none" stroke="#D6BA91" strokeOpacity="0.03" strokeWidth="1" strokeDasharray="8,8" className="spin-hub" />

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
                  stroke={isCompleted ? "#D6BA91" : "#2F3C38"}
                  strokeWidth="2"
                  strokeOpacity={isCompleted ? "0.8" : "0.25"}
                />
                {isFlowing && (
                  <line
                    x1={n.cx}
                    y1={n.cy}
                    x2={nextNode.cx}
                    y2={nextNode.cy}
                    className="dash-flow-vermilion"
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
                  fill={isCompleted ? "#D6BA91" : "#0E1513"}
                  fillOpacity={isCompleted ? "0.15" : "0.9"}
                  stroke={isActive ? "#E5D4BC" : isCompleted ? "#D6BA91" : "#2F3C38"}
                  strokeWidth={isActive ? "2.5" : "1.5"}
                  className={isActive ? "pulse-vermilion" : ""}
                />
                
                {isCompleted ? (
                  <text x={n.cx} y={n.cy + 3.5} textAnchor="middle" fill="#D6BA91" fontSize="9" fontFamily="monospace" fontWeight="bold">§</text>
                ) : (
                  <text x={n.cx} y={n.cy + 3.5} textAnchor="middle" fill={isPending ? "#455651" : "#EAE6DF"} fontSize="9" fontFamily="serif" fontWeight="bold">{n.icon}</text>
                )}

                <text
                  x={n.cx}
                  y={n.cy + 28}
                  textAnchor="middle"
                  fill={isActive ? "#D6BA91" : isCompleted ? "#EAE6DF" : "#8EA38C"}
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
            <circle cx="0" cy="0" r="12" fill="#0E1513" stroke="#D6BA91" strokeWidth="1.5" strokeOpacity={isProcessing ? "0.8" : "0.2"} />
            <text x="0" y="3.5" textAnchor="middle" fill="#D6BA91" fillOpacity={isProcessing ? "1" : "0.3"} fontSize="9" fontFamily="mono" fontWeight="bold">Ω</text>
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
      <div className="w-full flex flex-col items-center justify-center p-4 bg-brand-bg-secondary border border-brand-border rounded-2xl shadow-sm">
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
                  stroke={isSelected ? "#D6BA91" : "#2F3C38"}
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
                      className="dash-flow-vermilion"
                      strokeWidth="2"
                    />
                    <circle r="4" fill="#D6BA91">
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
            <circle cx="0" cy="0" r="20" fill="#0E1513" stroke="#D6BA91" strokeWidth="2" className="pulse-vermilion" />
            <circle cx="0" cy="0" r="15" fill="#2F3C38" stroke="#EAE6DF" strokeOpacity="0.05" />
            <text x="0" y="3.5" textAnchor="middle" fill="#D6BA91" fontSize="10" fontFamily="mono" fontWeight="bold">§</text>
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
                  fill={isSelected ? "#D6BA91" : "#0E1513"}
                  fillOpacity={isSelected ? "0.15" : "0.9"}
                  stroke={isSelected ? "#D6BA91" : "#2F3C38"}
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                  className={isSelected ? "pulse-vermilion" : ""}
                />
                
                <text x={j.cx} y={j.cy + 3.5} textAnchor="middle" fill={isSelected ? "#D6BA91" : "#EAE6DF"} fontSize="9" fontFamily="mono" fontWeight="bold">{j.avatar}</text>
                
                <text
                  x={j.cx}
                  y={j.cy + 27}
                  textAnchor="middle"
                  fill={isSelected ? "#D6BA91" : "#8EA38C"}
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
		    // Nodes read from the SYNTHESIS_STAGES table — same labels, icons, model
		    // badges that the trace panels and pipeline use, so all three always agree.
		    // Coordinates are hand-placed for a balanced 7-node wheel.
		    const center = { x: 200, y: 105 };
		    const nodePositions = [
		      { cx: 200, cy: 33 },   // systemic-matrix
		      { cx: 266, cy: 62 },   // precedent-scan
		      { cx: 273, cy: 105 },  // stress-test
		      { cx: 242, cy: 147 },  // adversarial-synthesis
		      { cx: 158, cy: 147 },  // citation-audit
		      { cx: 127, cy: 105 },  // risk-analysis
		      { cx: 134, cy: 62 },   // final-draft
		    ];
		    const activeStageIndex = oracleTrace.length;

		    return (
		      <div className="w-full flex flex-col items-center justify-center p-4 bg-brand-bg-secondary border border-brand-border rounded-2xl shadow-sm">
		        <svg viewBox="0 0 400 210" className="w-full h-auto max-h-[170px]">
		          {styleBlock}

		          {/* Ring */}
		          <circle cx={center.x} cy={center.y} r="50" fill="none" stroke="#8EA38C" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="4,6" className="spin-hub" />

		          {/* Connection edges — ring + chord to center */}
		          {SYNTHESIS_STAGES.map((stg, i) => {
		            const n = nodePositions[i];
		            const nextIdx = (i + 1) % SYNTHESIS_STAGES.length;
		            const nextPos = nodePositions[nextIdx];
		            const segDone = i + 1 < activeStageIndex;
		            return (
		              <g key={`ring-${stg.key}`}>
		                <line x1={n.cx} y1={n.cy} x2={nextPos.cx} y2={nextPos.cy}
		                  stroke={segDone ? "#D6BA91" : "#2F3C38"}
		                  strokeWidth="1.5" strokeOpacity={segDone ? "0.7" : "0.2"} />
		                {isProcessing && i <= activeStageIndex && (
		                  <line x1={n.cx} y1={n.cy} x2={nextPos.cx} y2={nextPos.cy}
		                    className="dash-flow-vermilion" strokeWidth="1.5" />
		                )}
		              </g>
		            );
		          })}

		          {/* Center hub */}
		          <g transform={`translate(${center.x}, ${center.y})`} className="float-1">
		            <circle cx="0" cy="0" r="18" fill="#0E1513" stroke="#D6BA91" strokeWidth="2" className="pulse-vermilion" />
		            <circle cx="0" cy="0" r="12" fill="#2F3C38" stroke="#EAE6DF" strokeOpacity="0.05" />
		            <text x="0" y="4" textAnchor="middle" fill="#D6BA91" fontSize="9" fontFamily="mono" fontWeight="bold">7Φ</text>
		            {isProcessing && (
		              <circle cx="0" cy="0" r="23" fill="none" stroke="#D6BA91" strokeOpacity="0.3" strokeWidth="0.8" strokeDasharray="3,3" />
		            )}
		          </g>

		          {/* Nodes */}
		          {SYNTHESIS_STAGES.map((stg, i) => {
		            const n = nodePositions[i];
		            const completed = i < activeStageIndex;
		            const active = isProcessing && i === activeStageIndex;
		            return (
		              <g key={`node-${stg.key}`}
		                className={i <= 4 ? "float-1" : "float-2"}>
		                <circle cx={n.cx} cy={n.cy} r="14"
		                  fill={completed ? "#D6BA91" : "#0E1513"}
		                  fillOpacity={completed ? "0.15" : "0.9"}
		                  stroke={active ? "#E5D4BC" : completed ? "#D6BA91" : "#2F3C38"}
		                  strokeWidth={active ? "2.5" : "1.2"}
		                  className={active ? "pulse-vermilion" : ""} />
		                <text x={n.cx} y={n.cy + 3} textAnchor="middle"
		                  fill={completed || active ? "#D6BA91" : "#455651"}
		                  fontSize="8" fontFamily="monospace" fontWeight="bold">{completed ? '§' : stg.icon}</text>
		                <text x={n.cx} y={n.cy - 17} textAnchor="middle"
		                  fill={active ? "#D6BA91" : completed ? "#EAE6DF" : "#8EA38C"}
		                  fontSize="6" fontWeight={active ? "bold" : "normal"} fontFamily="monospace">
		                  {stg.svgLabel}
		                </text>
		              </g>
		            );
		          })}
		        </svg>
		      </div>
		    );
		  }

  return null;
};

export const StrategyRoomScreen: React.FC = () => {
  const context = useContext(TrialSimContext);
  if (!context) throw new Error('TrialSimContext not found');
  const { practiceMode } = context;
  // Strategy Room uses a 1024px mobile breakpoint (wider than the 768px default
  // because the duel-plinth desktop layout needs more horizontal room).
  const { vpHeight, isMobile } = useVisualViewport({ breakpoint: 1024, mobileOffset: 80 });

  // ─── Citation & verification panel ───────────────────────────────────────────
  // Renders real retrieved-precedents and/or verification rows inside an assistant
  // bubble for Synthesis stages 2 and 5. Falls through without output when there
  // is nothing to show.
  const renderCitationPanel = (item: ChatBubble) => {
    const hasCitations = item.citations && item.citations.length > 0;
    const hasVerification = item.verification && item.verification.length > 0;
    if (!hasCitations && !hasVerification && !item.retrievalNote) return null;

    return (
      <div className="mt-2 pt-2 border-t border-white/10 space-y-2">
        {/* Retrieved precedents (Stage 2) */}
        {hasCitations && (
          <div className="p-2 bg-brand-bg-primary/50 border border-brand-border rounded-xl space-y-1.5">
            <h6 className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase tracking-wider text-brand-text-primary/80">
              <CitationIcon className="w-3 h-3" /> Retrieved Precedents
            </h6>
            {(item.citations || []).map((c, i) => (
              <div key={i} className="text-[9px] space-y-0.5 p-1.5 bg-brand-bg-primary/30 rounded-lg border border-brand-border/30">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-brand-text-primary leading-tight">{c.title}</span>
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noopener noreferrer"
                      className="text-brand-accent hover:text-brand-accent-hover flex-shrink-0 mt-0.5"
                      title="Open in IndianKanoon">
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  ) : null}
                </div>
                {(c.citation || c.court || c.date) && (
                  <div className="text-[7px] font-mono text-brand-text-secondary/60 flex flex-wrap gap-x-2">
                    {c.citation && <span>📖 {c.citation}</span>}
                    {c.court && <span>⚖ {c.court}</span>}
                    {c.date && <span>📅 {c.date}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Verification rows (Stage 5) */}
        {hasVerification && (
          <div className="p-2 bg-brand-bg-primary/50 border border-brand-border rounded-xl space-y-1">
            <h6 className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase tracking-wider text-brand-text-primary/80">
              <CitationIcon className="w-3 h-3" /> Citation Verification
            </h6>
            {(item.verification || []).map((v, i) => (
              <div key={i} className="text-[8px] flex items-center gap-1.5 py-1 border-b border-brand-border/20 last:border-b-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  v.status.startsWith('Verified') ? 'bg-brand-success' : 'bg-amber-500'
                }`} />
                <span className="font-semibold text-brand-text-primary/90 truncate">{v.caseName}</span>
                <span className="text-brand-text-secondary/50">·</span>
                <span className="text-brand-text-secondary/70 truncate max-w-[120px]">{v.citation}</span>
                <span className={`ml-auto flex-shrink-0 text-[7px] font-mono ${
                  v.status.startsWith('Verified') ? 'text-brand-success' : 'text-amber-400'
                }`}>
                  {v.status.startsWith('Verified') ? '✓' : '⚠'} {v.status.slice(0, 15)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Retrieval health note */}
        {item.retrievalNote && (
          <div className={`text-[7px] font-mono px-2 py-1 rounded-lg flex items-center gap-1 ${
            item.retrievalNote.includes('Verified') || item.retrievalNote.includes('retrieved')
              ? 'bg-brand-success/10 text-brand-success border border-brand-success/30'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
          }`}>
            <span>{item.retrievalNote.includes('Verified') || item.retrievalNote.includes('retrieved') ? 'ℹ' : '⚠'}</span>
            <span>{item.retrievalNote}</span>
          </div>
        )}
      </div>
    );
  };

  const [activeTab, setActiveTab] = useState<ChamberMode>(ChamberMode.ORACLE);
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);

  const [inputVal, setInputVal] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [oracleStage, setOracleStage] = useState<string>('');
  const [oracleTrace, setOracleTrace] = useState<{ stage: string; content: string }[]>([]);
  const [showReasoningLogs, setShowReasoningLogs] = useState<boolean>(false);

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

  const handleSpeak = (text: string) => {
    try {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/\*\*|_/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 800));

      let pitch = 1.0;
      let rate = 1.0;

      if (selectedPersona.id === 'leibowitz') { pitch = 0.8; rate = 0.95; }
      else if (selectedPersona.id === 'richelieu') { pitch = 0.7; rate = 0.85; }
      else if (selectedPersona.id === 'jethmalani') { pitch = 1.1; rate = 1.1; }
      else if (selectedPersona.id === 'nariman') { pitch = 0.9; rate = 0.95; }
      else if (selectedPersona.id === 'parfit') { pitch = 1.0; rate = 1.0; }

      utterance.pitch = pitch;
      utterance.rate = rate;

      const voices = window.speechSynthesis.getVoices();
      const preferredLang = practiceMode === 'indian' ? 'en-IN' : 'en-US';
      const voice = voices.find(v => v.lang.includes(preferredLang)) || voices.find(v => v.lang.startsWith('en')) || voices[0];
      if (voice) {
        utterance.voice = voice;
      }

      window.speechSynthesis.speak(utterance);
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
            language: 'en-IN',
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

  const appendBubble = (tab: string, sender: 'user' | 'assistant' | 'system', text: string, meta?: string, trace?: { stage: string; content: string }[], extras?: { citations?: CaselawResult[]; verification?: VerificationRow[]; retrievalNote?: string }) => {
    const newBubble: ChatBubble = {
      id: `${tab}-${Date.now()}-${Math.random()}`,
      sender,
      text,
      meta,
      trace,
      citations: extras?.citations,
      verification: extras?.verification,
      retrievalNote: extras?.retrievalNote,
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
      text: activeTab === ChamberMode.COUNCIL 
          ? `Consulting ${selectedPersona.name}...` 
          : 'Deliberation initiated. Mobilizing the Oracle reasoning engines...',
      meta: activeTab === ChamberMode.COUNCIL
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

    const updateProvisionalBubble = (bubbleText: string, bubbleTrace?: { stage: string; content: string }[], bubbleMeta?: string, extras?: { citations?: CaselawResult[]; verification?: VerificationRow[]; retrievalNote?: string }) => {
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
                meta: bubbleMeta || bubble.meta,
                citations: extras?.citations ?? bubble.citations,
                verification: extras?.verification ?? bubble.verification,
                retrievalNote: extras?.retrievalNote ?? bubble.retrievalNote,
              };
            }
            return bubble;
          })
        };
      });
    };

    try {
      if (activeTab === ChamberMode.ORACLE) {
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
		        const jurisLabel = practiceMode === 'indian' ? 'INDIAN' : 'INTERNATIONAL';
		        const jurisInstruction = practiceMode === 'indian'
		          ? 'CRITICAL: You operate in the INDIAN legal system. ONLY cite Indian Supreme Court, High Court, or Tribunal judgments. NEVER reference international, foreign, or comparative jurisdiction case law.'
		          : 'CRITICAL: You operate in the INTERNATIONAL legal system. ONLY cite international tribunals (ICJ, ICC, WTO, ICSID, etc.) or foreign domestic courts appropriate to the case jurisdiction. NEVER reference Indian judgments or Indian legal principles.';
		        const jurisInfo: JurisdictionInfo = { label: jurisLabel, instruction: jurisInstruction };

		        // Run all Synthesis stages sequentially from the declarative table.
		        // Stages build on one another via `ctx.stages[k] = output`.
		        const ctx: SynthesisContext = {
		          dispute: text,
		          stages: {},
		          retrievedPrecedents: [],
		          retrievalAvailable: false,
		          verificationBlock: '',
		        };

		        // ── Stage 1: Systemic Matrix (no retrieval) ──────────────
		        let trace: { stage: string; content: string }[] = [];
		        for (let i = 0; i < SYNTHESIS_STAGES.length; i++) {
		          const stg = SYNTHESIS_STAGES[i];

		          // Pre-stage hooks: do retrieval before Stage 2, and citation
		          // verification before Stage 5.
		          if (stg.key === 'precedent-scan') {
		            setOracleStage('(retrieving real precedents via IndianKanoon…)');
		            try {
		              const caselawResp = await searchCaselaw(text, practiceMode ?? 'common', 8);
		              ctx.retrievedPrecedents = caselawResp.results;
		              ctx.retrievalAvailable = caselawResp.available;
		              ctx.stages['precedent-scan-retrieval-count'] = String(caselawResp.results.length);
		            } catch {
		              ctx.retrievedPrecedents = [];
		              ctx.retrievalAvailable = false;
		            }
		          }

		          if (stg.key === 'citation-audit') {
		            setOracleStage('(extracting cited cases for real verification…)');
		            try {
		              // Extract candidate case names from the Stage 4 strategy output.
		              const extractorResp = await callChatAPI(
		                ctx.stages['adversarial-synthesis'] || '',
		                CITATION_EXTRACTOR_SYSTEM,
		                'deepseek-chat',
		                signal,
		              );
		              let candidates: { caseName: string; citation: string }[] = [];
		              try {
		                const cleaned = extractorResp.trim()
		                  .replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '').trim();
		                const parsed = JSON.parse(cleaned);
		                if (Array.isArray(parsed)) candidates = parsed.slice(0, 12);
		              } catch { /* non-JSON response — skip verification */ }

		              // Batch-verify each candidate via /api/caselaw.
		              if (candidates.length > 0) {
		                const verificationRows: VerificationRow[] = [];
		                for (const cand of candidates) {
		                  const query = `${cand.caseName} ${cand.citation}`.trim();
		                  if (!query) continue;
		                  try {
		                    const resp = await searchCaselaw(query, practiceMode ?? 'common', 1);
		                    const hit = resp.results[0];
		                    verificationRows.push({
		                      caseName: cand.caseName,
		                      citation: hit?.citation || cand.citation,
		                      status: hit
		                        ? `Verified — located via ${resp.provider || 'IndianKanoon'}`
		                        : 'UNVERIFIED — not found in real lookup',
		                      url: hit?.url,
		                      dates: hit?.date,
		                      court: hit?.court,
		                    });
		                  } catch {
		                    verificationRows.push({
		                      caseName: cand.caseName,
		                      citation: cand.citation,
		                      status: 'UNVERIFIED — lookup failed',
		                    });
		                  }
		                }
		                ctx.verificationBlock = [
		                  'Verified citation status from real case-law lookup:',
		                  ...verificationRows.map(v =>
		                    `  - ${v.caseName} (${v.citation}): ${v.status}`
		                  ),
		                ].join('\n');
		                // Store on the final bubble so the user can inspect.
		                (ctx as any).__verificationRows = verificationRows;
		              } else {
		                ctx.verificationBlock = `No candidates were extractable from the strategy text. Mark every cited case as UNVERIFIED.`;
		                (ctx as any).__verificationRows = [];
		              }
		            } catch {
		              ctx.verificationBlock = 'Real-case verification encountered an error. Mark every cited case as UNVERIFIED.';
		              (ctx as any).__verificationRows = [];
		            }
		          }

		          // ── Execute the stage ────────────────────────────────
		          const phaseLabel = `${i + 1}/${SYNTHESIS_STAGES.length}: ${stg.label}`;
		          setOracleStage(`Phase ${phaseLabel} — ${stg.interimBubble}…`);

		          const stagePrompt = stg.buildPrompt(ctx, jurisInfo);
		          const stageSystem = stg.system(jurisInfo);
		          const output = await callChatAPI(
		            stagePrompt,
		            stageSystem,
		            stg.model,
		            signal,
		          );

		          ctx.stages[stg.key] = output;
		          trace = [...trace, { stage: stg.label, content: output }];
		          setOracleTrace(trace);

		          // After Stage 2, attach the retrieved precedents to the bubble.
		          let bubbleCitations: CaselawResult[] | undefined;
		          let bubbleNote: string | undefined;
		          if (stg.key === 'precedent-scan') {
		            bubbleCitations = ctx.retrievedPrecedents.length > 0
		              ? ctx.retrievedPrecedents : undefined;
		            bubbleNote = !ctx.retrievalAvailable
		              ? 'Real case-law lookup unavailable — citations may be unverified. International lookup pending.'
		              : ctx.retrievedPrecedents.length === 0
		                ? 'Case-law lookup returned no hits — the model was asked to rely on black-letter principles only.'
		                : `Retrieved ${ctx.retrievedPrecedents.length} real case${ctx.retrievedPrecedents.length !== 1 ? 's' : ''} from IndianKanoon.`;
		          }

		          // After Stage 5, attach verification rows to the bubble.
		          let bubbleVerification: VerificationRow[] | undefined;
		          if (stg.key === 'citation-audit') {
		            bubbleVerification = (ctx as any).__verificationRows;
            bubbleNote = (ctx as any).__verificationRows?.some((v: VerificationRow) => v.status.startsWith('Verified'))
              ? `Verified ${(ctx as any).__verificationRows.filter((v: VerificationRow) => v.status.startsWith('Verified')).length} of ${(ctx as any).__verificationRows.length} cited cases via IndianKanoon.`
		              : 'None of the cited cases could be verified via real lookup — treat all citation-status claims with caution.';
		          }

		          updateProvisionalBubble(
		            stg.key === 'final-draft' ? output : stg.interimBubble,
		            trace,
		            stg.key === 'final-draft' ? 'Synthesized Adversarial Memo' : undefined,
		            { citations: bubbleCitations, verification: bubbleVerification, retrievalNote: bubbleNote },
		          );
		        }
		      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        updateProvisionalBubble('[Cancelled] Deliberation cancelled by user.');
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
        updateProvisionalBubble(`[Error] ${err.message || err}`);
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
    <div 
      className="w-full flex flex-col overflow-hidden animate-fadeIn h-full"
      style={{ height: isMobile ? `${vpHeight}px` : '100%' }}
    >
      
      {/* ========================================================================= */}
      {/* MOBILE APP-STYLE LAYOUT (Phones & Tablets < 1024px)                        */}
      {/* ========================================================================= */}
      <div className="lg:hidden flex flex-col text-left relative h-full min-h-0">
        
        {/* Dynamic Mode Tab Bar Selector — compact for mobile */}
        <div className="w-full flex flex-col gap-1 p-1.5 border border-brand-text-primary/30 bg-brand-bg-primary rounded-xl mb-2">
          <div className="grid grid-cols-3 gap-1 w-full select-none">
            {[
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
                  className={`px-1.5 py-1.5 rounded-xl border text-[9px] font-medium font-serif flex items-center justify-center gap-1 
                    ${isActive 
                      ? 'bg-brand-text-primary text-brand-bg-primary border-brand-accent font-semibold' 
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

        {/* Mobile Vertical Scroll for Persona Council — more compact */}
        {activeTab === ChamberMode.COUNCIL && (
          <div className="w-full flex flex-col gap-0.5 mb-2">
            <span className="text-[8px] font-serif font-bold text-brand-text-primary/80 block ml-1">Consult Jurist</span>
            <div className="grid grid-cols-5 gap-1.5 select-none items-start w-full">
              {PERSONAS.map((p) => {
                const isSelected = selectedPersona.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPersona(p)}
                    className="flex flex-col items-center gap-0.5 focus:outline-none min-w-0"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-mono font-bold border relative
                      ${isSelected 
                        ? 'bg-brand-text-primary text-brand-bg-primary border-brand-accent' 
                        : 'bg-brand-bg-primary border-brand-text-primary/30 text-brand-text-primary/80'
                      }`}
                    >
                      {p.avatar}
                      {isSelected && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-brand-accent text-brand-navy rounded-xl border border-brand-navy flex items-center justify-center text-[6px] font-bold">§</span>
                      )}
                    </div>
                    <span className={`text-[7px] tracking-wide font-mono transition-colors text-center truncate w-full
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
        <div className="flex-grow flex flex-col bg-brand-bg-primary border border-brand-text-primary/30 rounded-xl overflow-hidden relative shadow-inner-subtle min-h-[150px]">
          {/* Chat Feed (Mobile) */}
          <div className="flex-grow p-3 overflow-y-auto space-y-3 custom-scrollbar text-left relative z-10">
            {activeHistory.length <= 1 && (
              <div className="p-2 border border-brand-text-primary/30 bg-brand-bg-primary rounded-xl space-y-1 text-left mb-2">
                <h4 className="text-[10px] font-serif font-bold text-shimmer flex items-center gap-1.5">
                  <span className="font-serif font-bold border-r pr-1.5 mr-1.5">[ CHAMBER ]</span>
                  <span>
                    {activeTab === ChamberMode.ORACLE ? 'Oracle Deliberation' : activeTab === ChamberMode.COUNCIL ? 'Historical Council' : 'Adversarial Synthesis'}
                  </span>
                </h4>
                <p className="text-[9px] text-brand-text-secondary font-light leading-relaxed">
                  {activeTab === ChamberMode.ORACLE 
                      ? 'Deep multi-stage legal reasoning to build defensive trial plans.'
                      : activeTab === ChamberMode.COUNCIL
                        ? `Consult jurists. Tap avatar bubbles above to switch.`
                        : 'Deconstruct disputes and synthesize litigation tactics.'}
                </p>
              </div>
            )}

            {activeHistory.map((item) => (
              <div key={item.id} className={`flex flex-col ${item.sender === 'user' ? 'items-end' : 'items-start'} `}>
                <div className="flex items-center space-x-1.5 mb-0.5 text-[7px] font-mono">
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
                  className={`max-w-[92%] p-2.5 rounded-xl text-[11px] leading-relaxed border  
                    ${item.sender === 'user'
                      ? 'bg-brand-accent/15 border-brand-text-primary/30 text-brand-text-primary rounded-tr-none'
                      : item.sender === 'system'
                        ? 'bg-brand-error/10 border-brand-error/30 text-brand-error rounded-tl-none font-mono text-[10px]'
                        : 'bg-brand-bg-secondary/70 border-brand-border text-brand-text-primary rounded-tl-none'
                    }`}
                >
                  <div className="font-light text-brand-text-primary">{renderLegalMarkdown(item.text)}</div>
                  
                  {renderCitationPanel(item)}

                  {item.trace && item.trace.length > 0 && (
                    <details className="mt-2 pt-2 border-t border-white/10 text-[10px] font-light text-brand-text-secondary/80">
                      <summary className="cursor-pointer text-[8px] font-mono uppercase tracking-wider text-brand-text-primary font-semibold hover:text-brand-text-primary focus:outline-none">
                        ▶ View Trace Logs ({item.trace.length})
                      </summary>
                      <div className="mt-2 space-y-2 font-sans text-[10px]">
                        {item.trace.map((tr, index) => (
                          <div key={index} className="space-y-1 p-1.5 bg-brand-bg-primary/50 border border-white/5 rounded-xl text-left">
                            <h6 className="font-mono text-[8px] font-bold text-brand-text-primary font-semibold uppercase tracking-wider border-b border-brand-text-primary/30 pb-0.5">
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
                  <div className="flex space-x-1.5 mt-1 pl-1.5">
                    <button
                      onClick={() => handleSpeak(item.text)}
                      className="px-1.5 py-0.5 border border-brand-text-primary/30 rounded bg-brand-bg-primary hover:bg-brand-text-primary text-brand-bg-primary text-[8px] font-mono uppercase tracking-wide text-brand-text-primary font-semibold cursor-pointer"
                    >
                      Speak
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(item.text)}
                      className="px-1.5 py-0.5 border border-white/10 rounded bg-brand-bg-primary hover:bg-white/5 text-[8px] font-mono uppercase tracking-wide text-brand-text-secondary cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            ))}

            {isProcessing && oracleStage && (
              <div className="flex flex-col gap-3 items-start max-w-sm w-full my-2">
                <div className="w-full p-3 rounded-xl bg-brand-navy border border-brand-text-primary/30 space-y-2 text-left">
                  <div className="flex items-center justify-between border-b border-brand-text-primary/30 pb-1.5">
                    <div className="flex items-center space-x-2">
                      <LoadingSpinner size="sm" spinnerColor="text-brand-text-primary font-semibold" />
                      <span className="text-[8px] font-mono tracking-widest text-brand-text-primary font-semibold uppercase font-bold">{oracleStage}</span>
                    </div>
                    <button 
                      onClick={handleCancel}
                      className="text-[7px] font-mono uppercase px-1.5 py-0.5 border border-brand-error/40 rounded bg-brand-error/10 text-brand-error hover:bg-brand-error/25 cursor-pointer font-bold"
                    >
                      [Abort]
                    </button>
                  </div>
                  
                  <div className="space-y-1">
                    {((activeTab === ChamberMode.ORACLE ? [
                      'Framing',
                      'Proposal',
                      'Critique',
                      'Refinement',
                      'Reconcile',
                      'Polish'
                    ] : activeTab === ChamberMode.SYNTHESIS ? SYNTHESIS_STAGES.map(s => s.label)
                    : ['Processing'])).map((stg, idx) => {
                      const isCompleted = idx < oracleTrace.length;
                      const isActive = idx === oracleTrace.length;
                      return (
                        <div key={idx} className="flex items-center justify-between text-[8px] font-mono">
                          <div className="flex items-center space-x-1.5">
                            <span className={`w-2.5 h-2.5 rounded-xl flex items-center justify-center border text-[6px] font-bold
                              ${isCompleted ? 'bg-brand-accent/20 border-brand-accent text-brand-text-primary font-semibold' : isActive ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-brand-navy border-brand-text-primary/30 text-brand-text-secondary/20'}`}
                            >
                              {isCompleted ? '§' : idx + 1}
                            </span>
                            <span className={isCompleted ? 'text-brand-text-secondary/60 line-through' : isActive ? 'text-brand-text-primary font-bold' : 'text-brand-text-secondary/35'}>
                              {stg}
                            </span>
                            {/* Per-stage model badge (Synthesis only) */}
                            {activeTab === ChamberMode.SYNTHESIS && SYNTHESIS_BY_KEY[SYNTHESIS_STAGES[idx]?.key] && (
                              <span className="text-[5px] font-mono text-brand-text-secondary/40 ml-1.5">
                                {SYNTHESIS_STAGES[idx].model.replace('deepseek-', 'ds-')}
                              </span>
                            )}
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

          {/* Bottom Input Composer (Mobile) — compact */}
          <div className="p-2 border-t border-brand-text-primary/30 bg-brand-bg-secondary/90 relative z-20">
            {audioError && (
              <div className="p-1.5 mb-1.5 bg-brand-error/10 border border-brand-error/30 text-brand-error text-[9px] rounded-xl text-left">
                [Error] {audioError}
              </div>
            )}

            <form onSubmit={handleSend} className="flex gap-1.5 items-center">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-9 h-9 flex-shrink-0 rounded-xl border flex items-center justify-center focus:outline-none
                  ${isRecording
                    ? 'bg-brand-error/20 border-brand-error text-brand-error'
                    : 'bg-brand-bg-primary border-brand-text-primary/30 text-brand-text-primary font-semibold hover:bg-brand-text-primary text-brand-bg-primary'
                  }`}
                title={isRecording ? 'Stop Recording' : 'Record voice'}
              >
                {isRecording ? (
                  <span className="w-2 h-2 bg-brand-error rounded-sm"></span>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>
                )}
              </button>

              <div className="relative flex-grow flex items-center bg-brand-bg-primary rounded-xl border border-brand-text-primary/30 focus-within:ring-1 focus-within:ring-brand-accent">
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
                        : 'Enter premise...'
                  }
                  className="w-full pl-2.5 pr-9 py-2 bg-transparent text-brand-text-primary outline-none text-[11px] font-light placeholder-brand-text-secondary/30"
                />
                
                {isProcessing ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-xl border border-brand-error/30 bg-brand-error/15 text-brand-error flex items-center justify-center font-bold"
                    title="Abort consult"
                  >
                    x
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputVal.trim()}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-xl bg-brand-accent disabled:bg-brand-bg-primary text-brand-navy disabled:text-brand-text-secondary/30 flex items-center justify-center"
                    title="Consult"
                  >
                    <svg className="w-3 h-3 transform rotate-90" fill="currentColor" viewBox="0 0 24 24">
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
      <div className="hidden lg:grid grid-cols-12 gap-6 w-full text-left h-full min-h-0">
        
        {/* Columns 1-3: Strategic Chambers & Setup (Sidebar) */}
        <div className="col-span-3 flex flex-col gap-5 h-full min-h-0 overflow-y-auto custom-scrollbar pr-1">
          <Card className="p-5 border border-brand-border bg-brand-bg-secondary rounded-2xl flex flex-col gap-4 relative overflow-hidden group">
            <div className="space-y-0.5">
              <h3 className="text-base font-serif font-bold text-shimmer flex items-center gap-1.5">
                <CourtIcon className="h-5 w-5 text-brand-text-primary" /> Protocols
              </h3>
              <p className="text-[10px] text-brand-text-secondary font-light">Select deliberation protocol.</p>
            </div>

            <div className="flex flex-col gap-2">
              {[
                { value: ChamberMode.ORACLE, title: 'Oracle', badge: '6-Stg', icon: '[ O ]' },
                { value: ChamberMode.COUNCIL, title: 'Council', badge: 'Minds', icon: '[ C ]' },
                { value: ChamberMode.SYNTHESIS, title: 'Synthesis', badge: '7-Phs', icon: '[ S ]' },
              ].map((m) => {
                const isActive = activeTab === m.value;
                return (
                  <button
                    key={m.value}
                    onClick={() => setActiveTab(m.value)}
                    className={`w-full p-3.5 rounded-xl border text-left flex items-center gap-3 relative overflow-hidden group/btn transition-all
                      ${isActive 
                        ? 'bg-brand-text-primary text-brand-bg-primary border-brand-accent font-semibold scale-[1.01]' 
                        : 'bg-brand-bg-primary border-brand-border text-brand-text-secondary hover:border-brand-accent/40 hover:bg-brand-accent/5 hover:text-brand-text-primary'
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

          {activeTab === ChamberMode.COUNCIL && (
            <Card className="p-5 border border-brand-border bg-brand-bg-secondary rounded-2xl flex flex-col gap-3 ">
              <h4 className="text-[10px] font-mono font-semibold text-brand-text-primary uppercase tracking-widest border-b border-brand-border pb-1">Expert Advisor Minds</h4>
              <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto custom-scrollbar pr-0.5">
                {PERSONAS.map((p) => {
                  const isSelected = selectedPersona.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPersona(p)}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all min-w-0
                        ${isSelected
                          ? 'bg-brand-text-primary text-brand-bg-primary border-brand-accent scale-[1.01]'
                          : 'bg-brand-bg-primary border-brand-border text-brand-text-secondary hover:border-brand-accent/40 hover:bg-brand-accent/5 hover:text-brand-text-primary'
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
        <div className="col-span-6 flex flex-col bg-brand-bg-secondary border border-brand-border rounded-2xl overflow-hidden relative shadow-inner-subtle h-full min-h-0">
          
          {/* Chat Feed */}
          <div className="flex-grow p-5 overflow-y-auto space-y-5 custom-scrollbar text-left relative z-10">
            
            {activeHistory.length <= 1 && (
              <div className="p-6 border border-brand-border bg-brand-bg-primary/30 rounded-xl flex flex-col items-center gap-4 text-center my-2">
                <div className="w-12 h-12 rounded-xl border border-brand-border bg-brand-bg-secondary flex items-center justify-center flex-shrink-0 text-brand-text-primary font-semibold">
                  {activeTab === ChamberMode.ORACLE ? (
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
                    {activeTab === ChamberMode.ORACLE ? 'Oracle Deliberation' : activeTab === ChamberMode.COUNCIL ? 'Historical Council' : 'Adversarial Synthesis'}
                  </h4>
                  <p className="text-[10px] text-brand-text-secondary font-light leading-relaxed max-w-sm">
                    {activeTab === ChamberMode.ORACLE 
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
                    <span className="text-xs font-serif font-bold text-brand-text-primary font-semibold bg-brand-accent/5 px-1.5 py-0.5 border border-brand-border rounded-lg">
                      {item.meta}
                    </span>
                  )}
                  <span className="text-[8px] text-brand-text-secondary/40 font-mono">
                    {item.sender === 'user' ? 'Counsel' : 'Chamber'}
                  </span>
                </div>

                <div
                  className={`max-w-[90%] p-3.5 rounded-2xl text-[12px] leading-relaxed border  
                    ${item.sender === 'user'
                      ? 'bg-brand-accent/15 border-brand-border text-brand-text-primary rounded-tr-none'
                      : item.sender === 'system'
                        ? 'bg-brand-error/10 border-brand-error text-brand-error rounded-tl-none font-mono text-[11px]'
                        : 'bg-brand-bg-secondary/70 border-brand-border text-brand-text-primary rounded-tl-none'
                    }`}
                >
                  <div className="font-light text-brand-text-primary">{renderLegalMarkdown(item.text)}</div>
                  {renderCitationPanel(item)}
                </div>

                {item.sender === 'assistant' && item.text && (
                  <div className="flex space-x-2 mt-1.5 pl-1">
                    <button
                      onClick={() => handleSpeak(item.text)}
                      className="px-2 py-1 border border-brand-border rounded-lg bg-brand-bg-secondary hover:bg-brand-bg-primary text-[9px] text-brand-text-primary font-semibold font-mono uppercase tracking-wide cursor-pointer"
                    >
                      Speak
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(item.text)}
                      className="px-2 py-1 border border-brand-border rounded-lg bg-brand-bg-secondary hover:bg-brand-bg-primary text-[9px] text-brand-text-secondary hover:text-brand-text-primary  font-mono uppercase tracking-wide cursor-pointer"
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
          <div className="p-3 border-t border-brand-border bg-brand-bg-secondary/90 relative z-20">
            {audioError && (
              <div className="p-2 mb-2 bg-brand-error/10 border border-brand-error text-brand-error text-[10px] rounded-xl text-left ">
                [Error] {audioError}
              </div>
            )}

            <form onSubmit={handleSend} className="flex gap-2">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-10 h-10 flex-shrink-0 rounded-xl border flex items-center justify-center focus:outline-none
                  ${isRecording
                    ? 'bg-brand-error/25 border-brand-error text-brand-error '
                    : 'bg-brand-bg-primary border-brand-border text-brand-text-primary font-semibold hover:bg-brand-text-primary text-brand-bg-primary '
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
                className="flex-grow p-2.5 bg-brand-bg-primary border border-brand-border rounded-xl focus:ring-1 focus:ring-brand-accent focus:outline-none text-[12px] text-brand-text-primary placeholder-brand-text-secondary/35 font-light resize-none min-h-[42px] max-h-[140px] custom-scrollbar"
                rows={1}
              />

              {isProcessing ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 border border-brand-error/40 rounded-xl bg-brand-error/10 text-brand-error hover:bg-brand-error/25 text-[10px] font-mono uppercase tracking-wider flex-shrink-0  font-semibold"
                >
                  Cancel
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
          <Card className="p-4.5 border border-brand-border bg-brand-bg-secondary rounded-2xl flex flex-col h-full overflow-hidden ">
            <div className="space-y-1 border-b border-brand-border pb-3">
              <h3 className="text-sm font-serif font-bold text-shimmer flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4  text-brand-text-primary font-semibold" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
                  </svg>
                  Holographic Deliberation Blueprint
                </span>
                <span className="text-[8px] font-mono border border-brand-border text-brand-text-primary font-semibold px-1.5 py-0.5 rounded bg-brand-bg-primary uppercase">
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
                setSelectedPersona={setSelectedPersona}
              />
            </div>

            {/* Scrollable Trace Logs or System Status Archive */}
            <div className="flex-grow flex flex-col min-h-0 border-t border-brand-border pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-serif font-bold text-brand-text-primary/80 font-semibold block">
                  {isProcessing ? `Live Trace: ${oracleStage}` : 'Process Log Archive'}
                </span>
                {oracleTrace.length > 0 && (
                  <button 
                    onClick={() => setShowReasoningLogs(!showReasoningLogs)}
                    className="text-[9px] font-mono border border-brand-border rounded-lg px-2 py-0.5 hover:text-brand-accent transition-colors uppercase"
                  >
                    {showReasoningLogs ? 'Hide Reasoning' : 'Show Reasoning'}
                  </button>
                )}
              </div>

              <div className="flex-grow overflow-y-auto custom-scrollbar space-y-3 pr-0.5 text-left">
                {isProcessing && oracleStage && (
                  <div className="p-3.5 rounded-xl border border-brand-border bg-brand-bg-primary  space-y-3 ">
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
                      ] : activeTab === ChamberMode.SYNTHESIS ? SYNTHESIS_STAGES.map(s => s.label)
                      : ['Processing Consultation'])).map((stg, idx) => {
                        const isCompleted = idx < oracleTrace.length;
                        const isActive = idx === oracleTrace.length;
                        return (
                          <div key={idx} className="flex items-center justify-between text-[9px] font-mono">
                            <div className="flex items-center space-x-2">
                              <span className={`w-3.5 h-3.5 rounded-lg flex items-center justify-center border border-brand-border text-[7px] font-bold
                                ${isCompleted 
                                  ? 'bg-brand-accent/20 border-brand-accent text-brand-text-primary font-semibold' 
                                  : isActive 
                                    ? 'bg-amber-500/10 border-amber-500 text-amber-400 ' 
                                    : 'bg-brand-navy border-brand-text-primary/30 text-brand-text-secondary/20'
                                }`}
                              >
                                {isCompleted ? '§' : idx + 1}
                              </span>
                              <span className={isCompleted ? 'text-brand-text-secondary/50 line-through' : isActive ? 'text-brand-text-primary font-bold' : 'text-brand-text-secondary/30'}>
                                {stg}
                              </span>
                              {/* Per-stage model badge (Synthesis only) */}
                              {activeTab === ChamberMode.SYNTHESIS && SYNTHESIS_BY_KEY[SYNTHESIS_STAGES[idx]?.key] && (
                                <span className="text-[7px] font-mono px-1 py-[1px] border border-brand-border rounded bg-brand-bg-primary text-brand-text-secondary/60 ml-1">
                                  {SYNTHESIS_STAGES[idx].model.replace('deepseek-', 'ds-')}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {oracleTrace.length > 0 ? (
                  showReasoningLogs && (
                    <div className="space-y-3 animate-fadeIn">
                      {oracleTrace.map((tr, index) => (
                        <div key={index} className="space-y-1 p-3 bg-brand-bg-primary border border-brand-text-primary/30 rounded-xl ">
                          <h6 className="font-mono text-[9px] font-bold text-brand-text-primary font-semibold uppercase tracking-wider border-b border-brand-text-primary/30 pb-0.5 flex items-center justify-between">
                            <span>Stage {index + 1}: {tr.stage}</span>
                            <span className="text-[7px] text-green-400 font-semibold bg-green-500/10 border border-green-500/20 px-1 rounded">READY</span>
                          </h6>
                          <p className="leading-relaxed font-light text-brand-text-secondary text-[10px] whitespace-pre-wrap max-h-[100px] overflow-y-auto custom-scrollbar">{tr.content}</p>
                        </div>
                      ))}
                    </div>
                  )
                ) : !isProcessing ? (
                  <div className="p-4 border border-white/5 bg-brand-bg-primary rounded-xl space-y-2 text-center text-brand-text-secondary font-light">
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

export default StrategyRoomScreen;
