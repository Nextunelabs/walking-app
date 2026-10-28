"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Flag,
  LayoutDashboard,
  LogOut,
  Menu,
  Rocket,
  Trophy,
  Users,
  Footprints,
  X,
} from "lucide-react";

const adminItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/challenges", label: "Challenge Settings", icon: Flag },
  { href: "/participants", label: "Challenge Participants", icon: Users },
  { href: "/activity", label: "Walking Sessions", icon: Activity },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/my-walking", label: "My Walking", icon: Footprints },
  { href: "/publish", label: "Publish", icon: Rocket },
];

const userItems = [{ href: "/dashboard", label: "Dashboard", icon: Footprints }];

function isActive(pathname, href) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export function AppShell({ user, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = user.role === "admin" ? adminItems : userItems;
  const walking = pathname.startsWith("/walk/");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-svh max-h-svh w-full gap-3 overflow-hidden bg-background p-3 text-foreground">
      <aside
        className={`${open ? "flex" : "hidden"} absolute inset-3 z-30 w-[min(100%-1.5rem,16.25rem)] flex-col rounded-[20px] bg-sidebar p-3 text-sidebar-foreground shadow-[0_8px_24px_rgba(15,23,42,0.08)] md:static md:flex md:h-full md:w-[16.25rem] md:shrink-0 ${walking ? "md:hidden" : ""}`}
      >
        <div className="mb-4 flex items-center justify-between px-2">
          <div>
            <p className="text-sm font-semibold">Walking Challenge</p>
            <p className="text-xs text-muted-foreground">Kerala districts</p>
          </div>
          <button type="button" className="md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[15px] font-medium ${active ? "bg-neutral-200 text-neutral-900" : "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"}`}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={logout}
          className="mt-3 flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-left text-[15px] font-medium text-neutral-600 hover:bg-neutral-200"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Logout
        </button>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-card shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <button type="button" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 text-right md:ml-auto">
              <p className="truncate text-sm font-medium">{user.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email} · {user.role === "admin" ? "Administrator" : "Participant"}
              </p>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
            <div className={`mx-auto space-y-6 ${walking ? "max-w-5xl p-3 sm:p-4" : "p-4 md:p-6 lg:px-8 lg:py-6"}`}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
