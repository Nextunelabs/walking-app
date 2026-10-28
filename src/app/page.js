import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }
  redirect(user ? "/dashboard" : "/login");
}
