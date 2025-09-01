// backend/script/sync-from-json.ts
// Sync scripts from a JSON file into Postgres (Drizzle)
// Usage:
//   pnpm tsx backend/script/sync-from-json.ts [path-to-json]
//   npm  run -s  tsx -- backend/script/sync-from-json.ts [path-to-json]

import * as fs from "fs/promises";
import * as path from "path";
import * as dotenv from "dotenv";

// Load backend/.env explicitly (so you can run from repo root)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Lazy-load DB and schema *after* env is loaded to avoid ESM import hoisting
async function loadDb() {
  const { db } = await import("../src/db/index");
  const { scripts } = await import("../src/db/schema");
  return { db, scripts };
}

import { eq } from "drizzle-orm";

// --- Types from JSON (be liberal; normalize below) ---
export type JsonScript = {
  id: string;
  name: string;
  target: "gemlogin" | "n8n" | "gemphonefarm" | string;
  summary?: string;
  language?: string;
  lastUpdated?: string | Date;
  confidence?: number;
  tags?: string[];
  token?: string;
  device_id?: string;
  profile_id?: string | number;
  workflow_id?: string;
  soft_id?: string | number;
  required_params?: string[]; // may contain Thai labels like "URL: …"
  default_params?: Record<string, any> | null; // some files used this name
  params_default?: Record<string, any> | null; // canonical name we store
  docs_url?: string;
  details?: string;
};

function toDateOrNull(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function normalize(js: JsonScript) {
  // unify default params key
  const params_default = js.params_default ?? js.default_params ?? {};

  // normalize required_params to concise keys (e.g., anything containing "url" -> "url")
  const params_required = (js.required_params ?? []).map((s) => {
    const k = String(s).trim().toLowerCase();
    if (k.includes("url")) return "url";
    return s;
  });

  // ensure tags is an array
  const tags = Array.isArray(js.tags) ? js.tags : [];

  // coerce types
  const profile_id = js.profile_id != null ? String(js.profile_id) : null;
  const soft_id = js.soft_id != null ? String(js.soft_id) : null;

  return {
    id: js.id,
    name: js.name,
    target: js.target,
    summary: js.summary ?? null,
    language: js.language ?? null,
    // Drizzle column is `last_updated` (timestamp)
    last_updated: toDateOrNull(js.lastUpdated),
    confidence: js.confidence != null ? Number(js.confidence) : null,
    tags,
    token: js.token ?? null,
    device_id: js.device_id ?? null,
    profile_id,
    workflow_id: js.workflow_id ?? null,
    soft_id,
    params_default: params_default ?? {},
    params_required,
    docs_url: js.docs_url ?? null,
    details: js.details ?? null,
  };
}

function resolveJsonPath(argPath?: string) {
  if (argPath) return path.resolve(process.cwd(), argPath);
  // default: repoRoot/public/script.json (this file is backend/script/*)
  return path.resolve(__dirname, "../../public/script.json");
}

async function readJsonArray(filePath: string): Promise<JsonScript[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`JSON at ${filePath} is not an array`);
  }
  return parsed as JsonScript[];
}

async function upsertOne(
  db: any,
  scripts: any,
  row: ReturnType<typeof normalize>
) {
  // Prefer onConflict if available; fallback to manual check
  try {
    // @ts-ignore drizzle onConflictDoUpdate available on pg driver
    await db
      .insert(scripts)
      .values(row as any)
      .onConflictDoUpdate({ target: scripts.id, set: row as any });
    return { action: "UPSERT" as const };
  } catch (e: any) {
    // fallback path
    const existing = await db.select().from(scripts).where(eq(scripts.id, row.id));
    if (existing.length) {
      await db.update(scripts).set(row as any).where(eq(scripts.id, row.id));
      return { action: "UPDATE" as const };
    }
    await db.insert(scripts).values(row as any);
    return { action: "INSERT" as const };
  }
}

async function main() {
  const file = resolveJsonPath(process.argv[2]);
  console.log("[sync] using", file);

  const { db, scripts } = await loadDb();

  const items = await readJsonArray(file);
  let inserted = 0,
    updated = 0,
    upserted = 0;

  for (const js of items) {
    if (!js?.id || !js?.name) {
      console.warn("[skip] invalid item (missing id/name)", js);
      continue;
    }
    const row = normalize(js);
    const res = await upsertOne(db, scripts, row);
    if (res.action === "UPSERT") upserted++;
    else if (res.action === "UPDATE") updated++;
    else inserted++;
    console.log(`[sync] ${res.action}: ${row.id} (${row.name})`);
  }

  console.log("\n✅ sync done", { inserted, updated, upserted, total: items.length });
}

main().catch((err) => {
  console.error("[sync] failed:", err);
  process.exit(1);
});