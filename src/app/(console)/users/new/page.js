import { UserForm } from "@/components/UsersScreens.js";
import { requireAdminPage } from "@/lib/guards.js";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requireAdminPage();
  return <UserForm />;
}
