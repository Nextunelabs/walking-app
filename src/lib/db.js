import { neon } from "@neondatabase/serverless";
import pg, { Pool } from "pg";

// Keep DATE columns as YYYY-MM-DD strings so time zones cannot shift the calendar day.
pg.types.setTypeParser(1082, (value) => value);

let sqlClient;
let pool;

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

/** Tagged-template Neon client, matching the VMS connection pattern. */
export function getSql() {
  if (!sqlClient) {
    sqlClient = neon(connectionString());
  }
  return sqlClient;
}

export function getPool() {
  if (!pool) {
    const url = connectionString();
    pool = new Pool({
      connectionString: url,
      max: 10,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* The original error is the one to report. */
    }
    throw error;
  } finally {
    client.release();
  }
}
