import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema'; // ใช้ ts-node (CJS) ไม่ต้องใส่ .js

// อ่านและแยก DATABASE_URL เป็นฟิลด์ เพื่อให้ password เป็น string แน่นอน
const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  throw new Error('DATABASE_URL is not set');
}
const url = new URL(rawUrl);

const pool = new Pool({
  host: url.hostname,
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password), // ✅ กันปัญหา "Client password must be a string"
  database: decodeURIComponent(url.pathname.slice(1)),
  // ssl: false, // ถ้าใช้ cloud ที่ต้อง SSL ค่อยเปิด
});

// Log ช่วยดีบัก (ปลอดภัย — ไม่พิมพ์รหัสผ่าน)
console.log('PG config ->', {
  host: pool.options.host,
  port: pool.options.port,
  user: pool.options.user,
  database: pool.options.database,
});

export const db = drizzle(pool, { schema, logger: true });
