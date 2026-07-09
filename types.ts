import React from 'react';
export interface Chat {
  sendMessageStream: (params: { message: string }) => AsyncIterable<any>;
}
export type PracticeMode = 'indian' | 'international';

export type TrialMessageSender = 'user' | 'judge' | 'opposingCounsel' | 'system';
export type TrialMessageKind =
  | 'opening'
  | 'argument'
  | 'rebuttal'
  | 'question'
  | 'response'
  | 'objection'
  | 'ruling'
  | 'instruction'
  | 'system';
export type TrialPhase = 'opening' | 'issue_framing' | 'rebuttal' | 'judicial_questions' | 'closing';

export interface TrialScoreBreakdown {
  engagement: number;
  advocacy: number;
  objections: number;
  responsiveness: number;
  professionalism: number;
  total: number;
}

export interface ObjectionDetails {
  grounds: string;
  basis: string;
  targetedMessageId?: string;
  wasQuick?: boolean;
  outcome?: 'sustained' | 'overruled' | 'reserved';
}

export interface ChatMessageMeta {
  kind?: TrialMessageKind;
  phase?: TrialPhase;
  scoreDelta?: number;
  scoreReason?: string;
  objection?: ObjectionDetails;
  references?: string[];
}

export interface AnalysisStatus {
  state: 'idle' | 'pending' | 'ready' | 'unavailable';
  error?: string;
  rawResponse?: string;
}

export enum JudgePersonalityId {
  // Indian Judges (Target: 30)
  ROBERT_VANCE = 'robert_vance',
  ARTHUR_PENDELTON = 'arthur_pendelton',
  PAUL_VANCE = 'paul_vance',
  DANIEL_STERLING = 'daniel_sterling',
  JOHN_STERLING = 'john_sterling',
  ULYSSES_STERLING = 'ulysses_sterling',
  NICHOLAS_STERLING = 'nicholas_sterling',
  RICHARD_STERLING = 'richard_sterling',
  STEPHEN_BOBDE = 'stephen_bobde',
  DAVID_STERLING = 'david_sterling',
  THOMAS_VANCE = 'thomas_vance',
  HENRY_VANCE = 'henry_vance',
  PETER_STERLING = 'peter_sterling',
  ALBERT_VANCE = 'albert_vance',
  SAMUEL_STERLING = 'samuel_sterling',
  KENNETH_VANCE = 'kenneth_vance',
  RICHARD_LAHOTI = 'richard_lahoti',
  VICTOR_VANCE = 'victor_vance',
  ALFRED_ANAND = 'alfred_anand',
  SAMUEL_BARUCHA = 'samuel_barucha',
  ALBERT_AHMADI = 'albert_ahmadi',
  MICHAEL_VENKAT = 'michael_venkat',
  MATTHEW_HIDAYAT = 'matthew_hidayat',
  ZACHARY_CHANDRA = 'zachary_chandra',
  ARTHUR_RAY = 'arthur_ray',
  SAMUEL_SIKRI = 'samuel_sikri',
  KEVIN_SUBBA = 'kevin_subba',
  PAUL_GAJENDRA = 'paul_gajendra',
  MATTHEW_SASTRI = 'matthew_sastri',
  HAROLD_KANIA = 'harold_kania',
  // Example High Court Judges (can be expanded)
  LEILA_SETH_MOCK = 'leila_seth_mock', // Delhi HC, first woman Chief Justice of a state HC
  ALFRED_SHAH = 'alfred_shah',       // Delhi HC, Madras HC - known for progressive judgments
  SAMUEL_KAUL = 'samuel_kaul', // SC, but HC background too

