<script lang="ts">
export type Decision = "hold" | "promote" | "pip";
</script>

<script setup lang="ts">
import { computed, type Component } from "vue";
import { Check, TrendingUp, Flag, ArrowRight, ShieldCheck } from "lucide-vue-next";
import { cn } from "~/lib/utils";

const props = defineProps<{
  gradeOrd: number;
  gradeCode: string;
  nextCode: string;
  decision: Decision | null;
  summary: string;
  compa: number;
  lowBlocks: string[];
}>();
const emit = defineEmits<{ decision: [d: Decision]; summary: [s: string] }>();

const options = computed<{ id: Decision; icon: Component; label: string; desc: string }[]>(() => [
  { id: "hold", icon: Check, label: `Сохранить ${props.gradeCode}`, desc: "Уровень подтверждён, повышения пока нет" },
  ...(props.gradeOrd < 7
    ? [{ id: "promote" as Decision, icon: TrendingUp, label: `Повысить до ${props.nextCode}`, desc: "Стабильно проявляет компетенции следующего уровня" }]
    : []),
  { id: "pip", icon: Flag, label: "План улучшения (PIP)", desc: "Есть проседания, нужен фокус-план на квартал" },
]);

const BAND_TRACK = "absolute h-1.5 w-full rounded-full border border-line bg-gradient-to-r from-bg-sunken via-brand-soft to-brand";
const BAND_DOT = "absolute h-3 w-3 -translate-x-1/2 rounded-full border-2 border-bg-elev shadow";
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 sm:grid-cols-3">
      <button
        v-for="o in options"
        :key="o.id"
        type="button"
        :aria-pressed="decision === o.id"
        :class="cn(
          'rounded-xl border p-4 text-left',
          decision === o.id
            ? o.id === 'pip'
              ? 'border-miss/50 bg-miss-soft'
              : 'border-brand bg-brand-soft'
            : 'border-line bg-bg-elev hover:bg-bg-tint',
        )"
        @click="emit('decision', o.id)"
      >
        <span class="text-ink-3"><component :is="o.icon" :size="18" /></span>
        <div class="mt-2 text-[13.5px] font-semibold text-ink">{{ o.label }}</div>
        <div class="mt-0.5 text-[11.5px] leading-snug text-ink-3">{{ o.desc }}</div>
      </button>
    </div>

    <div v-if="decision === 'promote'" class="rounded-xl border border-line bg-bg-elev p-5">
      <div class="text-[13px] font-semibold text-ink">Влияние на вилку</div>
      <div class="mb-4 text-[12px] text-ink-3">
        При повышении {{ gradeCode }} → {{ nextCode }} (вид лида, без точных окладов)
      </div>
      <div class="flex items-center gap-4">
        <div class="flex-1">
          <div class="mb-1 text-[10.5px] uppercase tracking-wide text-ink-4">сейчас · {{ gradeCode }}</div>
          <div class="relative flex h-5 items-center">
            <div :class="BAND_TRACK" />
            <span :class="cn(BAND_DOT, 'bg-ink')" :style="{ left: `${Math.round(compa * 100)}%` }" />
          </div>
          <div class="mt-1 text-[11.5px] text-ink-3">{{ compa < 0.5 ? "ниже медианы" : "около медианы" }}</div>
        </div>
        <ArrowRight :size="18" class="shrink-0 text-ink-3" />
        <div class="flex-1">
          <div class="mb-1 text-[10.5px] uppercase tracking-wide text-ink-4">после · {{ nextCode }}</div>
          <div class="relative flex h-5 items-center">
            <div :class="BAND_TRACK" />
            <span :class="cn(BAND_DOT, 'bg-brand-strong')" style="left: 22%" />
          </div>
          <div class="mt-1 text-[11.5px] text-ink-3">вход в новую полосу (нижняя часть)</div>
        </div>
      </div>
      <p class="mt-4 text-[12px] leading-relaxed text-ink-3">
        Повышение сбрасывает позицию в нижнюю часть новой, более высокой полосы — это нормально.
        Внеплановое ревью зарплаты запускается автоматически при подтверждении грейда.
      </p>
    </div>

    <div v-if="decision === 'pip'" class="rounded-xl border border-miss/30 bg-bg-elev p-5">
      <div class="text-[13px] font-semibold text-miss">Фокус-план на квартал</div>
      <div class="mb-3 text-[12px] text-ink-3">Блоки ниже целевого уровня</div>
      <p v-if="lowBlocks.length === 0" class="text-[12.5px] text-ink-3">Все блоки на уровне грейда — уточните план в резюме.</p>
      <div v-else class="space-y-1.5">
        <div v-for="name in lowBlocks" :key="name" class="flex items-center gap-2.5 text-[12.5px] text-ink-2">
          <span class="h-3.5 w-3.5 rounded border border-line-strong" /> {{ name }} — дотянуть до {{ gradeCode }}
        </div>
      </div>
    </div>

    <div class="rounded-xl border border-line bg-bg-elev p-5">
      <label for="review-summary" class="mb-2 block text-[13px] font-semibold text-ink">
        Резюме ревью
      </label>
      <textarea
        id="review-summary"
        rows="4"
        :value="summary"
        placeholder="Ключевые достижения, обоснование решения, договорённости на следующий период…"
        class="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
        @input="emit('summary', ($event.target as HTMLTextAreaElement).value)"
      />
      <div class="mt-2.5 flex items-center gap-2 text-[12px] text-ink-3">
        <ShieldCheck :size="14" /> Сотрудник увидит резюме и финальное решение после согласования с HR.
      </div>
    </div>
  </div>
</template>
