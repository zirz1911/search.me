export type ScriptItem = {
    id: string;
    name: string;
    target: "n8n" | "gemlogin" | "gemphonefarm" | string;
    summary: string;
    language: string;
    lastUpdated: string;
    confidence: number;
    tags: string[];
  
    // Gemlogin
    device_id?: string;
    profile_id?: string;
    workflow_id?: string;
    soft_id?: string;
    token?: string;
  
    // parameter config
    required_params?: string[];
    default_params?: Record<string, string>;
  
    // view
    details?: string;
    docs_url?: string;
    examples?: string[];
  };