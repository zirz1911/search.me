// src/lib/n8n.ts
// Frontend helpers for n8n-related calls (canonical)

// ---- Backend API base ----
const API_BASE_RAW = ((import.meta as any).env.VITE_API_BASE as string | undefined) ?? "http://localhost:4000";
const API_BASE = API_BASE_RAW.replace(/\/+$/, ""); // trim trailing slashes

// Optional shared secret to talk to our backend proxy
const PROXY_KEY = ((import.meta as any).env.VITE_PROXY_KEY as string | undefined) ?? "";

// --- Public: Call LLM intent endpoint (if configured) ---
export async function callN8nIntentAPI(text: string) {
  const url = (import.meta as any).env.VITE_AI_INTENT_URL as string | undefined;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("AI intent API error:", e);
    return null;
  }
}

// --- Types for /proxy/n8n ---
export type N8nProxyRequest = {
  scriptId: string;
  params?: Record<string, any>;
  userText?: string;
  meta?: Record<string, any>;
};

export type N8nProxyResponse<T = any> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
  [k: string]: any;
};

// --- Public: Send a job to n8n via backend proxy ---
export async function sendToN8n(req: N8nProxyRequest): Promise<N8nProxyResponse> {
  const url = `${API_BASE}/proxy/n8n`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (PROXY_KEY) headers["x-proxy-key"] = PROXY_KEY;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      scriptId: req.scriptId,
      params: req.params || {},
      userText: req.userText ?? "",
      meta: req.meta || {},
    }),
  });

  const ct = resp.headers.get("content-type") || "";
  const raw = await resp.text();

  // Try parse JSON if possible, otherwise return text
  let parsed: any = raw;
  if (ct.includes("json")) {
    try { parsed = JSON.parse(raw); } catch { /* ignore */ }
  }

  if (!resp.ok) {
    // Normalize error shape
    return {
      success: false,
      message: (parsed && (parsed.message || parsed.error)) || `HTTP ${resp.status}`,
      error: typeof parsed === "string" ? parsed : JSON.stringify(parsed),
      status: resp.status,
    } as any;
  }

  // If backend returns raw JSON from n8n, pass it through; if it wraps, keep shape
  if (parsed && typeof parsed === "object" && ("success" in parsed || "data" in parsed)) {
    return parsed as N8nProxyResponse;
  }
  return { success: true, data: parsed } as N8nProxyResponse;
}