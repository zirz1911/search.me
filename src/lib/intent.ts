import { ScriptItem } from "../types";

export const WEIGHTS = {
  name: 0.35,
  summary: 0.30,
  tags: 0.25,
  target: 0.07,
  language: 0.03,
} as const;

export function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function scoreScript(s: ScriptItem, query: string, weights = WEIGHTS): number {
  const q = (query || "").trim().toLowerCase();
  if (!q) return 0;
  const qTokens = tokenize(q);

  const nameTokens = tokenize(s.name);
  const summaryTokens = tokenize(s.summary);
  const tagTokens = (s.tags || []).map((t) => t.toLowerCase());
  const target = (s.target || "").toLowerCase();
  const lang = (s.language || "").toLowerCase();

  const overlap = (a: string[], b: string[]) => {
    if (!a.length || !b.length) return 0;
    const setB = new Set(b);
    let hit = 0;
    for (const t of a) if (setB.has(t)) hit++;
    return hit / a.length;
  };

  const nameScore = overlap(qTokens, nameTokens);
  const sumScore = overlap(qTokens, summaryTokens);

  let tagScore = 0;
  for (const qt of qTokens) {
    if (tagTokens.some((tt) => tt.includes(qt))) tagScore += 1;
  }
  tagScore = Math.min(tagScore / Math.max(1, qTokens.length), 1);

  const targetScore = qTokens.some((t) => target.includes(t)) ? 1 : 0;
  const langScore = qTokens.some((t) => lang.includes(t)) ? 1 : 0;

  const total =
    nameScore * weights.name +
    sumScore * weights.summary +
    tagScore * weights.tags +
    targetScore * weights.target +
    langScore * weights.language;

  return Math.max(0, Math.min(1, total));
}