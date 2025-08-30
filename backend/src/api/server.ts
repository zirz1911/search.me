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

const app = express();
app.use(cors({ origin: ['http://localhost:5173'], credentials: false }));
app.use(express.json());

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
      "/api/v2/exescript,/api/execscript,/api/v1/execscript,/execscript," +
      "/api/v2/exeScript,/api/execScript,/api/v1/execScript,/execScript")
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

    let last404: { url: string; status: number; body: string; ct: string } | null = null;

    for (const url of tryUrls) {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(req.body ?? {}),
        redirect: "manual",
      });

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
    });
  } catch (err: any) {
    console.error("[Gemlogin proxy] error:", err);
    return res.status(500).json({ message: "proxy error", error: String(err?.message || err) });
  }
});

console.log("[ENV] GEMLOGIN_URL    =", process.env.GEMLOGIN_URL || "(unset)");
console.log("[ENV] GEMLOGIN_BASE   =", process.env.GEMLOGIN_BASE || "(unset)");
console.log("[ENV] GEMLOGIN_PATHS  =", process.env.GEMLOGIN_PATHS || "(unset)");
console.log("[ENV] BEARER(set?)    =", Boolean(process.env.GEMLOGIN_BEARER));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API server running at http://localhost:${PORT}`);
});


app.get("/", (_req, res) => {
    res.json({
      service: "Gem Search API",
      version: "0.1.0",
      endpoints: ["/health", "/scripts", "/scripts/:id", "/proxy/gemlogin", "/__env-check"],
    });
  });