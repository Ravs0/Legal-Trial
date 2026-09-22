// Needle sidecar schemas + confidence gate (A13 — owns LEGAL/api/_lib/needle/).
// ESM (package.json "type": "module"), dependency-free: this runs inside the
// Vercel Node request path, where the python Needle lib cannot be imported.
// It consumes the JSON produced OFFLINE by extract.py (sidecar pattern).
//
// Explicit fields only — never judgment (judgment = JEV, prose = LLM).

// Mirrors extract.py Authority dataclass (all three literal strings).
export const AuthoritySchema = {
  type: "object",
  required: ["case_name", "citation", "proposition"],
  properties: {
    case_name: { type: "string", minLength: 1 },
    citation: { type: "string", minLength: 1 },
    proposition: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
};

// Mirrors extract.py TurnFacts (bool from Needle, count from regex).
// cited_any is strictly boolean: extract.py emits null ONLY for an
// ungrounded bool, and null must fail the shape gate so fromSidecar maps it
// to EXTRACTION_UNGROUNDED (never a silent pass).
export const TurnFactsSchema = {
  type: "object",
  required: ["cited_any", "hedge_count"],
  properties: {
    cited_any: { type: "boolean" },
    hedge_count: { type: "integer", minimum: 0 },
  },
  additionalProperties: false,
};

export const EXTRACTION_UNGROUNDED = "EXTRACTION_UNGROUNDED";
export const EXTRACTION_ERROR = "EXTRACTION_ERROR";

// Needle confidence on legal tasks measured 0.25-0.56 live (contract), so the
// default gate sits ABOVE that band: anything ungrounded or low-confidence
// escalates, never invents (same abstain philosophy as score.js ABSTAIN_GAP).
// HONEST LIMIT (verified in installed cactus-needle 3.0.2): needle.extract()
// returns only the arguments dict — the engine's confidence rides a response
// envelope that extract() discards, and extract.py emits no confidence field,
// so fromSidecar cannot feed the numeric branch today. The LIVE gate is
// strict grounding (+ empty/null guards in extract.py), which escalates on
// exactly the inputs a low-confidence score would flag. If a future Needle
// version (or the agent run() flow) exposes confidence, plumb it through
// extract.py -> fromSidecar -> gateExtraction without changing this gate.
// Until then the confidence branch below is tested standby, not live path.
export const DEFAULT_THRESHOLD = 0.6;

// Minimal JSON-schema check (no deps — keep the fn bundle lean).
export function validateShape(value, schema) {
  const errors = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["not an object"] };
  }
  for (const k of schema.required || []) {
    if (!Object.hasOwn(value, k)) errors.push(`missing: ${k}`);
  }
  if (schema.additionalProperties === false) {
    for (const k of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, k)) errors.push(`unexpected: ${k}`);
    }
  }
  for (const [k, rule] of Object.entries(schema.properties || {})) {
    if (!Object.hasOwn(value, k)) continue;
    const v = value[k];
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    const t = v === null ? "null" : Array.isArray(v) ? "array"
      : Number.isInteger(v) ? "integer" : typeof v === "number" ? "number" : typeof v;
    const match = types.some((ty) => ty === t || (ty === "number" && t === "integer"));
    if (!match) { errors.push(`bad type: ${k} (want ${types}, got ${t})`); continue; }
    if (rule.minLength && v.length < rule.minLength) errors.push(`too short: ${k}`);
    if (rule.minimum !== undefined && v < rule.minimum) errors.push(`below minimum: ${k}`);
  }
  return { ok: errors.length === 0, errors };
}

// Confidence gate at every handoff: below threshold -> escalate, never invent.
export function gateExtraction({ value, schema, confidence, threshold = DEFAULT_THRESHOLD }) {
  const shape = validateShape(value, schema);
  if (!shape.ok) {
    return { ok: false, code: EXTRACTION_UNGROUNDED, escalate: true, reason: shape.errors };
  }
  if (typeof confidence === "number" && confidence < threshold) {
    return { ok: false, code: "LOW_CONFIDENCE", escalate: true, reason: [`${confidence} < ${threshold}`] };
  }
  return { ok: true, value, escalate: false };
}

// Normalise one extract.py stdout line into gate inputs. Catches the
// ExtractionValidationError pattern: null authority / null cited_any with an
// "ungrounded:*" status becomes {ok:false, code: EXTRACTION_UNGROUNDED,
// escalate:true} — the chain escalates, never invents.
export function fromSidecar(raw) {
  const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!doc || doc.ok !== true) {
    return {
      ok: false,
      code: doc && doc.code ? doc.code : EXTRACTION_UNGROUNDED,
      escalate: doc ? doc.escalate !== false : true,
      reason: [doc && doc.error ? doc.error : "sidecar reported failure"],
      authority: null, turnFacts: null,
    };
  }
  const out = { ok: true, escalate: !!doc.escalate, authority: null, turnFacts: null, codes: [] };
  if (doc.authority) {
    const g = gateExtraction({ value: doc.authority, schema: AuthoritySchema });
    if (g.ok) out.authority = g.value;
    else { out.ok = false; out.escalate = true; out.codes.push(EXTRACTION_UNGROUNDED); }
  } else if (String(doc.authority_status || "").startsWith("ungrounded")) {
    out.ok = false; out.escalate = true; out.codes.push(EXTRACTION_UNGROUNDED);
  } else if (doc.authority === null && doc.authority_status) {
    // Engine failure ("error:*", incl. the no-tool-call None path): the
    // chain still escalates, and code-based consumers (chain human_review
    // routing on EXTRACTION_UNGROUNDED) must see a code, not a silent pass.
    out.ok = false; out.escalate = true; out.codes.push(EXTRACTION_ERROR);
  }
  const tf = gateExtraction({ value: doc.turn_facts, schema: TurnFactsSchema });
  if (tf.ok) out.turnFacts = tf.value;
  else {
    out.ok = false; out.escalate = true;
    out.codes.push(String(doc.cited_status || "").startsWith("ungrounded")
      ? EXTRACTION_UNGROUNDED : "BAD_TURN_FACTS");
  }
  if (!out.ok && out.codes.length === 0) out.codes.push(EXTRACTION_UNGROUNDED);
  return out;
}
