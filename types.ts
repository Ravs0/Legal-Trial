
import { Chat } from "@google/genai";

export type PracticeMode = 'indian' | 'international';

export enum JudgePersonalityId {
  // Indian Judges (Target: 30)
  HR_KHANNA = 'hr_khanna',
  VR_KRISHNA_IYER = 'vr_krishna_iyer',
  PN_BHAGWATI = 'pn_bhagwati',
  DY_CHANDRACHUD = 'dy_chandrachud',
  JS_VERMA = 'js_verma',
  UU_LALIT = 'uu_lalit', 
  NV_RAMANA = 'nv_ramana', 
  RANJAN_GOGOI = 'ranjan_gogoi',
  SHARAD_ARVIND_BOBDE = 'sharad_arvind_bobde',
  DIPAK_MISRA = 'dipak_misra',
  TS_THAKUR = 'ts_thakur',
  HL_DATTU = 'hl_dattu',
  P_SATHASIVAM = 'p_sathasivam',
  ALTAMAS_KABIR = 'altamas_kabir',
  SH_KAPADIA = 'sh_kapadia',
  KG_BALAKRISHNAN = 'kg_balakrishnan',
  RC_LAHOTI = 'rc_lahoti',
  VN_KHARE = 'vn_khare',
  ADARSH_SEIN_ANAND = 'adarsh_sein_anand',
  AS_ANAND = 'as_anand', // Alias or specific focus
  SP_BARUCHA = 'sp_barucha',
  AM_AHMADI = 'am_ahmadi',
  MN_VENKATACHALIAH = 'mn_venkatachaliah',
  M_HIDAYATULLAH = 'm_hidayatullah',
  YV_CHANDRACHUD = 'yv_chandrachud',
  AN_RAY = 'an_ray',
  SM_SIKRI = 'sm_sikri',
  K_SUBBA_RAO = 'k_subba_rao',
  PB_GAJENDRAGADKAR = 'pb_gajendragadkar',
  M_PATANJALI_SASTRI = 'm_patanjali_sastri',
  HJ_KANIA = 'hj_kania',
  // Example High Court Judges (can be expanded)
  LEILA_SETH = 'leila_seth', // Delhi HC, first woman Chief Justice of a state HC
  AP_SHAH = 'ap_shah',       // Delhi HC, Madras HC - known for progressive judgments
  SANJAY_KISHAN_KAUL = 'sanjay_kishan_kaul', // SC, but HC background too

  // International Judges (Target: 30)
  JOHN_MARSHALL = 'john_marshall',
  LORD_DENNING = 'lord_denning',
  RUTH_BADER_GINSBURG = 'ruth_bader_ginsburg',
  ANTONIN_SCALIA = 'antonin_scalia',
  THURGOOD_MARSHALL = 'thurgood_marshall',
  ROSALYN_HIGGINS = 'rosalyn_higgins',
  JOAN_DONOGHUE = 'joan_donoghue',
  ALBIE_SACHS = 'albie_sachs',
  LORD_SUMPTION = 'lord_sumption',
  BEVERLEY_MCLACHLIN = 'beverley_mclachlin',
  MANFRED_LACHS = 'manfred_lachs', // ICJ
  SHIGERU_ODA = 'shigeru_oda', // ICJ
  STEPHEN_SCHWEBEL = 'stephen_schwebel', // ICJ
  GILBERT_GUILLAUME = 'gilbert_guillaume', // ICJ
  PETER_TOMKA = 'peter_tomka', // ICJ
  HISASHI_OWADA = 'hisashi_owada', // ICJ
  ABDULQAWI_YUSUF = 'abdulqawi_yusuf', // ICJ
  CHRISTOPHER_GREENWOOD = 'christopher_greenwood', // ICJ
  THOMAS_BUERGENTHAL = 'thomas_buergenthal', // ICJ, Human Rights
  ANTONIO_CASSESE = 'antonio_cassese', // ICTY, Human Rights
  GABRIELLE_KIRK_MCDONALD = 'gabrielle_kirk_mcdonald', // ICTY
  MOHAMED_SHAHABUDDEEN = 'mohamed_shahabuddeen', // ICJ, ICTY
  THEODOR_MERON = 'theodor_meron', // ICTY, IRMCT
  PATRICIA_WALD = 'patricia_wald', // ICTY
  NAVI_PILLAY = 'navi_pillay', // ICTR, ICC, UN High Commissioner for Human Rights
  ERIK_MOSE = 'erik_mose', // ICTR, ECHR
  CHARLES_WORTHINGTON_BRIGHT = 'charles_worthington_bright', // Ad-hoc tribunals, e.g., Eritrea-Ethiopia Claims Commission
  YVES_FORTIER = 'yves_fortier', // Prominent Arbitrator (PCA, ICSID)
  JULIAN_LEW = 'julian_lew', // Prominent Arbitrator
  BERNARDO_CREMADES = 'bernardo_cremades', // Prominent Arbitrator
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
  KAPIL_SIBAL = 'kapil_sibal', 
  HARISH_SALVE = 'harish_salve', 
  MUKUL_ROHATGI = 'mukul_rohatgi',
  ABHISHEK_MANU_SINGHVI = 'abhishek_manu_singhvi',
  GOPAL_SUBRAMANIUM = 'gopal_subramanium',
  INDIRA_JAISING = 'indira_jaising',
  FALI_NARIMAN = 'fali_nariman', // Revered senior figure
  SOLI_SORABJEE = 'soli_sorabjee', // Revered senior figure
  KK_VENUGOPAL = 'kk_venugopal',   // Former AG
  TUSHAR_MEHTA = 'tushar_mehta', // Current Solicitor General (or recent AG)
  RAM_JETHMALANI = 'ram_jethmalani', // Legendary criminal lawyer
  SHYAM_DIVAN = 'shyam_divan', // Known for constitutional/environmental
  ARVIND_DATAR = 'arvind_datar', // Known for tax/corporate
  MEENAKSHI_ARORA = 'meenakshi_arora', // Senior Advocate
  SIDDHARTH_LUTHRA = 'siddharth_luthra', // Known for criminal law
  PINKY_ANAND = 'pinky_anand', // Senior Advocate, former ASG
  ANAND_GROVER = 'anand_grover', // Human rights, HIV/AIDS law
  VRINDA_GROVER = 'vrinda_grover', // Human rights, women's rights
  KARUNA_NUNDY = 'karuna_nundy', // Human rights, gender justice
  MANINDER_SINGH = 'maninder_singh', // Senior Advocate
  PARAMJIT_SINGH_PATWALIA = 'paramjit_singh_patwalia', // Senior Advocate
  REBECCA_JOHN = 'rebecca_john', // Criminal defense
  AMIT_DESAI = 'amit_desai', // Criminal law, white-collar
  MAHESH_JETHMALANI = 'mahesh_jethmalani', // Senior Advocate
  ZIA_MODY = 'zia_mody', // Corporate law icon (more transactional, but can be adapted)
  