  // International Judges (Target: 30)
  JOHN_MARSHALL_MOCK = 'john_marshall_mock',
  LORD_DENNING_MOCK = 'lord_denning_mock',
  RUTH_GINSBURG_MOCK = 'ruth_ginsburg_mock',
  ANTONIN_SCALIA_MOCK = 'antonin_scalia_mock',
  THURGOOD_MARSHALL_MOCK = 'thurgood_marshall_mock',
  ROSALYN_HIGGINS_MOCK = 'rosalyn_higgins_mock',
  JOAN_DONOGHUE_MOCK = 'joan_donoghue_mock',
  ALBIE_SACHS_MOCK = 'albie_sachs_mock',
  LORD_SUMPTION_MOCK = 'lord_sumption_mock',
  BEVERLEY_MCLACHLIN_MOCK = 'beverley_mclachlin_mock',
  MANFRED_LACHS_MOCK = 'manfred_lachs_mock', // ICJ
  SHIGERU_ODA_MOCK = 'shigeru_oda_mock', // ICJ
  STEPHEN_SCHWEBEL_MOCK = 'stephen_schwebel_mock', // ICJ
  GILBERT_GUILLAUME_MOCK = 'gilbert_guillaume_mock', // ICJ
  PETER_TOMKA_MOCK = 'peter_tomka_mock', // ICJ
  HISASHI_OWADA_MOCK = 'hisashi_owada_mock', // ICJ
  ABDULQAWI_YUSUF_MOCK = 'abdulqawi_yusuf_mock', // ICJ
  CHRISTOPHER_GREENWOOD_MOCK = 'christopher_greenwood_mock', // ICJ
  THOMAS_BUERGENTHAL_MOCK = 'thomas_buergenthal_mock', // ICJ, Human Rights
  ANTONIO_CASSESE_MOCK = 'antonio_cassese_mock', // ICTY, Human Rights
  GABRIELLE_MCDONALD_MOCK = 'gabrielle_mcdonald_mock', // ICTY
  MOHAMED_SHAHABUDDEEN_MOCK = 'mohamed_shahabuddeen_mock', // ICJ, ICTY
  THEODOR_MERON_MOCK = 'theodor_meron_mock', // ICTY, IRMCT
  PATRICIA_WALD_MOCK = 'patricia_wald_mock', // ICTY
  NAVI_PILLAY_MOCK = 'navi_pillay_mock', // ICTR, ICC, UN High Commissioner for Human Rights
  ERIK_MOSE_MOCK = 'erik_mose_mock', // ICTR, ECHR
  CHARLES_BRIGHT_MOCK = 'charles_bright_mock', // Ad-hoc tribunals, e.g., Eritrea-Ethiopia Claims Commission
  YVES_FORTIER_MOCK = 'yves_fortier_mock', // Prominent Arbitrator (PCA, ICSID)
  JULIAN_LEW_MOCK = 'julian_lew_mock', // Prominent Arbitrator
  BERNARDO_CREMADES_MOCK = 'bernardo_cremades_mock', // Prominent Arbitrator
}

export interface JudgePersonality {
  id: JudgePersonalityId;
  name: string;
  description: string;
  avatarUrl?: string;
  systemInstruction: string;
}

export enum OpposingCounselPersonalityId {
  // Indian Advocates (Target: 30)
  ARANYA_VASISHTHA = 'aranya_vasishtha',
  DARIUS_SHROFF = 'darius_shroff',
  NAINA_SUBRAMANIAN = 'naina_subramanian',
  ROHAN_CHATTERJEE = 'rohan_chatterjee',
  SAIRA_AHMED = 'saira_ahmed',
  KAY_STERLING = 'kay_sterling',
  HENRY_MERCER = 'henry_mercer',
  MUKUL_VANCE = 'mukul_vance',
  ABHISHEK_STERLING = 'abhishek_sterling',
  GOPAL_VANCE = 'gopal_vance',
  INDIRA_VANCE = 'indira_vance',
  FALI_STERLING = 'fali_sterling', // Revered senior figure
  SOLI_STERLING = 'soli_sterling', // Revered senior figure
  KK_VANCE = 'kk_vance',   // Former AG
  TYLER_STERLING = 'tyler_sterling', // Current Solicitor General (or recent AG)
  ROGER_STERLING = 'roger_sterling', // Legendary criminal lawyer
  SEAN_VANCE = 'sean_vance', // Known for constitutional/environmental
  ALAN_STERLING = 'alan_sterling', // Known for tax/corporate
  MONICA_VANCE = 'monica_vance', // Senior Advocate
  SAMUEL_LUTHRA = 'samuel_luthra', // Known for criminal law
  PATRICIA_ANAND = 'patricia_anand', // Senior Advocate, former ASG
  ARTHUR_GROVER = 'arthur_grover', // Human rights, HIV/AIDS law
  VICTORIA_GROVER = 'victoria_grover', // Human rights, women's rights
  KAREN_NUNDY = 'karen_nundy', // Human rights, gender justice
  MARCUS_SINGH = 'marcus_singh', // Senior Advocate
  PETER_PATWALIA = 'peter_patwalia', // Senior Advocate
  REBECCA_JOHN_MOCK = 'rebecca_john_mock', // Criminal defense
  AARON_DESAI = 'aaron_desai', // Criminal law, white-collar
  MATTHEW_JETHMALANI = 'matthew_jethmalani', // Senior Advocate
  ZOE_MODY = 'zoe_mody', // Corporate law icon (more transactional, but can be adapted)

  // Tech/IP/Finance (can be used in both modes or lean Indian/Intl as needed)
  KENJI_TANAKA = 'kenji_tanaka',
  ISABELLA_ROSSI = 'isabella_rossi',
  ARJUN_MEHRA = 'arjun_mehra',
  SOFIA_CHEN = 'sofia_chen',
  OMAR_ABDULLAH = 'omar_abdullah',

