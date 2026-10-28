import { query } from "@/lib/db.js";
import { jsonError, jsonOk } from "@/lib/http.js";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return jsonError("Database connection failed", 503);
  }
  try {
    const result = await query("SELECT current_database() AS name");
    return jsonOk({ ok: true, database: result.rows[0]?.name || "" });
  } catch (error) {
    console.error("Health check failed", error?.code || error?.message);
    return jsonError("Database connection failed", 503);
  }
}
