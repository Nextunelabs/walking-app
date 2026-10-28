import { AdminDashboard } from "@/components/Dashboards.js";
import { ParticipantDashboard } from "@/components/Dashboards.js";
import { requirePageUser } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();
  return user.role === "admin" ? <AdminDashboard /> : <ParticipantDashboard />;
}
