"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      if (!res.ok) {
        setError("Неверная почта или пароль");
        return;
      }
      const data = (await res.json()) as { user?: { permissions?: string[] } };
      const perms = data.user?.permissions ?? [];
      router.push(perms.includes("approve_reviews") && !perms.includes("manage_team") ? "/approvals" : "/");
    } catch {
      setError("Не удалось войти. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-[380px] max-w-full">
      <h1 className="text-[26px] font-bold tracking-tight">С возвращением</h1>
      <p className="mt-1 text-ink-3 text-[13.5px]">Войдите в рабочее пространство своей команды.</p>

      <div className="mt-7 flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="block text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-1.5">
            Корпоративная почта
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="h-10 w-full rounded-md border border-line bg-bg-elev px-3 text-[13.5px] outline-none focus:border-brand focus:ring-4 focus:ring-[rgba(245,165,36,0.14)]"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Пароль
            </label>
            <span className="text-[12px] text-brand-strong cursor-default">Забыли пароль?</span>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 w-full rounded-md border border-line bg-bg-elev px-3 pr-10 text-[13.5px] outline-none focus:border-brand focus:ring-4 focus:ring-[rgba(245,165,36,0.14)]"
            />
            <button
              type="button"
              aria-label="показать пароль"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint"
            >
              {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 py-1 cursor-default select-none text-[13px]">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-[var(--brand)]" />
          Оставаться в системе на этом устройстве
        </label>

        {error && <p role="alert" className="text-[13px] text-miss">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand text-[14px] font-semibold text-[#1A1100] disabled:opacity-60"
        >
          {pending ? "Входим…" : <>Войти <ArrowRight size={16} /></>}
        </button>
      </div>

      <div className="my-5 flex items-center gap-3 text-[12px] text-ink-4">
        <span className="h-px flex-1 bg-line" /> или <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        disabled
        title="Скоро"
        aria-hidden="true"
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-bg-elev text-[13.5px] text-ink-2 opacity-70"
      >
        <span className="grid h-4 w-4 grid-cols-2 gap-px">
          <i className="bg-[#f25022]" /><i className="bg-[#7fba00]" /><i className="bg-[#00a4ef]" /><i className="bg-[#ffb900]" />
        </span>
        Войти через Active Directory
      </button>

      <p className="mt-6 text-[12px] leading-relaxed text-ink-3">
        Доменная учётная запись синхронизируется автоматически. Если вы не нашли свою команду — обратитесь к HR-администратору.
      </p>
    </form>
  );
}
