import { LoginForm } from "@/components/LoginForm.js";
import { getCurrentUser } from "@/lib/guards.js";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let databaseError = false;
  try {
    const user = await getCurrentUser();
    if (user) redirect("/dashboard");
  } catch (error) {
    if (error?.digest?.startsWith?.("NEXT_REDIRECT")) throw error;
    databaseError = true;
  }
  return <LoginForm databaseError={databaseError} />;
}
