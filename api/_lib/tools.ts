// api/_lib/tools.ts — LexForge tool registry for DeepSeek function-calling.
// register(name, schema, handler, toolsets) · get_defs(toolset) · handle_call(name, args)
type Handler = (args: any) => Promise<unknown>;
interface Schema { description: string; parameters: Record<string, unknown>; }
interface Entry extends Schema { handler: Handler; toolsets: string[]; }
const REG = new Map<string, Entry>();

export function register(name: string, schema: Schema, handler: Handler, toolsets: string[] = ["default"]): void {
  REG.set(name, { ...schema, handler, toolsets });
}

type DsTool = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

export function get_defs(toolset?: string): DsTool[] {
  return [...REG.entries()]
    .filter(([, t]) => !toolset || t.toolsets.includes(toolset))
    .map(([name, t]) => ({ type: "function" as const, function: { name, description: t.description, parameters: t.parameters } }));
}

export async function handle_call(name: string, args: any = {}): Promise<unknown> {
  const t = REG.get(name);
  if (!t) throw new Error(`unknown tool: ${name}`);
  return t.handler(args ?? {});
}

// Stubs delegating to existing services — swap `via*` bodies with the real calls.
const viaSearch = async (a: any) => ({ via: "services/cases.search", args: a, hits: [] });
const viaCite = async (a: any) => ({ via: "services/cites.verify", args: a, results: [] });
const viaDraft = async (a: any) => ({ via: "services/draft.compose", args: a, text: "" });
const viaScore = async (a: any) => ({ via: "services/scores.grade", args: a, score: 0 });

register("search_cases", {
  description: "Search case law by query and jurisdiction.",
  parameters: { type: "object", properties: { query: { type: "string" }, jurisdiction: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
}, viaSearch, ["research", "default"]);

register("cite_check", {
  description: "Verify citation strings and flag hallucinations.",
  parameters: { type: "object", properties: { citations: { type: "array", items: { type: "string" } } }, required: ["citations"] },
}, viaCite, ["research", "default"]);

register("draft_section", {
  description: "Draft a brief section from heading and bullet points.",
  parameters: { type: "object", properties: { heading: { type: "string" }, points: { type: "array", items: { type: "string" } }, tone: { type: "string" } }, required: ["heading", "points"] },
}, viaDraft, ["drafting", "default"]);

register("score_argument", {
  description: "Score a legal argument against a rubric.",
  parameters: { type: "object", properties: { argument: { type: "string" }, rubric: { type: "string" } }, required: ["argument"] },
}, viaScore, ["drafting", "default"]);
