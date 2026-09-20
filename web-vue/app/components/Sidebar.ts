export type Nav = {
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

export const ADMIN_NAV: { id: string; label: string; icon: string; href?: string; disabled?: boolean }[] = [
  { id: "admin-team", label: "Команды", icon: "team", href: "/admin/teams" },
  { id: "admin-leads", label: "Лиды", icon: "user", disabled: true },
  { id: "admin-settings", label: "Настройки", icon: "settings", disabled: true },
];

export function visibleNavItems(permissions: string[]): Nav[] {
  return NAV.filter((n) => n.requires === null || permissions.includes(n.requires));
}
