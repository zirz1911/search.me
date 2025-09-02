import "dotenv/config";
import express from "express";
import cors from "cors";
import { db } from "../db";
import { scripts } from "../db/schema";
import { eq } from "drizzle-orm";
import fetch from "node-fetch";

function mask(val?: string | null, keepStart = 4, keepEnd = 2) {
  if (!val) return null;
  const s = String(val);
  if (s.length <= keepStart + keepEnd) return "*".repeat(s.length);
  return s.slice(0, keepStart) + "…" + s.slice(-keepEnd);
}

function toFormParams(obj: any, prefix = "", out?: URLSearchParams): URLSearchParams {
  const params = out || new URLSearchParams();
  if (obj == null) return params;
  Object.entries(obj).forEach(([key, val]) => {
    const k = prefix ? `${prefix}[${key}]` : key;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      toFormParams(val, k, params);
    } else if (Array.isArray(val)) {
      val.forEach((v) => params.append(`${k}[]`, String(v)));
    } else {
      params.append(k, String(val));
    }
  });
  return params;
}

function pickEncoding(req: express.Request): "json" | "form" {
  const q = String(req.query?.encoding ?? "").toLowerCase();
  if (q === "form") return "form";
  if ((process.env.GEMLOGIN_ENCODING || "").toLowerCase() === "form") return "form";
  return "json";
}

function buildUpstreamBody(src: any, req: express.Request) {
  const b: any = { ...(src || {}) };
  if (!b.parameter || typeof b.parameter !== "object") b.parameter = {};
  // Allow passing url via query (?url=...)
  if (!b.parameter.url && typeof req.query.url === "string") {
    b.parameter.url = String(req.query.url);
  }
  // Env overrides (handy while debugging or to ensure consistent identity)
  if (process.env.GEMLOGIN_TOKEN)       b.token       = process.env.GEMLOGIN_TOKEN;
  if (process.env.GEMLOGIN_DEVICE_ID)   b.device_id   = process.env.GEMLOGIN_DEVICE_ID;
  if (process.env.GEMLOGIN_PROFILE_ID)  b.profile_id  = process.env.GEMLOGIN_PROFILE_ID;
  if (process.env.GEMLOGIN_WORKFLOW_ID) b.workflow_id = process.env.GEMLOGIN_WORKFLOW_ID;
  if (process.env.GEMLOGIN_SOFT_ID)     b.soft_id     = process.env.GEMLOGIN_SOFT_ID;
  // Default soft id if still empty
  if (!b.soft_id) b.soft_id = "1";
  return b;
}

// ---------- N8N helpers ----------
function pickN8nWebhookFromParams(pd: any, stage: string): string | null {
  if (!pd) return null;
  // preferred nested: params_default.n8n.webhook.dev/prod
  const nested = pd?.n8n?.webhook?.[stage];
  if (nested && typeof nested === "string") return nested;

  // alt: params_default.webhook.dev/prod
  const directNested = pd?.webhook?.[stage];
  if (directNested && typeof directNested === "string") return directNested;

  // flat fallbacks
  const flatN8n = pd?.n8n_webhook;
  if (flatN8n && typeof flatN8n === "string") return flatN8n;

  const flatGeneric = pd?.webhook_url || pd?.webhookUrl || pd?.webhook;
  if (flatGeneric && typeof flatGeneric === "string") return flatGeneric;

  return null;
}

function getN8nTimeout(): number {
  const v = Number(process.env.N8N_TIMEOUT_MS || 0);
  return Number.isFinite(v) && v > 0 ? v : 25_000; // default 25s
}

const app = express();
app.use(cors({ origin: ['http://localhost:5173'], credentials: false }));
app.use(express.json());

// Optional proxy key for protecting /proxy/* endpoints
const PROXY_KEY = process.env.PROXY_KEY || process.env.X_PROXY_KEY || "";

