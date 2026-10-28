import { AppShell } from "@/components/AppShell.js";
import { requirePageUser } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }) {
  const user = await requirePageUser();
  return (
    <AppShell
      user={{
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
