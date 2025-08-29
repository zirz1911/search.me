import "dotenv/config";
import { db } from "./index";
import { scripts } from "./schema";

async function upsertScript(s: any) {
  try {
    await db.insert(scripts).values(s);
  } catch (e: any) {
    // ถ้ามีแล้ว (PK ซ้ำ) จะ error — ข้ามไป
    if (!String(e?.message || "").includes("duplicate key")) throw e;
  }
}

async function main() {
  const data = [
    {
      id: "S-001",
      name: "Youtube View",
      target: "gemlogin",
      summary: "ปั่นยอดวิว Youtube ตามลิงก์ที่กำหนด",
      language: "json",
      tags: ["watch", "view", "youtube"],
      confidence: 0.92,
      lastUpdated: new Date("2025-08-01"),
      params_required: ["url"],
      params_default: { url: "" },
      token: "aFPfO08a7Awfr...TSPAJg",
      device_id: "657F210AF8D89403096BB6D13B5641FA",
      profile_id: "12",
      workflow_id: "MNmznbERRklEiSWNnPOfk",
    },
    {
      id: "S-004",
      name: "Proxy Healthcheck & Failover",
      target: "gemlogin",
      summary: "ตรวจสุขภาพ proxy ราย 5 นาที, auto-switch เมื่อ latency เกิน threshold.",
      language: "Go",
      tags: ["proxy", "healthcheck", "failover"],
      confidence: 0.84,
      lastUpdated: new Date("2025-07-30"),
      params_required: [],
      params_default: {},
      token: "aFPfO08a7Awfr...TSPAJg",
      device_id: "2D6F1F249424721ACC1733B67BFA2378",
      profile_id: "4",
      workflow_id: "vCGvkuenEcRCrrB3tMXjk",
    },
    {
      id: "S-003",
      name: "n8n: TikTok Affiliate Ingest → Classify Intent",
      target: "n8n",
      summary: "Webhook รับคำขอลูกค้า → LLM จัดหมวดหมู่ → ส่งต่อไปยัง connector ที่เหมาะสม.",
      language: "n8n workflow",
      tags: ["webhook", "routing", "tiktok"],
      confidence: 0.9,
      params_required: [],
      params_default: {},
    },
  ];

  for (const s of data) {
    await upsertScript(s);
  }
  console.log("✅ Seed done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});