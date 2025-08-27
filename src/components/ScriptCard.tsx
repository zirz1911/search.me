import React from "react";
import type { ScriptItem } from "../types";

type Props = {
  s: ScriptItem;
  paramValues: Record<string, Record<string, string>>;
  // Optional and 2-arg signature to match parent usage
  updateParam?: (key: string, val: string) => void;
  onRun: (id: string) => void;
  onView: (id: string) => void;
  onConfig: (id: string) => void;
  score?: number; // ความใกล้เคียง (0-1)
};

export default function ScriptCard({
  s, paramValues, updateParam, onRun, onView, onConfig, score
}: Props) {
  const pct = typeof score === "number" ? Math.round(score * 100) : null;

  const needsParams =
    s.target === "gemlogin" && Array.isArray(s.required_params) && s.required_params.length > 0;

  const missingRequired =
    needsParams && s.required_params!.some((k) => !((paramValues[s.id]?.[k] || "").trim()));

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-700">
          {s.target}
        </span>
        <div className="flex items-center gap-2">
          {pct !== null && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              ใกล้เคียง {pct}%
            </span>
          )}
          <span className="text-xs text-gray-400">อัปเดต {s.lastUpdated}</span>
        </div>
      </div>

      <h3 className="mb-1 line-clamp-2 text-lg font-semibold">{s.name}</h3>
      <p className="mb-3 line-clamp-3 text-sm text-gray-600">{s.summary}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {s.tags.map((t) => (
          <span key={t} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">#{t}</span>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">{s.language}</span>
        <span className="text-gray-500">ความเชื่อมั่น {(s.confidence * 100).toFixed(0)}%</span>
      </div>


      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onConfig(s.id)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ตั้งค่าสคริปต์
          </button>
          <button
            onClick={() => onView(s.id)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View
          </button>
        </div>
        <button
          onClick={() => onRun(s.id)}
          disabled={missingRequired}
          className={`w-full rounded-xl px-3 py-2 text-sm font-medium text-white ${
            missingRequired
              ? "bg-indigo-300 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {s.target === "n8n"
            ? "ส่งไป n8n"
            : s.target === "gemlogin"
            ? "ส่งไป Gemlogin"
            : s.target === "gemphonefarm"
            ? "ส่งไป Gemphonefarm"
            : "ส่งไป"}
        </button>
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-black/5 transition group-hover:ring-indigo-500/30" />
    </article>
  );
}