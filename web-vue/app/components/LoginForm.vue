<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Eye, EyeOff, ArrowRight } from "lucide-vue-next";

const router = useRouter();
const email = ref("");
const password = ref("");
const showPwd = ref(false);
const remember = ref(true);
const error = ref<string | null>(null);
const pending = ref(false);

async function onSubmit() {
  error.value = null;
  pending.value = true;
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.value, password: password.value, remember: remember.value }),
    });
    if (!res.ok) {
      error.value = "Неверная почта или пароль";
      return;
    }
    const data = (await res.json()) as { user?: { permissions?: string[] } };
    const perms = data.user?.permissions ?? [];
    // The session user state is loaded by the auth middleware during this navigation.
    await router.push(perms.includes("approve_reviews") && !perms.includes("manage_team") ? "/approvals" : "/");
  } catch {
    error.value = "Не удалось войти. Попробуйте ещё раз.";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="w-[380px] max-w-full" @submit.prevent="onSubmit">
    <h1 class="text-[26px] font-bold tracking-tight">С возвращением</h1>
    <p class="mt-1 text-ink-3 text-[13.5px]">Войдите в рабочее пространство своей команды.</p>

    <div class="mt-7 flex flex-col gap-4">
      <div>
        <label for="email" class="block text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-1.5">
          Корпоративная почта
        </label>
        <input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="name@company.com"
          class="h-10 w-full rounded-md border border-line bg-bg-elev px-3 text-[13.5px] outline-none focus:border-brand focus:ring-4 focus:ring-[rgba(245,165,36,0.14)]"
        />
      </div>

      <div>
        <div class="flex items-baseline justify-between mb-1.5">
          <label for="password" class="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Пароль
          </label>
          <span class="text-[12px] text-brand-strong cursor-default">Забыли пароль?</span>
        </div>
        <div class="relative">
          <input
            id="password"
            v-model="password"
            :type="showPwd ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="••••••••"
            class="h-10 w-full rounded-md border border-line bg-bg-elev px-3 pr-10 text-[13.5px] outline-none focus:border-brand focus:ring-4 focus:ring-[rgba(245,165,36,0.14)]"
          />
          <button
            type="button"
            aria-label="показать пароль"
            class="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint"
            @click="showPwd = !showPwd"
          >
            <EyeOff v-if="showPwd" :size="15" />
            <Eye v-else :size="15" />
          </button>
        </div>
      </div>

      <label class="flex items-center gap-2 py-1 cursor-default select-none text-[13px]">
        <input v-model="remember" type="checkbox" class="accent-[var(--brand)]" />
        Оставаться в системе на этом устройстве
      </label>

      <p v-if="error" role="alert" class="text-[13px] text-miss">{{ error }}</p>

      <button
        type="submit"
        :disabled="pending"
        class="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand text-[14px] font-semibold text-[#1A1100] disabled:opacity-60"
      >
        <template v-if="pending">Входим…</template>
        <template v-else>Войти <ArrowRight :size="16" /></template>
      </button>
    </div>

    <div class="my-5 flex items-center gap-3 text-[12px] text-ink-4">
      <span class="h-px flex-1 bg-line" /> или <span class="h-px flex-1 bg-line" />
    </div>

    <button
      type="button"
      disabled
      title="Скоро"
      aria-hidden="true"
      class="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-bg-elev text-[13.5px] text-ink-2 opacity-70"
    >
      <span class="grid h-4 w-4 grid-cols-2 gap-px">
        <i class="bg-[#f25022]" /><i class="bg-[#7fba00]" /><i class="bg-[#00a4ef]" /><i class="bg-[#ffb900]" />
      </span>
      Войти через Active Directory
    </button>

    <p class="mt-6 text-[12px] leading-relaxed text-ink-3">
      Доменная учётная запись синхронизируется автоматически. Если вы не нашли свою команду — обратитесь к HR-администратору.
    </p>
  </form>
</template>
