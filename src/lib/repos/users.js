import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db.js";
import { HttpError } from "../errors.js";
import { num } from "../format.js";

const ROLES = ["admin", "user"];

export const userWriteSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(120),
  email: z.string().trim().email("Enter a valid email address").max(200),
  mobileNumber: z
    .string()
    .trim()
    .max(20)
    .refine((value) => value === "" || /^[0-9+\-\s]{8,20}$/.test(value), "Enter a valid mobile number"),
  role: z.enum(ROLES),
  isActive: z.boolean(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200).optional(),
});

export const passwordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200)
    .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), "Use letters and numbers in the password"),
});

let dummyHashPromise;

function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = bcrypt.hash("walking-app-dummy", 12);
  return dummyHashPromise;
}

export function mapUser(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    mobileNumber: row.mobile_number || "",
    role: row.role,
    isActive: row.is_active === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const USER_COLUMNS = `
  user_id, full_name, email, mobile_number, role, is_active, created_at, updated_at
`;

export async function findUserByEmail(email) {
  const result = await query(
    `SELECT user_id, email, password_hash, full_name, mobile_number, role, is_active, created_at, updated_at
     FROM users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [String(email || "").trim()]
  );
  return result.rows[0] || null;
}

export async function findUserById(userId) {
  const result = await query(
    `SELECT ${USER_COLUMNS} FROM users WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return mapUser(result.rows[0]);
}

export async function verifyPassword(plain, storedHash) {
  const stored = String(storedHash || "");
  if (!stored.startsWith("$2")) {
    await bcrypt.compare(plain, await dummyHash());
    return false;
  }
  return bcrypt.compare(plain, stored);
}

export async function authenticate(email, password) {
  const row = await findUserByEmail(email);
  const hash = row?.password_hash || (await dummyHash());
  const matches = await bcrypt.compare(password, hash);
  if (!row || !matches) return { ok: false, reason: "invalid" };
  if (!row.is_active) return { ok: false, reason: "inactive" };
  return { ok: true, user: mapUser(row) };
}

export async function listUsers({ search = "", page = 1, limit = 20 }) {
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const offset = (currentPage - 1) * pageSize;
  const term = String(search || "").trim();
  const params = [];
  let where = "";
  if (term) {
    params.push(`%${term}%`);
    where = `WHERE full_name ILIKE $1 OR email ILIKE $1 OR COALESCE(mobile_number, '') ILIKE $1 OR role ILIKE $1`;
  }
  const count = await query(`SELECT COUNT(*)::int AS count FROM users ${where}`, params);
  const data = await query(
    `SELECT ${USER_COLUMNS}
     FROM users
     ${where}
     ORDER BY lower(full_name), lower(email)
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  const total = count.rows[0]?.count ?? 0;
  return {
    page: currentPage,
    pages: Math.max(Math.ceil(total / pageSize), 1),
    total,
    data: data.rows.map(mapUser),
  };
}

export async function createUser(input) {
  const passwordCheck = passwordSchema.safeParse({ password: input.password || "" });
  if (!passwordCheck.success) {
    throw new HttpError(400, passwordCheck.error.issues[0]?.message || "Password is required");
  }
  const passwordHash = await bcrypt.hash(passwordCheck.data.password, 12);
  try {
    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, mobile_number, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${USER_COLUMNS}`,
      [
        input.fullName,
        input.email.toLowerCase(),
        passwordHash,
        input.mobileNumber || null,
        input.role,
        input.isActive,
      ]
    );
    return mapUser(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "A user with this email already exists");
    throw error;
  }
}

export async function updateUser(userId, input, actor) {
  const existing = await findUserById(userId);
  if (!existing) throw new HttpError(404, "User not found");
  if (actor.userId === userId && input.isActive === false) {
    throw new HttpError(400, "You cannot deactivate your own account");
  }
  if (actor.userId === userId && input.role !== "admin") {
    throw new HttpError(400, "You cannot remove your own administrator role");
  }
  if (existing.role === "admin" && (input.role !== "admin" || input.isActive === false)) {
    const admins = await query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_active = true AND user_id <> $1`,
      [userId]
    );
    if ((admins.rows[0]?.count ?? 0) < 1) {
      throw new HttpError(400, "At least one active administrator is required");
    }
  }
  try {
    const result = await query(
      `UPDATE users
       SET full_name = $2, email = $3, mobile_number = $4, role = $5, is_active = $6
       WHERE user_id = $1
       RETURNING ${USER_COLUMNS}`,
      [userId, input.fullName, input.email.toLowerCase(), input.mobileNumber || null, input.role, input.isActive]
    );
    return mapUser(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "A user with this email already exists");
    throw error;
  }
}

export async function resetPassword(userId, password) {
  const existing = await findUserById(userId);
  if (!existing) throw new HttpError(404, "User not found");
  const passwordHash = await bcrypt.hash(password, 12);
  await query(`UPDATE users SET password_hash = $2 WHERE user_id = $1`, [userId, passwordHash]);
  return { ok: true };
}

export async function deleteUser(userId, actor) {
  if (actor.userId === userId) throw new HttpError(400, "You cannot delete your own account");
  const existing = await findUserById(userId);
  if (!existing) throw new HttpError(404, "User not found");
  const usage = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM walking_sessions WHERE user_id = $1) AS sessions,
       (SELECT COUNT(*)::int FROM challenge_participants WHERE user_id = $1) AS participants`,
    [userId]
  );
  if ((usage.rows[0]?.sessions ?? 0) > 0 || (usage.rows[0]?.participants ?? 0) > 0) {
    throw new HttpError(409, "This user has challenge activity. Deactivate the account instead of deleting it.");
  }
  if (existing.role === "admin") {
    const admins = await query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_active = true AND user_id <> $1`,
      [userId]
    );
    if ((admins.rows[0]?.count ?? 0) < 1) {
      throw new HttpError(400, "At least one active administrator is required");
    }
  }
  await query(`DELETE FROM users WHERE user_id = $1`, [userId]);
  return { ok: true };
}

export async function countUsers() {
  const result = await query(`SELECT COUNT(*)::int AS count FROM users`);
  return num(result.rows[0]?.count);
}
