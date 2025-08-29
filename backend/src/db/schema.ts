import { pgTable, text, jsonb, real, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const targetEnum = pgEnum("target", ["gemlogin", "gemphonefarm", "n8n"]);

export const scripts = pgTable("scripts", {
  // ใช้ id แบบ "S-001"
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  target: targetEnum("target").notNull(),
  summary: text("summary").notNull(),
  language: text("language"),

  // เก็บ tag เป็น jsonb string[]
  tags: jsonb("tags").$type<string[]>().default([]),

  confidence: real("confidence"),
  lastUpdated: timestamp("last_updated"),

  // parameters (ใช้ชื่อคีย์เดียวกันทั้งระบบ)
  params_required: jsonb("params_required"), // ex: ["url"]
  params_default: jsonb("params_default"),   // ex: { "url": "" }

  // *** secrets ฝั่ง server เท่านั้น (อย่าส่งไป FE) ***
  token: text("token"),
  device_id: text("device_id"),
  profile_id: text("profile_id"),
  workflow_id: text("workflow_id"),

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});