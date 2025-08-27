import React, { useEffect, useState } from "react";
import { ScriptItem } from "./types";
import { getEndpointForTarget, postJSON } from "./lib/api";
import ScriptCard from "./components/ScriptCard";
import { ConfigModal, ViewModal } from "./components/Modals";

const DEFAULT_SCRIPTS: ScriptItem[] = [ /* คงไว้เหมือนเดิมหรือเว้นว่างก็ได้ */ ];

export default function App() { return <GemSearch />; }

function GemSearch() {
  const [q, setQ] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [allScripts, setAllScripts] = useState<ScriptItem[]>(DEFAULT_SCRIPTS);
  const [results, setResults] = useState<ScriptItem[]>([]);
  const [viewing, setViewing] = useState<ScriptItem | null>(null);
  const [configFor, setConfigFor] = useState<ScriptItem | null>(null);

  const [paramValues, setParamValues] = useState<Record<string, Record<string, string>>>({});
  function updateParam(scriptId: string, key: string, val: string) {
    setParamValues((prev) => ({ ...prev, [scriptId]: { ...(prev[scriptId] || {}), [key]: val } }));
  }

  useEffect(() => {
    fetch("/script.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data: ScriptItem[]) => {
        if (!Array.isArray(data)) return;
        setAllScripts(data);
        const initParams = data.reduce((acc, it) => { acc[it.id] = { ...(it.default_params || {}) }; return acc; }, {} as Record<string, Record<string,string>>);
        setParamValues(initParams);
      })
      .catch(() => {});
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true); setIsSearching(true);
    setTimeout(() => {
      const k = q.trim().toLowerCase();
      const filtered = allScripts.filter((s) =>
        !k || s.name.toLowerCase().includes(k) || s.summary.toLowerCase().includes(k) ||
        s.target.toLowerCase().includes(k) || s.tags.some((t) => t.toLowerCase().includes(k))
      );
      setResults(filtered); setIsSearching(false);
    }, 500);
  }

  async function handleRun(id: string) {
    const script = allScripts.find((s) => s.id === id);
    if (!script) return alert("ไม่พบสคริปต์นี้");

    const url = getEndpointForTarget(script.target);
    if (!url) return alert("ยังไม่ได้ตั้งค่า URL สำหรับ target นี้ในไฟล์ .env.local");

    let payload: any;
    if (script.target === "gemlogin") {
      if (!script.token || !script.device_id || !script.profile_id || !script.workflow_id)
        return alert("สคริปต์ Gemlogin ยังขาดค่า token/device_id/profile_id/workflow_id ใน scripts.json");

      const current = paramValues[script.id] || {};
      const parameter = { ...(script.default_params || {}), ...current };
      if (Array.isArray(script.required_params) && script.required_params.some((k) => !(parameter[k] || "").trim()))
        return alert("กรอก parameter ให้ครบก่อนส่ง");

      payload = {
        token: script.token,
        device_id: script.device_id,
        profile_id: script.profile_id,
        workflow_id: script.workflow_id,
        parameter,
        soft_id: script.soft_id || "1",
        close_browser: false,
      };
    } else {
      payload = { scriptId: id, target: script.target, requestedAt: new Date().toISOString(), client: { id: "demo-client" } };
    }

    const { ok, status, data } = await postJSON(url, payload);
    if (!ok) return alert("เรียกปลายทางไม่สำเร็จ: " + (typeof data === "string" ? data : data?.message || status));
    alert("ส่งงานแล้ว ✅\nตอบกลับ: " + (typeof data === "string" ? data : JSON.stringify(data)));
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="mx-auto max-w-3xl pt-16 pb-6 text-center">
        <h1 className="text-5xl font-semibold tracking-tight">Search Me Bro</h1>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-3xl items-center gap-3 px-6">
        <div className="flex w-full items-center rounded-full bg-indigo-700 px-5 py-3 shadow-sm">
          <MagnifierIcon className="mr-3 h-5 w-5 text-white/90" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์สิ่งที่อยากทำ..." className="w-full bg-transparent text-white placeholder-white/70 outline-none" />
          <button type="submit" className="ml-3 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur hover:bg-white/25">ค้นหา</button>
        </div>
      </form>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-8">
        {submitted && (<p className="mb-4 text-sm text-gray-500">{isSearching ? "กำลังค้นหา..." : `ผลการค้นหา ${results.length} รายการ (ข้อมูลจำลอง)`}</p>)}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isSearching && <PlaceholderCards />}
          {!isSearching && results.map((s) => (
            <ScriptCard
              key={s.id}
              s={s}
              paramValues={paramValues}
              updateParam={updateParam}
              onRun={handleRun}
              onView={(id) => setViewing(allScripts.find(x => x.id === id) || null)}
              onConfig={(id) => setConfigFor(allScripts.find(x => x.id === id) || null)}
            />
          ))}
        </div>

        {!isSearching && submitted && results.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed p-8 text-center text-gray-500">
            ไม่พบสคริปต์ที่ตรง ลองพิมพ์คำค้นอื่น เช่น "login", "uploader", "proxy"
          </div>
        )}

        {configFor && (
          <ConfigModal
            script={configFor}
            paramValues={paramValues}
            updateParam={updateParam}
            onClose={() => setConfigFor(null)}
          />
        )}

        {viewing && (
          <ViewModal
            script={viewing}
            onClose={() => setViewing(null)}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}

function MagnifierIcon({ className = "" }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PlaceholderCards() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-40 rounded-2xl border border-gray-200 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_infinite] bg-[length:200%_100%]" />
      ))}
    </>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-5xl px-6 pb-10 pt-12 text-center text-xs text-gray-400">
      สาธิตหน้าค้นหา Gem — ข้อมูลเป็นตัวอย่างจำลอง สามารถเชื่อมต่อ API จริงภายหลัง
    </footer>
  );
}