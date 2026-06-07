"use client";
import { useRouter, usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { NavItem } from "./NavItem";
import { Bell, LogOut } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

const TEAM_NAV = [
  { id: "team", label: "Моя команда", icon: "team", count: 8, href: "/", disabled: false },
  { id: "calendar", label: "Календарь", icon: "calendar", href: "/calendar", disabled: false },
  { id: "grades", label: "Грейды", icon: "layers", disabled: true },
  { id: "fields", label: "Конструктор полей", icon: "fields", disabled: true },
  { id: "export", label: "Экспорт", icon: "download", disabled: true },
] as const;

const ADMIN_NAV = [
  { id: "admin-team", label: "Команды", icon: "team", disabled: true },
  { id: "admin-leads", label: "Лиды", icon: "user", disabled: true },
  { id: "admin-settings", label: "Настройки", icon: "settings", disabled: true },
] as const;

export function Sidebar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const pathname = usePathname();

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
        <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Команда</div>
        {TEAM_NAV.map((n) => {
          const href = "href" in n ? n.href : undefined;
          const active = href
            ? href === "/"
              ? pathname === "/"
              : pathname.startsWith(href)
            : false;
          return (
            <NavItem key={n.id} label={n.label} icon={n.icon} count={"count" in n ? n.count : undefined} active={active} disabled={n.disabled} href={href} />
          );
        })}
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Администрирование</div>
        {ADMIN_NAV.map((n) => (
          <NavItem key={n.id} label={n.label} icon={n.icon} disabled={n.disabled} />
        ))}
      </div>

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