// Enforce x-proxy-key when configured
app.use((req, res, next) => {
  if (req.path.startsWith("/proxy/") && PROXY_KEY) {
    const clientKey = req.get("x-proxy-key") || "";
    if (clientKey !== PROXY_KEY) {
      console.warn(
        `[Proxy] 401 Unauthorized: bad x-proxy-key from ${req.ip}. got=${mask(clientKey)} expected=${mask(PROXY_KEY)}`
      );
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
  }
  next();
});

// Dev-only: check env values loaded by this process (remove before production)
app.get("/__env-check", (req, res) => {
  res.json({
    node_env: process.env.NODE_ENV || null,
    gemlogin: {
      url: process.env.GEMLOGIN_URL || null,
      base: process.env.GEMLOGIN_BASE || null,
      paths: process.env.GEMLOGIN_PATHS || null,
      bearer_set: Boolean(process.env.GEMLOGIN_BEARER || ""),
      bearer_preview: mask(process.env.GEMLOGIN_BEARER || ""),
    },
    now: new Date().toISOString(),
    pid: process.pid,
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Get all scripts
app.get("/scripts", async (_req, res) => {
    console.log("HIT /scripts"); // <- เพิ่ม
    try {
      const all = await db.select().from(scripts);
      res.json(all);
    } catch (err) {
        console.error("GET /scripts error:");
        console.dir(err, { depth: null });                    // ทั้ง object
        console.error("CAUSE:", (err as any)?.cause);         // ข้อความจริงจาก pg
        console.error("CAUSE message:", (err as any)?.cause?.message);
        res.status(500).json({ error: "Failed to fetch scripts" });
      }
  });
  
  // Get script by ID
  app.get("/scripts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const script = await db.select().from(scripts).where(eq(scripts.id, id));
      res.json(script[0] || null);
    } catch (err) {
        console.error("GET /scripts error:");
        console.dir(err, { depth: null });                    // ทั้ง object
        console.error("CAUSE:", (err as any)?.cause);         // ข้อความจริงจาก pg
        console.error("CAUSE message:", (err as any)?.cause?.message);
        res.status(500).json({ error: "Failed to fetch scripts" });
      }
  });

// Proxy -> Gemlogin (avoid CORS & hide secret) with fallback probing
app.post("/proxy/gemlogin", async (req, res) => {
  try {
    const primaryUrl = process.env.GEMLOGIN_URL || "https://app.gemlogin.io/api/v2/execscript";

    // Derive base from primaryUrl if possible, otherwise from GEMLOGIN_BASE or default
    const base = (() => {
      try { return new URL(primaryUrl).origin; } catch { /* ignore */ }
      return process.env.GEMLOGIN_BASE || "https://app.gemlogin.io";
    })();

    const fallbackList = (process.env.GEMLOGIN_PATHS ||
      "/api/v2/execscript,/api/execscript,/api/v1/execscript,/execscript," +
      "/api/v2/exescript,/api/exescript,/api/v1/exescript,/exescript," +
      "/api/v2/exeScript,/api/exeScript,/api/v1/exeScript,/exeScript")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const tryUrls = Array.from(new Set([
      primaryUrl,
      ...fallbackList.map(p => {
        try { return new URL(p, base).toString(); } catch { return ""; }
      }).filter(Boolean),
    ]));

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (process.env.GEMLOGIN_BEARER) {
      headers["authorization"] = `Bearer ${process.env.GEMLOGIN_BEARER}`;
    }

    const mergedBody = buildUpstreamBody(req.body, req);
    console.log("[Gemlogin proxy] effective body ids", {
      device_id: mergedBody?.device_id,
      profile_id: mergedBody?.profile_id,
      workflow_id: mergedBody?.workflow_id,
      soft_id: mergedBody?.soft_id,
      has_url: Boolean(mergedBody?.parameter?.url),
    });

    const preview = {
      device_id: mergedBody?.device_id,
      profile_id: mergedBody?.profile_id,
      workflow_id: mergedBody?.workflow_id,
      soft_id: mergedBody?.soft_id,
      parameter: mergedBody?.parameter,
      token_preview: mask(mergedBody?.token),
    };
    console.log("[Gemlogin proxy] payload =", JSON.stringify(preview));
    // Debug: show which URLs will be tried
    console.log("[Gemlogin proxy] try order =", tryUrls);

    let last404: { url: string; status: number; body: string; ct: string } | null = null;
    for (const url of tryUrls) {
      const encoding = pickEncoding(req);
      let bodyToSend: any;
      if (encoding === "form") {
        bodyToSend = toFormParams(mergedBody);
        headers["content-type"] = "application/x-www-form-urlencoded";
      } else {
        bodyToSend = JSON.stringify(mergedBody ?? {});
        headers["content-type"] = "application/json";
      }

      // Add a 25s timeout so we don't hang forever
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 25_000);

      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: bodyToSend,
        redirect: "manual",
        signal: controller.signal,
      }).finally(() => clearTimeout(t));

      const contentType = resp.headers.get("content-type") || "";
      const location = resp.headers.get("location") || "";
      console.log("[Gemlogin proxy] status=", resp.status, url, "ct=", contentType, location ? `loc=${location}` : "");

      // If redirect, forward immediately so client sees the real behavior
      if (resp.status >= 300 && resp.status < 400) {
        if (location) res.setHeader("location", location);
        res.setHeader("x-gemlogin-matched", url);
        return res.status(resp.status).json({
          message: "Upstream redirect",
          location,
          hint: "ถ้า location ชี้ไปหน้า login/portal ให้ตรวจ token, URL หรือ header ที่จำเป็น",
        });
      }

      const raw = await resp.text();

      // If upstream returned 401, log details and pass through so FE sees exact message
      if (resp.status === 401) {
        console.warn("[Gemlogin proxy] 401 Unauthorized from upstream", {
          matched: url,
          contentType,
          snippet: raw.slice(0, 400),
        });
        res.setHeader("x-gemlogin-matched", url);
        if (!contentType.includes("json")) {
          return res.status(resp.status).json({
            success: false,
            message: "Unauthorized",
            upstream: { url, status: resp.status, body: raw.slice(0, 400) },
          });
        }
        return res.status(resp.status).type(contentType || "application/json").send(raw);
      }

      // For other client/server errors (>=400 but not 404), log a short snippet too
      if (resp.status >= 400 && resp.status !== 404) {
        console.warn("[Gemlogin proxy] upstream error", {
          status: resp.status,
          matched: url,
          contentType,
          snippet: raw.slice(0, 400),
        });
        res.setHeader("x-gemlogin-matched", url);
        if (!contentType.includes("json")) {
          return res.status(resp.status).type("text/plain; charset=utf-8").send(raw);
        }
        return res.status(resp.status).type(contentType || "application/json").send(raw);
      }

      // If not 404, consider it a match and forward
      if (resp.status !== 404) {
        res.setHeader("x-gemlogin-matched", url);
        if (!contentType.includes("json")) {
          return res.status(resp.status).type("text/plain; charset=utf-8").send(raw);
        }
        return res.status(resp.status).type(contentType || "application/json").send(raw);
      }

      // remember last 404
      last404 = { url, status: resp.status, body: raw, ct: contentType };
    }

    // All tried returned 404
    const tried = tryUrls;
    return res.status(404).json({
      message: "All candidate Gemlogin routes returned 404",
      tried,
      last404,
    });
  } catch (err: any) {
    console.error("[Gemlogin proxy] error:", err);
    return res.status(500).json({ message: "proxy error", error: String(err?.message || err) });
  }
});

