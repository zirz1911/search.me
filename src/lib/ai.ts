import { ScriptItem, ParamValues } from "../types";

function extractUrlFromText(qText: string): string | undefined {
  try {
    const m = qText.match(/((https?:\/\/)?(www\.)?[\w.-]+\.[a-z]{2,}(\/\S*)?)/i);
    if (!m) return undefined;
    let u = m[0];
    if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  } catch {
    return undefined;
  }
}

export function applyAiToSearch(
  qText: string,
  ai: any,
  allScripts: ScriptItem[],
  paramValues: ParamValues
): { ordered: ScriptItem[]; idToScore: Record<string, number>; paramValues: ParamValues } {
  const idToScore: Record<string, number> = {};
  if (Array.isArray(ai?.matches)) {
    for (const m of ai.matches) {
      if (m && m.id) idToScore[m.id] = Number(m.score) || 0;
    }
  }

  const newParamValues: ParamValues = { ...paramValues };
  const fromAiGlobal = ai?.extracted_params && typeof ai.extracted_params === "object" ? ai.extracted_params : undefined;
  const per = Array.isArray(ai?.per_script_params) ? ai.per_script_params : [];

  const urlFromAI = (fromAiGlobal?.url || fromAiGlobal?.link || fromAiGlobal?.video_url) ?? (() => {
    const first = per.find((p: any) => p?.params?.url || p?.params?.link || p?.params?.video_url);
    return first ? (first.params.url || first.params.link || first.params.video_url) : undefined;
  })();

  const candidateURL =
    (typeof urlFromAI === "string" && urlFromAI.trim()) ? urlFromAI.trim() : extractUrlFromText(qText);

  if (fromAiGlobal) {
    for (const s of allScripts) {
      if (idToScore[s.id] !== undefined) {
        const cur = newParamValues[s.id] || { ...(s.default_params || {}) };
        for (const [k, v] of Object.entries(fromAiGlobal)) {
          const key = String(k).toLowerCase();
          const val = typeof v === "string" ? v.trim() : "";
          if (val) cur[key] = val;
        }
        if (!cur.url && candidateURL) cur.url = candidateURL;
        newParamValues[s.id] = cur;
      }
    }
  }

  for (const p of per) {
    const s = allScripts.find((x) => x.id === p.id);
    if (!s) continue;
    const cur = newParamValues[s.id] || { ...(s.default_params || {}) };
    for (const [k, v] of Object.entries(p.params || {})) {
      const key = String(k).toLowerCase();
      const val = typeof v === "string" ? v.trim() : "";
      if (val) cur[key] = val;
    }
    if (!cur.url && candidateURL) cur.url = candidateURL;
    newParamValues[s.id] = cur;
  }

  if (candidateURL) {
    for (const s of allScripts) {
      if (idToScore[s.id] !== undefined) {
        const cur = newParamValues[s.id] || { ...(s.default_params || {}) };
        if (!cur.url) cur.url = candidateURL;
        newParamValues[s.id] = cur;
      }
    }
  }

  const ordered = allScripts
    .filter((s) => idToScore[s.id] !== undefined)
    .sort((a, b) => idToScore[b.id] - idToScore[a.id]);

  return { ordered, idToScore, paramValues: newParamValues };
}