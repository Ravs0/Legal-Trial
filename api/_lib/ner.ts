// api/_lib/ner.ts — LexForge regex NER: Blackstone stand-in until the spaCy service lands.
// Indian (AIR/SCC) + US (U.S./F.3d) cites, statutes (§/Art), courts, judge names.
// Contract: tag(text) -> { citations[], statutes[], courts[], judges[] }; spans sorted, de-overlapped.
// When spaCy ships, keep this shape and swap the body for a fetch call.

export interface Span { text: string; start: number; end: number; kind: string }
export interface Tags { citations: Span[]; statutes: Span[]; courts: Span[]; judges: Span[] }
type Pat = [RegExp, string];

const CIT: Pat[] = [
  [/\bAIR \d{4} [A-Z][A-Za-z.]* \d+/g, "AIR"],               // AIR 1973 SC 1461
  [/\(\d{4}\) \d+ (?:SCC|SCR) \d+/g, "SCC"],                 // (2020) 5 SCC 321
  [/\b\d{4} SCC OnLine [A-Z][A-Za-z.]* \d+/g, "SCC-OnLine"], // 2021 SCC OnLine SC 12
  [/\b\d+ U\.S\. \d+/g, "US"],                              // 410 U.S. 113
  [/\b\d+ S\. ?Ct\. \d+/g, "SCt"],                          // 132 S. Ct. 2455
  [/\b\d+ F\. ?(?:2d|3d|4th) \d+/g, "F"],                   // 999 F.3d 1
  [/\b\d+ F\. ?Supp\. ?(?:[23]d )? ?\d+/g, "FSupp"],         // 12 F. Supp. 2d 34
];
const STA: Pat[] = [
  [/\b\d+ U\.S\.C\. §§? ?\d[\w().-]*/g, "USC"],             // 42 U.S.C. § 1983
  [/§§? ?\d[\w().-]*/g, "sec-sym"],                         // § 1983
  [/\b(?:Sections?|Sec\.?|Articles?|Arts?\.?) \d+[A-Z]?(?:\([^)]*\))?(?: of the [\w][\w\s&.,-]{0,60}?(?:Act|Code|Constitution))?/g, "statute"],
];                                                          // Section 302 of the Indian Penal Code / Art. 14
const CRT: Pat[] = [
  [/\bU\.S\. Supreme Court\b|\bSupreme Court(?: of (?:India|the United States))?/g, "apex"],
  [/\b[A-Z][a-z]+(?: [A-Z][a-z]+)? High Court/g, "HC"],     // Bombay High Court
  [/\b\d+(?:st|nd|rd|th) Circuit Court of Appeals\b/g, "appeals"], // 9th Circuit Court of Appeals
  [/\b\d+(?:st|nd|rd|th) Cir\.?(?:cuit)?\b|\b[A-Z][a-z]+ Circuit\b/g, "circuit"],
  [/\bCourts? of Appeals?(?: for the [A-Z][a-z]+ Circuit)?/g, "appeals"],
  [/\b(?:Sessions|Family|District) Court\b|\bNCLT\b|\bNCLAT\b|\bCAT\b/g, "forum"],
];
const JDG: Pat[] = [
  [/\b(?:Hon'ble )?(?:Mr\.? |Ms\.? )?Justice [A-Z][a-z]+(?: [A-Z][a-z]+){0,2}/g, "justice"],
  [/\bChief Justice [A-Z][a-z]+(?: [A-Z][a-z]+)?/g, "CJ"],   // Chief Justice Roberts
  [/\b[A-Z][a-z]+(?: [A-Z][a-z]+)?, (?:C\.?J\.?I\.?|A\.?C\.?J\.?|C\.?J\.|JJ?\.?)(?![A-Za-z])/g, "abbr"], // Sikri, CJI
  [/\b[A-Z][a-z]+ J\.(?!\w)/g, "post"],                     // Chandrachud J.
];

function collect(text: string, pats: Pat[]): Span[] {
  const out: Span[] = [];
  for (const [re, kind] of pats) {
    re.lastIndex = 0; // global regexes are stateful; reset for reuse
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push({ text: m[0], start: m.index, end: m.index + m[0].length, kind });
  }
  const sorted = out.sort((x, y) => x.start - y.start || y.end - x.end); // longest wins ties
  const kept: Span[] = [];                                          // drop overlaps vs last KEPT span
  for (const s of sorted) if (!kept.length || s.start >= kept[kept.length - 1].end) kept.push(s);
  return kept;
}

/** Tag citations, statutes, courts, judges — every hit carries { text, start, end, kind }. */
export function tag(text: string): Tags {
  return { citations: collect(text, CIT), statutes: collect(text, STA), courts: collect(text, CRT), judges: collect(text, JDG) };
}
