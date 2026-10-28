"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  FileArchive,
  Images,
  Menu as MenuIcon,
  Newspaper,
  FileBarChart2,
  FileText,
  HandHeart,
  Image as ImageIcon,
  Inbox,
  HandCoins,
  History,
  IndianRupee,
  LayoutDashboard,
  Mail,
  Palette,
  Search,
  Sparkles,
  UserCircle,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { AdminNavGroup } from "./AdminShell";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  donations: HandCoins,
  donors: UsersRound,
  reports: FileBarChart2,
  organization: Building2,
  seo: Search,
  payments: IndianRupee,
  email: Mail,
  appearance: Palette,
  users: Users,
  audit: History,
  account: UserCircle,
  pages: FileText,
  causes: HandHeart,
  media: ImageIcon,
  events: CalendarDays,
  news: Newspaper,
  gallery: Images,
  documents: FileArchive,
  menus: MenuIcon,
  sample: Sparkles,
  messages: Inbox,
};

/**
 * Grouped admin sidebar; marks the current section with aria-current. An entry with sub-pages
 * (Pages) has a chevron button that shows or hides them: open while you're inside it, closed
 * elsewhere, until you choose (the choice holds while you move around the admin).
 */
export function AdminNavLinks({ groups, onNavigate }: { groups: AdminNavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const all = groups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]));
  const current = [...all]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.key;
  return (
    <div className="grid gap-6">
      {groups.map((group) => (
        <div key={group.label} className="grid gap-1">
          <p className="m-0 px-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            {group.label}
          </p>
          <ul className="m-0 grid list-none gap-0.5 p-0">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon] ?? LayoutDashboard;
              const inside = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const open = chosen[item.key] ?? inside;
              const listId = `admin-nav-${item.key}`;
              return (
                <li key={item.key}>
                  <div className="flex items-center gap-1">
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={item.key === current ? "page" : undefined}
                      className="flex min-h-10 flex-1 items-center gap-3 rounded-md px-3 text-sm font-medium text-fg-default no-underline hover:bg-bg-subtle hover:text-fg-strong aria-[current=page]:bg-bg-brand-subtle aria-[current=page]:text-fg-brand"
                    >
                      <Icon aria-hidden="true" className="size-4 flex-none" strokeWidth={2} />
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? (
                        <span className="rounded-full bg-bg-brand px-2 text-xs font-semibold text-fg-on-brand">
                          {item.badge}
                          <span className="sr-only"> new</span>
                        </span>
                      ) : null}
                    </Link>
                    {item.children ? (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={listId}
                        aria-label={`${item.label}: ${open ? "hide" : "show"} the list`}
                        onClick={() => setChosen((c) => ({ ...c, [item.key]: !open }))}
                        className="grid size-10 flex-none place-items-center rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg-strong"
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={`size-4 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                          strokeWidth={2}
                        />
                      </button>
                    ) : null}
                  </div>
                  {item.children ? (
                    <ul
                      id={listId}
                      hidden={!open}
                      className="m-0 ml-7 grid list-none gap-0.5 border-l border-border-decorative p-0 pl-2"
                    >
                      {item.children.map((c) => (
                        <li key={c.key}>
                          <Link
                            href={c.href}
                            onClick={onNavigate}
                            aria-current={c.key === current ? "page" : undefined}
                            className="flex min-h-8 items-center rounded-md px-2 text-sm text-fg-muted no-underline hover:bg-bg-subtle hover:text-fg-strong aria-[current=page]:bg-bg-brand-subtle aria-[current=page]:text-fg-brand"
                          >
                            {c.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