  // International Advocates (Target: 30)
  AMAL_CLOONEY_MOCK = 'amal_clooney_mock',
  KARIM_KHAN_MOCK = 'karim_khan_mock',
  PAUL_REICHLER_MOCK = 'paul_reichler_mock',
  LUCY_REED_MOCK = 'lucy_reed_mock',
  PHILIPPE_SANDS_MOCK = 'philippe_sands_mock',
  JAMES_CRAWFORD_MOCK = 'james_crawford_mock', // Highly respected academic and practitioner (deceased, but influential)
  EMMANUEL_GAILLARD_MOCK = 'emmanuel_gaillard_mock', // Leading arbitration figure (deceased, but influential)
  GABRIELLE_KOHLER_MOCK = 'gabrielle_kohler_mock', // Leading arbitrator
  VAUGHAN_LOWE_MOCK = 'vaughan_lowe_mock', // Public international law
  // Fix: Corrected enum member name from ALAN_REDSсклю FERN to ALAN_REDFERN_MOCK
  ALAN_REDFERN_MOCK = 'alan_redfern_mock', // Arbitration
  PIERRE_LALIVE_MOCK = 'pierre_lalive_mock', // Arbitration (historical figure)
  CHERIE_BLAIR_MOCK = 'cherie_blair_mock', // Human rights, arbitration
  BEN_EMMERSON_MOCK = 'ben_emmerson_mock', // Human rights, international criminal law
  RODNEY_DIXON_MOCK = 'rodney_dixon_mock', // Public international law, ICL
  ALEXIS_MOURRE_MOCK = 'alexis_mourre_mock', // Arbitration
  DAVID_RIVKIN_MOCK = 'david_rivkin_mock', // Arbitration
  PAYAM_AKHAVAN_MOCK = 'payam_akhavan_mock', // Human rights, ICL
  DONALD_MCRAE_MOCK = 'donald_mcrae_mock', // Law of the Sea, Trade
  TOBY_LANDAU_MOCK = 'toby_landau_mock', // Arbitration
  SURESH_MOCK = 'suresh_mock', // Prominent Asian arbitrator
  GARY_BORN_MOCK = 'gary_born_mock', // Leading arbitration scholar and practitioner
  ANNA_BRET_MOCK = 'anna_bret_mock', // UNCITRAL Secretary, arbitration
  JEAN_KALICKI_MOCK = 'jean_kalicki_mock', // Arbitration
  MICHAEL_REISMAN_MOCK = 'michael_reisman_mock', // Public international law, arbitration scholar
  HANS_CORELL_MOCK = 'hans_corell_mock', // Former UN Legal Counsel
  CATHERINE_AMIRFAR_MOCK = 'catherine_amirfar_mock', // Public international law, arbitration
  MARCIA_FAVRE_MOCK = 'marcia_favre_mock', // Arbitration, construction
  SOPHIE_LAMB_MOCK = 'sophie_lamb_mock', // Arbitration
  ELIHU_LAUTERPACHT_MOCK = 'elihu_lauterpacht_mock', // Public international law (historical figure)
  STANIMIR_ALEXANDROV_MOCK = 'stanimir_alexandrov_mock', // Investment arbitration
}

export interface OpposingCounselPersonality {
  id: OpposingCounselPersonalityId;
  name: string;
  specialty: string;
  description: string;
  avatarUrl?: string;
  systemInstruction: string;
}

export enum CaseCategoryId {
  // Indian Case Categories
  CONSTITUTIONAL = 'constitutional',
  CRIMINAL = 'criminal',
  COMMERCIAL = 'commercial',
  LABOR = 'labor',
  FAMILY = 'family', // Added
  PROPERTY = 'property', // Added
  ENVIRONMENTAL_IN = 'environmental_in', // Indian Environmental Law
  IPR_IN = 'ipr_in', // Indian IPR

  // International Case Categories
  PUBLIC_INTERNATIONAL_LAW = 'public_international_law',
  INTERNATIONAL_CRIMINAL_LAW = 'international_criminal_law',
  INTERNATIONAL_ARBITRATION = 'international_arbitration',
  INTERNATIONAL_HUMAN_RIGHTS = 'international_human_rights',
  LAW_OF_THE_SEA = 'law_of_the_sea', // Added
  INTERNATIONAL_TRADE_LAW = 'international_trade_law', // Added
  INTERNATIONAL_ENVIRONMENTAL_LAW = 'international_environmental_law', // Added
  INTERNATIONAL_IP_LAW = 'international_ip_law', // Added
}

export interface CaseCategory {
  id: CaseCategoryId;
  name: string;
  description: string;
}

export enum CaseDifficulty {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced',
}

