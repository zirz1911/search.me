import React, { useEffect, useState } from "react";
import { ScriptItem } from "./types";
import { getEndpointForTarget, postJSON } from "./lib/api";
import ScriptCard from "./components/ScriptCard";
import { ConfigModal, ViewModal } from "./components/Modals";

import { callN8nIntentAPI, sendToN8n } from "./lib/n8n";
import { scoreScript } from "./lib/intent";
import { mapRowToScriptItem } from "./lib/mappers";
import { applyAiToSearch } from "./lib/ai";

// ---- Backend API base (for Postgres service) ----
const API_BASE_RAW = ((import.meta as any).env.VITE_API_BASE as string | undefined) ?? "http://localhost:4000";
const API_BASE = API_BASE_RAW.replace(/\/+$/, ""); // trim trailing slashes

// Optional shared secret for backend proxy
const PROXY_KEY = ((import.meta as any).env.VITE_PROXY_KEY as string | undefined) ?? "";

// Debug helper (mask secrets in console)
const mask = (v?: string | null, keepStart = 3, keepEnd = 2) => {
  if (!v) return "";
  const s = String(v);
  if (s.length <= keepStart + keepEnd) return "*".repeat(s.length);
  return s.slice(0, keepStart) + "…" + s.slice(-keepEnd);
};

// Normalize default params that may come as JSON string or object
function asObj(v: any): Record<string, any> {
  if (!v) return {};
  if (typeof v === "string") {
    try {
      const o = JSON.parse(v);
      return o && typeof o === "object" ? (o as Record<string, any>) : {};
    } catch {
      return {};
    }
  }
  if (typeof v === "object") return v as Record<string, any>;
  return {};
}

// Optional: show where data/requests come from while developing
if (import.meta.env?.MODE !== "production") {
  // eslint-disable-next-line no-console
  console.log("[FE] API_BASE=", API_BASE, " PROXY_KEY(set?)=", Boolean(PROXY_KEY), " preview=", mask(PROXY_KEY));
}

const DEFAULT_SCRIPTS: ScriptItem[] = [ /* คงไว้เหมือนเดิมหรือเว้นว่างก็ได้ */ ];

// === Recent usage (local) ===
type UsageItem = {
  id: string;
  name: string;
  target: string;
  ts: number; // epoch ms
};

