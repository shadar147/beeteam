"use client";
import { useRouter, usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { NavItem } from "./NavItem";
import { Bell, LogOut } from "lucide-react";
import { hasPermission, type SessionUser } from "@/lib/auth";
import { usePendingReviews } from "@/lib/query/approvals";

type Nav = {
  id: string;
  label: string;
  icon: string;
  href?: string;
  count?: number;
  disabled?: boolean;
  requires: string | null; // permission, or null = visible to everyone
};

const NAV: Nav[] = [
  { id: "team", label: "Моя команда", icon: "team", count: 8, href: "/", requires: "manage_team" },
  { id: "calendar", label: "Календарь", icon: "calendar", href: "/calendar", requires: "manage_team" },
  { id: "grades", label: "Грейды", icon: "layers", href: "/grades", requires: null },
  { id: "approvals", label: "Согласование", icon: "approvals", href: "/approvals", requires: "approve_reviews" },
  { id: "fields", label: "Конструктор полей", icon: "fields", disabled: true, requires: "manage_team" },
  { id: "export", label: "Экспорт", icon: "download", disabled: true, requires: "manage_team" },
];

const ADMIN_NAV = [
  { id: "admin-team", label: "Команды", icon: "team", disabled: true },
  { id: "admin-leads", label: "Лиды", icon: "user", disabled: true },
  { id: "admin-settings", label: "Настройки", icon: "settings", disabled: true },
] as const;

export function visibleNavItems(permissions: string[]): Nav[] {
  return NAV.filter((n) => n.requires === null || permissions.includes(n.requires));
}

function ApprovalsCount() {
  const pending = usePendingReviews();
  const n = pending.data?.length ?? 0;
  if (n === 0) return null;
  return <span className="tabular text-ink-3 text-xs">{n}</span>;
}

export function Sidebar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = visibleNavItems(user.permissions);
  const isHr = hasPermission(user, "approve_reviews");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-4 border-r border-line bg-bg-elev p-4">
      <div className="flex items-center justify-between px-1.5">
        <Logo className="text-[15px]" />
        <button className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint" title="Уведомления">
          <Bell size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">
          {isHr ? "HR" : "Команда"}
        </div>
        {items.map((n) => {
          const active = n.href
            ? n.href === "/"
              ? pathname === "/"
              : pathname.startsWith(n.href)
            : false;
          return (
            <NavItem
              key={n.id}
              label={n.label}
              icon={n.icon}
              count={n.count}
              active={active}
              disabled={n.disabled ?? false}
              href={n.href}
              trailing={n.id === "approvals" ? <ApprovalsCount /> : undefined}
            />
          );
        })}
      </div>

      {!isHr && (
        <div className="flex flex-col gap-0.5">
          <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Администрирование</div>
          {ADMIN_NAV.map((n) => (
            <NavItem key={n.id} label={n.label} icon={n.icon} disabled={n.disabled} />
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2.5 rounded-md border border-line bg-bg-elev p-2.5">
        <Avatar name={user.name} hue={42} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight">{user.name}</div>
          <div className="text-[11.5px] text-ink-3">{user.role}</div>
        </div>
        <button onClick={logout} className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint" title="Выйти" aria-label="Выйти">
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
