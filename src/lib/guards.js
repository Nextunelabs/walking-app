import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "./session.js";
import { findUserById } from "./repos/users.js";

export async function getCurrentUser() {
  const session = await getSessionFromCookies();
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user || !user.isActive) return null;
  return user;
}

export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminPage() {
  const user = await requirePageUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }
  return { ok: true, user };
}

export async function requireApiAdmin() {
  const result = await requireApiUser();
  if (!result.ok) return result;
  if (result.user.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Administrator access required" }, { status: 403 }),
    };
  }
  return result;
}
