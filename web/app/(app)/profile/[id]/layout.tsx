import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { ProfileHeader } from "@/components/ProfileHeader";
import type { MemberDetail } from "@/lib/query/profile";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export default async function ProfileLayout({
  params,
  children,
}: {
  params: { id: string };
  children: React.ReactNode;
}) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const res = await fetch(`${API}/v1/members/${params.id}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (res.status === 403) {
    return (
      <div className="p-10 text-center">
        <p className="text-[15px] font-medium text-ink-2">Нет доступа к этому профилю</p>
        <Link href="/" className="mt-2 inline-block text-[13px] text-brand-text underline">← Вернуться к команде</Link>
      </div>
    );
  }
  if (!res.ok) {
    return <div className="p-10 text-center text-[14px] text-miss">Не удалось загрузить профиль.</div>;
  }
  const member: MemberDetail = await res.json();

  return (
    <div>
      <ProfileHeader member={member} />
      {children}
    </div>
  );
}
