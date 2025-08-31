// src/lib/gemlogin.ts
export type GemloginPayload = {
    token: string;
    device_id: string;
    profile_id: string | number;
    workflow_id: string;
    soft_id: string | number;
    close_browser: boolean;
    parameter?: Record<string, any>;
  };
  
  const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";
  
  // เผื่อยังมีค่าจากไหนหลุดมาเป็น exescript ให้บังคับแก้ก่อนใช้
  export function toExecPath(p?: string) {
    return (p ?? "").replace(/exescript/gi, "execscript");
  }
  
  /**
   * ยิงผ่าน proxy เสมอ (ให้ backend แปลงเป็น x-www-form-urlencoded)
   */
  export async function execGemlogin(body: GemloginPayload) {
    const url = `${API_BASE}/proxy/gemlogin?encoding=form`;
  
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(`Proxy error ${res.status}: ${msg}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res.text();
  }