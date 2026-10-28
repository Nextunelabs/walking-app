import { Suspense } from "react";
import { ParticipantsScreen } from "@/components/AdminLists.js";
import { requireAdminPage } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function ParticipantsPage() {
  await requireAdminPage();
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading participants…</p>}>
      <ParticipantsScreen />
    </Suspense>
  );
}