const HISTORY_KEY = "gem:last-usage:v1";
function loadHistory(): UsageItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveHistory(items: UsageItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 50))); } catch {}
}
function recordUsage(now: number, s: { id: string; name: string; target: string }, current: UsageItem[]) {
  const next = [{ id: s.id, name: s.name || s.id, target: s.target, ts: now }, ...current];
  saveHistory(next);
  return next.slice(0, 50);
}
function timeAgo(ts: number) {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function App() { return <GemSearch />; }

function GemSearch() {
  const [q, setQ] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [allScripts, setAllScripts] = useState<ScriptItem[]>(DEFAULT_SCRIPTS);
  const [results, setResults] = useState<ScriptItem[]>([]);
  const [matchScores, setMatchScores] = useState<Record<string, number>>({});
  const [viewing, setViewing] = useState<ScriptItem | null>(null);
  const [configFor, setConfigFor] = useState<ScriptItem | null>(null);
  const [dataSource, setDataSource] = useState<'api' | 'file' | 'none'>('none');
  const [history, setHistory] = useState<UsageItem[]>(() => loadHistory());


  function updateParam(scriptId: string, key: string, val: string) {
    setParamValues((prev) => ({ ...prev, [scriptId]: { ...(prev[scriptId] || {}), [key]: val } }));
  }

  const [paramValues, setParamValues] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    async function load() {
      // 1) Try backend API first (VITE_API_BASE=/scripts)
      if (API_BASE) {
        try {
          const res = await fetch(`${API_BASE}/scripts`, { cache: "no-store" });
          if (res.ok) {
            const rows = await res.json();
            if (Array.isArray(rows)) {
              const mapped = rows.map(mapRowToScriptItem);
              setAllScripts(mapped);
              const initParams = mapped.reduce((acc, it) => {
                acc[it.id] = { ...asObj(it.default_params) };
                return acc;
              }, {} as Record<string, Record<string, string>>);
              setParamValues(initParams);
              setDataSource('api');
              return; // done
            }
          }
        } catch {}
      }

      // 2) Fallback to bundled json
      try {
        const r = await fetch("/script.json", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.statusText));
        const data = await r.json();
        if (!Array.isArray(data)) return;
        // ensure fields in camel for UI
        const mapped = data.map(mapRowToScriptItem);
        setAllScripts(mapped);
        const initParams = mapped.reduce((acc, it) => {
          acc[it.id] = { ...asObj(it.default_params) };
          return acc;
        }, {} as Record<string, Record<string, string>>);
        setParamValues(initParams);
        setDataSource('file');
      } catch {}
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setIsSearching(true);

    const qText = q.trim();
    if (!qText) {
      setResults(allScripts);
      setMatchScores({});
      setIsSearching(false);
      return;
    }

    // 1) Try n8n AI intent first
    const ai = await callN8nIntentAPI(qText);
    if (ai && Array.isArray(ai.matches) && ai.matches.length) {
      const { ordered, idToScore, paramValues: pv2 } = applyAiToSearch(qText, ai, allScripts, paramValues);
      setParamValues(pv2);
      setResults(ordered);
      setMatchScores(idToScore);
      setIsSearching(false);
      return;
    }

    // 2) Fallback to local scoring when AI not available or no matches
    const rankedList = allScripts
      .map((s) => ({ s, score: scoreScript(s, qText) }))
      .sort((a, b) => b.score - a.score)
      .filter((x) => x.score > 0.0001);
    setResults(rankedList.map((x) => x.s));
    setMatchScores(Object.fromEntries(rankedList.map((x) => [x.s.id, x.score])));
    setIsSearching(false);
  }

  async function handleRun(id: string) {
    const script = allScripts.find((s) => s.id === id);
    if (!script) return alert("ไม่พบสคริปต์นี้");

    if (script.target === "gemlogin") {
      if (!script.token || !script.device_id || !script.profile_id || !script.workflow_id) {
        return alert("สคริปต์ Gemlogin ยังขาดค่า token/device_id/profile_id/workflow_id ใน scripts.json");
      }

      const current = paramValues[script.id] || {};
      const parameter = { ...asObj(script.default_params), ...current } as Record<string, any>;

      if (
        Array.isArray(script.required_params) &&
        script.required_params.some((k) => !(parameter[k] || "").toString().trim())
      ) {
        return alert("กรอก parameter ให้ครบก่อนส่ง");
      }

      const payload = {
        token: script.token,
        device_id: script.device_id,
        profile_id: script.profile_id,
        workflow_id: script.workflow_id,
        parameter,
        soft_id: script.soft_id || "1",
        close_browser: false,
      };

      try {
        const res = await fetch(`${API_BASE}/proxy/gemlogin`, {
          method: "POST",
          headers: (() => {
            const h: Record<string, string> = { "content-type": "application/json" };
            if (PROXY_KEY) h["x-proxy-key"] = PROXY_KEY;
            return h;
          })(),
          body: JSON.stringify(payload),
        });
        const raw = await res.text();
        if (!res.ok) throw new Error(`Proxy error ${res.status}: ${raw}`);
        let data: any = raw;
        try { data = JSON.parse(raw); } catch {}
        alert("ส่งงานแล้ว ✅\nตอบกลับ: " + (typeof data === "string" ? data : JSON.stringify(data)));
        setHistory(h => recordUsage(Date.now(), { id: script.id, name: script.name, target: script.target }, h));
      } catch (err: any) {
        alert("เรียกปลายทางไม่สำเร็จ: " + (err?.message || String(err)));
      }
      return;
    }

    if (script.target === "n8n") {
      const current = paramValues[script.id] || {};
      const params = { ...asObj(script.default_params), ...current } as Record<string, any>;

      if (
        Array.isArray(script.required_params) &&
        script.required_params.some((k) => !(params[k] || "").toString().trim())
      ) {
        return alert("กรอก parameter ให้ครบก่อนส่ง");
      }

      try {
        const resp = await sendToN8n({
          scriptId: script.id,
          params,
          userText: q.trim(),
          meta: { source: "frontend" },
        });

        if (!resp || resp.success === false) {
          return alert("เรียก n8n ไม่สำเร็จ: " + (resp?.message || ""));
        }

        const payload = resp?.data ?? resp;
        alert(
          "ส่งไป n8n แล้ว ✅\nตอบกลับ: " +
            (typeof payload === "string" ? payload : JSON.stringify(payload))
        );
        setHistory(h => recordUsage(Date.now(), { id: script.id, name: script.name, target: script.target }, h));
      } catch (e: any) {
        alert("เรียก n8n ไม่สำเร็จ: " + (e?.message || String(e)));
      }
      return;
    }

    // Other targets -> use configured endpoint
    const url = getEndpointForTarget(script.target);
    if (!url) return alert("ยังไม่ได้ตั้งค่า URL สำหรับ target นี้ในไฟล์ .env.local");

    const payload = {
      scriptId: id,
      target: script.target,
      requestedAt: new Date().toISOString(),
      client: { id: "demo-client" },
    };

    const { ok, status, data } = await postJSON(url, payload);
    if (!ok) return alert("เรียกปลายทางไม่สำเร็จ: " + (typeof data === "string" ? data : data?.message || status));
    alert("ส่งงานแล้ว ✅\nตอบกลับ: " + (typeof data === "string" ? data : JSON.stringify(data)));
    setHistory(h => recordUsage(Date.now(), { id: script.id, name: script.name, target: script.target }, h));
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="mx-auto max-w-6xl px-6 pt-12 pb-2">
        <h1 className="text-5xl font-semibold tracking-tight">Search Me Bro</h1>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto max-w-6xl px-6">
        <div className="max-w-[640px]">
          <div className="flex w-full items-center rounded-full bg-indigo-700 px-5 py-3 shadow-sm">
            <MagnifierIcon className="mr-3 h-5 w-5 text-white/90" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="อธิบายสคริปต์ที่ต้องการ… เช่น: เพิ่มวิว YouTube จากลิงก์"
              className="w-full bg-transparent text-white placeholder-white/70 outline-none"
            />
            <button
              type="submit"
              className="ml-3 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur hover:bg-white/25"
            >
              ค้นหา
            </button>
          </div>
        </div>
      </form>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-8">
        {submitted && (
          <p className="mb-4 text-sm text-gray-500">
            {isSearching ? (
              "กำลังวิเคราะห์คำอธิบาย..."
            ) : (
              <>
                ผลที่ใกล้เคียง {results.length} รายการ
                <span
                  className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    dataSource === 'api'
                      ? 'bg-emerald-50 text-emerald-700'
                      : dataSource === 'file'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {dataSource === 'api' ? 'DATABASE' : dataSource === 'file' ? 'File' : '—'}
                </span>
              </>
            )}
          </p>
        )}

        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
          {/* LEFT: results */}
          <div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {isSearching && <PlaceholderCards />}
              {!isSearching && results.map((s) => (
                <ScriptCard
                  key={s.id}
                  s={s}
                  score={matchScores[s.id]}
                  paramValues={paramValues}
                  updateParam={(key, val) => updateParam(s.id, key, val)}
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
          </div>

          {/* RIGHT: history */}
          <aside className="mt-10 lg:mt-0">
            <div className="sticky top-6 rounded-2xl border border-gray-200 p-4">
              <h3 className="mb-3 text-lg font-semibold">Last use Script</h3>
              {history.length === 0 ? (
                <p className="text-sm text-gray-500">ยังไม่มีประวัติการใช้งาน</p>
              ) : (
                <ul className="space-y-2">
                  {history.slice(0, 12).map((h, i) => (
                    <li key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-medium">{h.name || h.id}</span>
                        <span className="ml-3 whitespace-nowrap text-xs text-gray-500">{timeAgo(h.ts)}</span>
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                        {h.target}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>

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