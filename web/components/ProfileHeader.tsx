import Link from "next/link";
import { Avatar } from "./Avatar";
import { Pill } from "./Pill";
import { MoodTrendBars } from "./MoodTrendBars";
import { ProfileActions } from "./ProfileActions";
import type { MemberDetail } from "@/lib/query/profile";

export function ProfileHeader({ member }: { member: MemberDetail }) {
  const latestMood = member.mood_trend.at(-1) ?? null;
  return (
    <div className="border-b border-line bg-bg-elev px-6 pb-4 pt-5">
      <Link href="/" className="text-[12px] text-ink-3 hover:text-ink-2">← Моя команда / {member.name}</Link>
      <div className="mt-3 flex items-start gap-4">
        <Avatar name={member.name} hue={member.hue} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-semibold text-ink">{member.name}</h1>
          <div className="mt-0.5 text-[13px] text-ink-3">
            {member.role} · с {member.joined} · {member.email} · {member.tz}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill variant={member.status === "ok" ? "ok" : member.status === "warn" ? "warn" : "miss"} dot>
              {member.status === "ok" ? "В норме" : member.status === "warn" ? "Внимание" : "Риск"}
            </Pill>
            <Pill variant="info">{member.meetings_total} встреч за год</Pill>
            {latestMood != null && (
              <span className="inline-flex items-center gap-1.5">
                <MoodTrendBars trend={member.mood_trend} />
                <span className="text-[12px] text-ink-3 tabular">Настроение {latestMood}/10</span>
              </span>
            )}
            {member.tags.map((t) => <Pill key={t}>{t}</Pill>)}
          </div>
        </div>
        <ProfileActions memberId={member.id} />
      </div>
    </div>
  );
}
