export type ScriptItem = {
  id: string;
  name: string;
  target: "n8n" | "gemlogin" | "gemphonefarm" | (string & {});
  summary: string;

  // Backend can return null/undefined for some fields
  language?: string | null;
  lastUpdated?: string | null;
  confidence?: number | null;
  tags?: string[]; // jsonb[] may be undefined/null from DB

  // Gemlogin secrets (server-provided only; FE should not send them back)
  device_id?: string | null;
  profile_id?: string | null;
  workflow_id?: string | null;
  soft_id?: string | null;
  token?: string | null;

  // Parameter config (camelCase expected in FE)
  required_params?: string[];
  default_params?: Record<string, string>;

  // View/extras
  details?: string;
  docs_url?: string;
  examples?: string[];

  // Runtime/UI only (e.g., intent ranking score)
  matchScore?: number;
};

// Helper type for state that stores per-script parameter values in the UI
export type ParamValues = Record<string, Record<string, string>>;