import Link from "next/link";
import { ShieldOff } from "lucide-react";

export function NoAccess() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <ShieldOff size={28} className="text-ink-4" />
      <div className="text-[15px] font-semibold text-ink">Недостаточно прав</div>
      <p className="max-w-[360px] text-[12.5px] leading-relaxed text-ink-3">
        У вашей роли нет доступа к этому разделу.
      </p>
      <Link href="/grades" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
        К грейдам
      </Link>
    </div>
  );
}
