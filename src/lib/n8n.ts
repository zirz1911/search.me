export async function callN8nIntentAPI(text: string) {
    const url = (import.meta as any).env.VITE_AI_INTENT_URL as string | undefined;
    if (!url) return null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn("AI intent API error:", e);
      return null;
    }
  }