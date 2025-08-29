import "dotenv/config";
import express from "express";
import cors from "cors";
import { db } from "../db";
import { scripts } from "../db/schema";
import { eq } from "drizzle-orm";

const app = express();
app.use(cors());
app.use(express.json());

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API server running at http://localhost:${PORT}`);
});


app.get("/", (_req, res) => {
    res.json({
      service: "Gem Search API",
      version: "0.1.0",
      endpoints: ["/health", "/scripts", "/scripts/:id"],
    });
  });

  