// Proxy -> n8n (choose webhook per script from DB, avoid exposing URL to FE)
app.post("/proxy/n8n", async (req, res) => {
  try {
    const { scriptId, params, userText, meta } = req.body || {};
    if (!scriptId) return res.status(400).json({ success: false, message: "scriptId required" });

    // 1) Load script from DB
    const rows = await db.select().from(scripts).where(eq(scripts.id, scriptId));
    const script = rows?.[0];
    if (!script) return res.status(404).json({ success: false, message: "script not found" });
    if (String(script.target) !== "n8n") {
      return res.status(400).json({ success: false, message: "script is not n8n target" });
    }

    // 2) Decide webhook URL
    const stage = (process.env.N8N_STAGE || "prod").toLowerCase(); // 'dev' | 'prod'
    const rawPd: any = (script as any).params_default;
    let pd: any = {};
    try {
      pd = typeof rawPd === "string" ? JSON.parse(rawPd) : (rawPd || {});
    } catch {
      pd = {};
    }

    // Override resolution and improved logging
    const overrideUrl =
      (params && (params.webhook_url || params.n8n_webhook)) ||
      (typeof (req.query?.webhook) === "string" ? String(req.query.webhook) : null) ||
      null;

    const fromParams = pickN8nWebhookFromParams(pd, stage);
    const selected = overrideUrl || fromParams || process.env.N8N_WEBHOOK_URL || "";

    console.log("[n8n proxy] webhook select", {
      stage,
      override: Boolean(overrideUrl),
      fromParams: Boolean(fromParams),
      fromEnv: Boolean(process.env.N8N_WEBHOOK_URL),
      selected: selected ? "***" : "(none)",
    });

    if (!selected) {
      return res.status(500).json({ success: false, message: "n8n webhook url not configured for this script" });
    }

    // 3) Headers (global or per-script)
    const headers: Record<string, string> = { "content-type": "application/json" };
    // per-script apiKey overrides global
    const perScriptKey = pd?.n8n?.apiKey || pd?.n8n_api_key || null;
    const apiKey = perScriptKey || process.env.N8N_API_KEY || "";
    if (apiKey) headers["x-api-key"] = apiKey;

    // Optional HMAC signing (per-script first, then global)
    const secret = pd?.n8n?.secret || process.env.N8N_SHARED_SECRET || "";
    const payload = { scriptId, params: params || {}, userText: userText ?? "", meta: meta || {} };
    if (secret) {
      const { createHmac } = await import("node:crypto");
      const ts = Date.now().toString();
      const bodyStr = JSON.stringify({ ...payload, ts });
      const sig = createHmac("sha256", secret).update(bodyStr).digest("hex");
      headers["x-ts"] = ts;
      headers["x-sig"] = sig;
    }

    // 4) Call n8n with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getN8nTimeout());

    console.log("[n8n proxy] POST", selected, {
      id: scriptId,
      stage,
      hasApiKey: Boolean(apiKey),
      hasSecret: Boolean(secret),
    });

    const resp = await fetch(selected, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const ct = resp.headers.get("content-type") || "";
    const text = await resp.text();

    if (!resp.ok) {
      console.warn("[n8n proxy] upstream error", { status: resp.status, ct, snippet: text.slice(0, 400) });
      // pass-through error to FE for transparency
      if (!ct.includes("json")) return res.status(resp.status).type("text/plain; charset=utf-8").send(text);
      return res.status(resp.status).type(ct).send(text);
    }

    if (!ct.includes("json")) return res.type("text/plain; charset=utf-8").send(text);
    return res.type(ct).send(text);
  } catch (err: any) {
    console.error("[n8n proxy] error:", err?.message || err);
    return res.status(500).json({ success: false, message: "proxy error", error: String(err?.message || err) });
  }
});

console.log("[ENV] GEMLOGIN_URL    =", process.env.GEMLOGIN_URL || "(unset)");
console.log("[ENV] GEMLOGIN_BASE   =", process.env.GEMLOGIN_BASE || "(unset)");
console.log("[ENV] GEMLOGIN_PATHS  =", process.env.GEMLOGIN_PATHS || "(unset)");
console.log("[ENV] BEARER(set?)    =", Boolean(process.env.GEMLOGIN_BEARER));
console.log("[ENV] PROXY_KEY(set?) =", Boolean(PROXY_KEY));
console.log("[ENV] N8N_STAGE       =", process.env.N8N_STAGE || "(unset)\n" );
console.log("[ENV] N8N_API_KEY(set?) =", Boolean(process.env.N8N_API_KEY));
console.log("[ENV] N8N_SHARED_SECRET(set?) =", Boolean(process.env.N8N_SHARED_SECRET));
console.log("[ENV] N8N_WEBHOOK_URL =", process.env.N8N_WEBHOOK_URL || "(unset)");
console.log("[ENV] N8N_TIMEOUT_MS  =", process.env.N8N_TIMEOUT_MS || "(default 25000)");

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API server running at http://localhost:${PORT}`);
});


app.get("/", (_req, res) => {
    res.json({
      service: "Gem Search API",
      version: "0.1.0",
      endpoints: [
        "/health",
        "/scripts",
        "/scripts/:id",
        "/proxy/gemlogin",
        "/proxy/n8n",
        "/__env-check",
      ],
    });
  });