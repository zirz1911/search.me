import React, { useEffect, useState } from "react";
import type { ScriptItem, ParamValues } from "../types";

export function ConfigModal({
  script,
  paramValues,
  updateParam,
  onClose,
}: {
  script: ScriptItem;
  paramValues: ParamValues;
  updateParam: (scriptId: string, key: string, val: string) => void;
  onClose: () => void;
}) {
  // แสดงฟอร์มเมื่อสคริปต์นี้ต้องการพารามิเตอร์ (ปัจจุบันใช้ตามเดิมเฉพาะ gemlogin)
  const needsParams =
    script.target === "gemlogin" &&
    Array.isArray(script.required_params) &&
    script.required_params.length > 0;

  // ซิงค์ค่าจาก default_params + ค่าที่กรอกไว้ก่อนหน้าใน state หลัก (paramValues)
  const [formValues, setFormValues] = useState<Record<string, string>>({
    ...(script.default_params || {}),
    ...(paramValues[script.id] || {}),
  });

  useEffect(() => {
    setFormValues({
      ...(script.default_params || {}),
      ...(paramValues[script.id] || {}),
    });
  }, [script.id, paramValues]);

  // ฟังก์ชันช่วย: แปลงวันที่ให้สวย
  const prettyDate = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <h4 className="text-lg font-semibold">ตั้งค่าสคริปต์ — {script.name}</h4>
          <button
            onClick={onClose}
            className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            ปิด
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium capitalize">
              {script.target}
            </span>
            <span>อัปเดต {prettyDate(script.lastUpdated)}</span>
          </div>

          <p className="text-gray-700">{script.summary}</p>

          {needsParams ? (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-600">กรอกค่า Parameter ที่จำเป็น:</p>
              <div className="space-y-3">
                {script.required_params!.map((key) => (
                  <label key={key} className="block">
                    <span className="mb-1 block text-xs text-gray-500">{key.toUpperCase()}</span>
                    <input
                      value={formValues[key] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormValues((prev) => ({ ...prev, [key]: val }));
                        // ซิงค์ขึ้น state หลักทันที เพื่อให้ปุ่ม Run ในการ์ดปลดล็อกเมื่อครบ
                        updateParam(script.id, key, val);
                      }}
                      placeholder={script.default_params?.[key] ?? "ใส่ค่า..."}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-gray-500">
              สคริปต์นี้ไม่มีพารามิเตอร์บังคับ
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => {
                const keys = Array.isArray(script.required_params)
                  ? script.required_params
                  : Object.keys(formValues);
                for (const k of keys) {
                  updateParam(script.id, k, formValues[k] ?? "");
                }
                onClose();
              }}
              className="rounded-lg border px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              บันทึกค่า
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ViewModal({ script, onClose }: { script: ScriptItem; onClose: () => void }) {
  const prettyDate = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  };
  const tags = Array.isArray(script.tags) ? script.tags : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <h4 className="text-lg font-semibold">{script.name}</h4>
          <button
            onClick={onClose}
            className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            ปิด
          </button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium capitalize">
              {script.target}
            </span>
            <span>อัปเดต {prettyDate(script.lastUpdated)}</span>
          </div>
          <p className="text-gray-700">{script.summary}</p>

          {script.details && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">รายละเอียด</p>
              <p className="whitespace-pre-wrap text-gray-700">{script.details}</p>
            </div>
          )}

          {Array.isArray(script.examples) && script.examples.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">ตัวอย่างการใช้งาน</p>
              <ul className="list-disc space-y-1 pl-5 text-gray-700">
                {script.examples.map((ex, i) => (
                  <li key={i} className="break-words">
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {tags.map((t) => (
                <span key={t} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {script.docs_url && (
            <a
              href={script.docs_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-lg border border-indigo-200 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
            >
              เปิดเอกสารประกอบ
            </a>
          )}
        </div>
      </div>
    </div>
  );
}