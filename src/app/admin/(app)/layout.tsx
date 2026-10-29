import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { adminNav } from "@/lib/admin/nav";
import { can, ROLE_LABELS } from "@/lib/admin/permissions";
import { newMessageCount } from "@/lib/admin/messages";
import { initials } from "@/lib/initials";
import { AdminShell } from "@/components/layout/AdminShell";
import { logoutAction } from "../(auth)/actions";

// Everything below requires a signed-in admin; each page also checks its own capability.
export default async function AdminAppLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  const newMessages = can(admin.role, "messages.read") ? await newMessageCount() : 0;
  return (
    <AdminShell
      nav={adminNav(admin.role, { newMessages })}
      account={
        <div className="flex items-center gap-3 rounded-lg border border-border-decorative p-3">
          <span
            aria-hidden="true"
            className="grid size-9 flex-none place-items-center rounded-full bg-bg-brand-subtle text-sm font-semibold text-fg-brand"
          >
            {initials(admin.name) || "?"}
          </span>
          <div className="grid min-w-0 flex-1 text-sm">
            <span className="truncate font-semibold text-fg-strong">{admin.name}</span>
            <span className="truncate text-xs text-fg-muted">{ROLE_LABELS[admin.role]}</span>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg-strong"
            >
              <LogOut aria-hidden="true" className="size-4" />
              <span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      }
    >
      {children}
    </AdminShell>
  );
}