export interface CaseDetail {
  id: string;
  title: string;
  categoryId: CaseCategoryId;
  briefFacts: string;
  legalIssues: string[];
  relevantArticlesSections: string;
  precedentCases: string;
  difficulty: CaseDifficulty;
}

export enum SessionType {
  QUICK = 'Quick (15 min)',
  STANDARD = 'Standard (30 min)',
  DEEP = 'Deep (45 min)',
}

export interface SessionSettings {
  caseDetail: CaseDetail;
  judgePersonality: JudgePersonality;
  opposingCounselPersonality: OpposingCounselPersonality;
  sessionType: SessionType;
  difficulty: CaseDifficulty;
  practiceMode: PracticeMode;
}

export interface ChatMessage {
  id: string;
  sender: TrialMessageSender;
  text: string;
  timestamp: Date;
  avatarUrl?: string;
  meta?: ChatMessageMeta;
}

export interface PerformanceMetrics {
  argumentStrength: number; // 1-10
  precedentUsage: number; // 1-10
  legalGrounding: number; // 1-10
  responseQuality: number; // 1-10
  objectionHandling: number; // 1-10
  courtroomPresence: number; // 1-10
  overallScore: number; // 1-10
  feedback: string;
  improvementAreas: string[];
}

export interface SessionRecord {
  id: string;
  settings: SessionSettings;
  transcript: ChatMessage[];
  performance?: PerformanceMetrics;
  startTime: Date;
  endTime?: Date;
  durationMinutes?: number;
  elapsedSeconds?: number;
  activePhase?: TrialPhase;
  scoreBreakdown?: TrialScoreBreakdown;
  analysisStatus?: AnalysisStatus;
}

// Types for Drafting Studio
export interface DraftingSection {
  id: string; // e.g., 'preamble', 'prayer_clause'
  name: string; // User-friendly name, e.g., "Preamble", "Prayer Clause"
  description?: string; // Optional brief description of what this section entails
}
export interface DraftingTask {
  id: string;
  title: string;
  type: string;
  objective: string;
  facts?: string; // Facts will now be generated by AI
  relevantLaws: string[] | string;
  practiceMode: PracticeMode;
  difficulty: CaseDifficulty;
  category?: string;
  sections?: DraftingSection[]; // Optional array of common sections for this document type
}

export type DraftingStudioStage =
  | 'task_selection'
  | 'fact_generation_loading' // Explicit stage for loading facts
  | 'task_details_display' // Displaying task, objective, laws, and AI-generated facts
  | 'drafting' // User is actively drafting
  | 'feedback_review' // User is reviewing AI feedback
  | 'filing_procedure'; // User is viewing filing procedure

export interface TrialSimContextType {
  currentSessionSettings: SessionSettings | null;
  setCurrentSessionSettings: React.Dispatch<React.SetStateAction<SessionSettings | null>>;
  activeChatJudge: Chat | null;
  setActiveChatJudge: React.Dispatch<React.SetStateAction<Chat | null>>;
  activeChatOpposingCounsel: Chat | null;
  setActiveChatOpposingCounsel: React.Dispatch<React.SetStateAction<Chat | null>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  practiceMode: PracticeMode | null;
  setPracticeMode: React.Dispatch<React.SetStateAction<PracticeMode | null>>;
  /** Clear mode + active/pending session and chats. Use for Leave mode. */
  endPracticeMode: () => void;
  isFactGenerating: boolean;
  setIsFactGenerating: React.Dispatch<React.SetStateAction<boolean>>;
}

// ─── LexIDE Types ────────────────────────────────────────────────────────────

export type LexIDEViewMode = 'home' | 'workspace' | 'ai-sandbox';
export type CitationStyle = 'ILI' | 'OSCOLA';

export interface LexIDESection {
  id: string;
  title: string;
  content: string;
}

export interface LexIDEFootnote {
  id: string;
  sectionId: string;
  text: string;
  index: number;
}

export interface LexIDEResearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  summary?: string;
  isSummarizing?: boolean;
}

export interface LexIDESandboxMessage {
  role: 'user' | 'ai';
  text: string;
}

export interface LexIDEAppState {
  viewMode: LexIDEViewMode;
  fullContent: string;
  sections: LexIDESection[];
  footnotes: LexIDEFootnote[];
  citationStyle: CitationStyle;
  activeLeftSectionId: string;
  activeRightSectionId: string;
  isSplitView: boolean;
  savedReferences: Record<string, LexIDEResearchResult[]>;
  isExplorerVisible: boolean;
  isResearchVisible: boolean;
  sandboxSectionId: string;
  sandboxDraft: string;
  sandboxProposed: string;
  sandboxAnalysis: string;
  sandboxMessages: LexIDESandboxMessage[];
}
