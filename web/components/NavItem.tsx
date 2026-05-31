import { Users, Calendar, Layers, SlidersHorizontal, Download, User, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  team: Users,
  calendar: Calendar,
  layers: Layers,
  fields: SlidersHorizontal,
  download: Download,
  user: User,
  settings: Settings,
};

export function NavItem({
  label,
  icon,
  count,
  active = false,
  disabled = false,
}: {
  label: string;
  icon: keyof typeof ICONS | string;
  count?: number;
  active?: boolean;
  disabled?: boolean;
}) {
  const Icon = ICONS[icon] ?? Users;
  return (
    <div
      data-nav-item
      aria-current={active ? "page" : undefined}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium cursor-default select-none",
        active ? "bg-brand-soft text-brand-text" : "text-ink-2 hover:bg-bg-tint",
        disabled && "opacity-45",
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {count != null && <span className="tabular text-ink-3 text-xs">{count}</span>}
    </div>
  );
}
