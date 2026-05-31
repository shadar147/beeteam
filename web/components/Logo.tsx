import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <span className="relative grid h-[26px] w-[26px] place-items-center rounded-md bg-brand text-[15px] font-extrabold text-[#1A1100]">
        B
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#fff8] ring-1 ring-[#1A110022]" />
      </span>
      BeeTeam
    </span>
  );
}
