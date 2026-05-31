import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[1.05fr_1fr] bg-bg">
      {/* Art block */}
      <div
        className="relative hidden overflow-hidden p-12 md:flex md:flex-col"
        style={{
          background:
            "radial-gradient(1200px 480px at 12% -8%, color-mix(in oklab, var(--brand) 28%, transparent), transparent 60%), radial-gradient(900px 420px at 90% 12%, color-mix(in oklab, var(--brand) 18%, transparent), transparent 55%), linear-gradient(180deg, var(--bg-elev), var(--bg-tint))",
        }}
      >
        <Logo className="text-[16px] text-ink" />
        <div className="mt-auto max-w-[520px] text-[28px] font-semibold leading-[1.25] tracking-[-0.02em]">
          <span className="text-brand-strong">1-2-1, которые не теряются.</span>
          <br />
          История разговоров, настроение команды и развитие — в одном рабочем пространстве.
        </div>
        <div className="mt-8 flex gap-2 text-[12px] text-ink-3">
          <span>© BeeTeam 2026</span><span className="text-line-strong">·</span>
          <span>Политика конфиденциальности</span><span className="text-line-strong">·</span>
          <span>Безопасность</span>
        </div>
      </div>

      {/* Form block */}
      <div className="flex items-center justify-center p-8">
        <LoginForm />
      </div>
    </div>
  );
}
