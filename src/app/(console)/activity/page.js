import { Suspense } from "react";
import { ActivityScreen } from "@/components/AdminLists.js";
import { requireAdminPage } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  await requireAdminPage();
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading sessions…</p>}>
      <ActivityScreen />
    </Suspense>
  );
}
