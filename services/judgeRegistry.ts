import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface RubricRow { criterion: string; scale: string }
export interface Judge {
  name: string; difficulty: string; mode: string; version: string;
  persona: string; rubric: RubricRow[]; pass: string; hash: string;
}

const need = ["name", "difficulty", "mode", "version"];
const section = (body: string, h: string) =>
  new RegExp(`## ${h}\n([\\s\\S]*?)(?=\n## |$)`).exec(body)?.[1].trim() ?? "";

export function parseSkill(raw: string): Judge {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("SKILL.md: missing frontmatter");
  const [, fm, body] = m, text = body.trim();
  const meta: Record<string, string> = Object.fromEntries(
    fm.split("\n").filter((l) => l.includes(":")).map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  );
  for (const k of need) if (!meta[k]) throw new Error(`SKILL.md: frontmatter missing "${k}"`);
  const rubric = section(text, "Rubric").split("\n")
    .filter((l) => l.startsWith("|") && !/^\|?\s*criterion/i.test(l) && !/---/.test(l))
    .map((l) => { const c = l.split("|").map((s) => s.trim()); return { criterion: c[1], scale: c[2] }; });
  return {
    name: meta.name, difficulty: meta.difficulty, mode: meta.mode, version: meta.version,
    persona: section(text, "Persona"), rubric, pass: section(text, "Pass"),
    hash: createHash("sha256").update(text).digest("hex"), // hash = sha256(body)
  };
}

export interface Registry { judges: Map<string, Judge>; active: Record<string, string> }

export function loadJudges(dir: string): Registry {
  const judges = new Map<string, Judge>(), active: Record<string, string> = {};
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    try {
      const j = parseSkill(readFileSync(join(dir, d.name, "SKILL.md"), "utf8"));
      const prev = judges.get(j.name);
      if (!prev || j.version > prev.version) { judges.set(j.name, j); active[j.name] = j.version; }
    } catch { /* skip invalid skill dirs */ }
  }
  return { judges, active }; // active pins the loaded version per judge name
}

export const getJudge = (r: Registry, name: string): Judge | undefined => r.judges.get(name);
