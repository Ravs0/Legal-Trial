// LexForge clause library — OpenLaw-inspired parameterized clauses.
// Bodies carry [[name:Type]] slots; instantiate() fills them with validation.

export type SlotType = "Text" | "Amount" | "Days" | "Percent";

export interface ClauseSlot { name: string; type: SlotType }

export interface Clause {
  id: string;
  version: number;
  jurisdiction: string;
  title: string;
  body: string;
  rubric: string[];
}

export class ValidationError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(`Clause validation failed: ${errors.join("; ")}`);
    this.name = "ValidationError";
    this.errors = errors;
  }
}

const SLOT_RE = /\[\[(\w+):(\w+)\]\]/g;

export function slotsOf(clause: Clause): ClauseSlot[] {
  const out: ClauseSlot[] = [];
  for (const m of clause.body.matchAll(SLOT_RE)) {
    if (!out.some((s) => s.name === m[1])) out.push({ name: m[1], type: m[2] as SlotType });
  }
  return out;
}

const checks: Record<SlotType, (v: unknown) => boolean> = {
  Text: (v) => typeof v === "string" && v.trim().length > 0,
  Amount: (v) => (typeof v === "number" && v >= 0) || (typeof v === "string" && /^\$?[\d,]+(\.\d{1,2})?$/.test(v.trim())),
  Days: (v) => Number.isInteger(Number(v)) && Number(v) > 0 && String(v).trim() !== "",
  Percent: (v) => v !== "" && !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100,
};

export function instantiate(clause: Clause, values: Record<string, string | number>): string {
  const errors: string[] = [];
  for (const s of slotsOf(clause)) {
    const v = values[s.name];
    if (v === undefined || v === null || v === "") errors.push(`Missing value for [[${s.name}:${s.type}]]`);
    else if (!(checks[s.type] ?? checks.Text)(v)) errors.push(`Invalid ${s.type} for "${s.name}": ${JSON.stringify(v)}`);
  }
  if (errors.length) throw new ValidationError(errors);
  return clause.body.replace(SLOT_RE, (_, n: string) => String(values[n]));
}

export const SEED_CLAUSES: Clause[] = [
  {
    id: "indemnity-cap",
    version: 1,
    jurisdiction: "US-CA",
    title: "Indemnity Cap",
    body: "Each party's aggregate liability under this Agreement shall not exceed [[cap:Amount]], except for breach of confidentiality or infringement, and no claim may be brought more than [[period:Days]] days after discovery of the facts giving rise to it.",
    rubric: ["Cap amount is stated and mutual", "Carve-outs for wilful/IP breach present", "Limitations period is reasonable"],
  },
  {
    id: "confidentiality-carve-out",
    version: 1,
    jurisdiction: "US-NY",
    title: "Confidentiality Carve-Out",
    body: "\"Confidential Information\" does not include information that [[carveouts:Text]]; the receiving party's duties under this Section survive termination for [[term:Days]] days.",
    rubric: ["Carve-outs cover public-domain and prior-knowledge cases", "Survival term is bounded", "No overbroad residual-use claim"],
  },
  {
    id: "termination-cure",
    version: 1,
    jurisdiction: "US-DE",
    title: "Termination for Cause with Cure",
    body: "Either party may terminate for material breach by notice delivered via [[method:Text]] if the breach remains uncured [[cureDays:Days]] days after receipt of written notice specifying the breach in reasonable detail.",
    rubric: ["Cure period length is stated", "Notice method and detail requirement present", "Termination limited to material breach"],
  },
];

export function getClause(id: string): Clause | undefined {
  return SEED_CLAUSES.find((c) => c.id === id);
}
