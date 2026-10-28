import bcrypt from "bcryptjs";
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");
const fullName = String(process.env.ADMIN_FULL_NAME || "Administrator").trim();
const mobile = String(process.env.ADMIN_MOBILE || "").trim();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
if (!email || !email.includes("@")) {
  console.error("Set ADMIN_EMAIL in .env.local before seeding.");
  process.exit(1);
}
if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
  console.error("ADMIN_PASSWORD must be at least 10 characters and include letters and numbers.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false },
});
await client.connect();

const existing = await client.query("SELECT user_id FROM users WHERE lower(email) = $1", [email]);
if (existing.rowCount > 0) {
  if (process.env.ADMIN_RESET === "1") {
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query("UPDATE users SET password_hash = $2, role = 'admin', is_active = true WHERE user_id = $1", [
      existing.rows[0].user_id,
      passwordHash,
    ]);
    console.log("Updated the existing administrator password.");
  } else {
    console.log("Administrator already exists. Set ADMIN_RESET=1 to replace the password.");
  }
} else {
  const passwordHash = await bcrypt.hash(password, 12);
  await client.query(
    `INSERT INTO users (full_name, email, password_hash, mobile_number, role, is_active)
     VALUES ($1, $2, $3, $4, 'admin', true)`,
    [fullName, email, passwordHash, mobile || null]
  );
  console.log("Created the administrator account.");
}

await client.end();
console.log("Administrator email: " + email);
console.log("The password was read from ADMIN_PASSWORD and was not printed.");
