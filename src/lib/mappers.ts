import { ScriptItem } from "../types";

export function mapRowToScriptItem(r: any): ScriptItem {
  return {
    id: r.id,
    name: r.name,
    target: r.target,
    summary: r.summary,
    language: r.language,
    tags: Array.isArray(r.tags) ? r.tags : [],
    confidence: typeof r.confidence === "number" ? r.confidence : Number(r.confidence ?? 0),
    lastUpdated: r.lastUpdated ?? r.last_updated ?? null,
    required_params: Array.isArray(r.params_required) ? r.params_required : r.required_params || [],
    default_params: r.params_default || r.default_params || {},
    token: r.token ?? null,
    device_id: r.device_id ?? null,
    profile_id: r.profile_id ?? null,
    workflow_id: r.workflow_id ?? null,
    soft_id: r.soft_id ?? r.softId ?? "1",
    docs_url: r.docs_url ?? r.docsUrl ?? undefined,
  };
}