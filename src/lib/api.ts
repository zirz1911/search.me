// เลือกปลายทางจาก env (ยังคงใช้ .env.local ตามที่ตั้งใจ)
export function getEndpointForTarget(target: string): string | null {
    if (target === "n8n") return (import.meta as any).env.VITE_N8N_WEBHOOK_URL || null;
    if (target === "gemlogin") return (import.meta as any).env.VITE_GEMLOGIN_URL || null;
    if (target === "gemphonefarm") return (import.meta as any).env.VITE_GEMPHONEFARM_URL || null;
    return null;
  }
  
  export async function postJSON(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  }