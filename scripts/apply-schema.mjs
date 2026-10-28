import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  process.exit(1);
}

const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
const sql = fs.readFileSync(path.join(process.cwd(), "sql", "001_schema.sql"), "utf8");
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? undefined : { rejectUnauthorized: false },
});

await client.connect();
const current = await client.query("SELECT current_database() AS name");
if (current.rows[0].name !== databaseName) {
  throw new Error("Refusing to apply the schema because the connected database name was unexpected.");
}
await client.query(sql);
console.log(`Schema applied to database ${current.rows[0].name}`);
await client.end();