  // Tech/IP/Finance (can be used in both modes or lean Indian/Intl as needed)
  KENJI_TANAKA = 'kenji_tanaka',           
  ISABELLA_ROSSI = 'isabella_rossi',     
  ARJUN_MEHRA = 'arjun_mehra',           
  SOFIA_CHEN = 'sofia_chen', 
  OMAR_ABDULLAH = 'omar_abdullah',

  // International Advocates (Target: 30)
  AMAL_CLOONEY = 'amal_clooney',
  KARIM_KHAN = 'karim_khan',
  PAUL_REICHLER = 'paul_reichler',
  LUCY_REED = 'lucy_reed',
  PHILIPPE_SANDS = 'philippe_sands',
  JAMES_CRAWFORD = 'james_crawford', // Highly respected academic and practitioner (deceased, but influential)
  EMMANUEL_GAILLARD = 'emmanuel_gaillard', // Leading arbitration figure (deceased, but influential)
  GABRIELLE_KAUFMANN_KOHLER = 'gabrielle_kaufmann_kohler', // Leading arbitrator
  VAUGHAN_LOWE = 'vaughan_lowe', // Public international law
  // Fix: Corrected enum member name from ALAN_REDSсклю FERN to ALAN_REDFERN
  ALAN_REDFERN = 'alan_redfern', // Arbitration
  PIERRE_LALIVE = 'pierre_lalive', // Arbitration (historical figure)
  CHERIE_BLAIR_BOOTH = 'cherie_blair_booth', // Human rights, arbitration
  BEN_EMMERSON = 'ben_emmerson', // Human rights, international criminal law
  RODNEY_DIXON = 'rodney_dixon', // Public international law, ICL
  ALEXIS_MOURRE = 'alexis_mourre', // Arbitration
  DAVID_RIVKIN = 'david_rivkin', // Arbitration
  PAYAM_AKHAVAN = 'payam_akhavan', // Human rights, ICL
  DONALD_MCRAE = 'donald_mcrae', // Law of the Sea, Trade
  TOBY_LANDAU = 'toby_landau', // Arbitration
  CANAGARATNAM_SURESH = 'canagaratnam_suresh', // Prominent Asian arbitrator
  GARY_BORN = 'gary_born', // Leading arbitration scholar and practitioner
  ANNA_JOUBIN_BRET = 'anna_joubin_bret', // UNCITRAL Secretary, arbitration
  JEAN_KALICKI = 'jean_kalicki', // Arbitration
  MICHAEL_REISMAN = 'michael_reisman', // Public international law, arbitration scholar
  HANS_CORELL = 'hans_corell', // Former UN Legal Counsel
  CATHERINE_AMIRFAR = 'catherine_amirfar', // Public international law, arbitration
  MARCIA_FAVRE = 'marcia_favre', // Arbitration, construction
  SOPHIE_LAMB = 'sophie_lamb', // Arbitration
  ELIHU_LAUTERPACHT = 'elihu_lauterpacht', // Public international law (historical figure)
  STANIMIR_ALEXANDROV = 'stanimir_alexandrov', // Investment arbitration
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
  sender: 'user' | 'judge' | 'opposingCounsel' | 'system'; 
  text: string;
  timestamp: Date;
  avatarUrl?: string;
}

export interface PerformanceMetrics {
  argumentStrength: number; // 1-10
  precedentUsage: number; // 1-10
  constitutionalBasis: number; // 1-10 (or relevant legal basis for intl law)
  responseQuality: number; // 1-10
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
  isFactGenerating: boolean; 
  setIsFactGenerating: React.Dispatch<React.SetStateAction<boolean>>;
}
