import React from "react";
import Link from "next/link";
import { Users, Calendar, Layers, SlidersHorizontal, Download, User, Settings, ClipboardCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  team: Users,
  calendar: Calendar,
  layers: Layers,
  fields: SlidersHorizontal,
  download: Download,
  user: User,
  settings: Settings,
  approvals: ClipboardCheck,
};

export function NavItem({
  label,
  icon,
  count,
  active = false,
  disabled = false,
  href,
  trailing,
}: {
  label: string;
  icon: keyof typeof ICONS | string;
  count?: number;
  active?: boolean;
  disabled?: boolean;
  href?: string;
  trailing?: React.ReactNode;
}) {
  const Icon = ICONS[icon] ?? Users;
  const inner = (
    <>
      <Icon size={16} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {count != null && <span className="tabular text-ink-3 text-xs">{count}</span>}
      {trailing}
    </>
  );

  const className = cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium cursor-default select-none",
    active ? "bg-brand-soft text-brand-text" : "text-ink-2 hover:bg-bg-tint",
    disabled && "opacity-45",
  );

  if (href && !disabled) {
    return (
      <Link
        href={href}
        data-nav-item
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      data-nav-item
      aria-current={active ? "page" : undefined}
      aria-disabled={disabled || undefined}
      className={className}
    >
      {inner}
    </div>
  );
}
