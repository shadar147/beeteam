<script setup lang="ts">
import { computed } from "vue";
import { Clock } from "lucide-vue-next";
import Pill from "~/components/Pill.vue";
import GradeChip from "./GradeChip.vue";

// `onOpenReview` is declared as a prop (not an emit) because the footer renders
// differently when no handler is given; parents can still write `@open-review`.
const props = withDefaults(
  defineProps<{
    gradeOrd: number;
    gradeCode: string;
    gradeName: string;
    disciplineLabel: string;
    targetOrd: number | null;
    targetCode: string | null;
    targetName: string | null;
    readyMonths: number;
    mgrTrack: boolean;
    nextReview: string | null;
    lastReview: string | null;
    activeReview?: "draft" | "pending" | null;
    returned?: boolean;
    onOpenReview?: () => void;
  }>(),
  { activeReview: null, returned: false },
);

function fmt(d: string | null | undefined) {
  if (!d) return "не проводилось";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

const promoReady = computed(() => props.targetOrd != null && props.targetOrd > props.gradeOrd);
</script>

<template>
  <div class="rounded-xl border border-line bg-bg-elev p-5">
    <div class="flex flex-wrap items-center gap-4">
      <GradeChip :ord="gradeOrd" :code="gradeCode" size="xl" />
      <div>
        <div class="text-[18px] font-bold tracking-tight text-ink">{{ gradeName }}</div>
        <div class="mt-1 flex items-center gap-2 text-[12.5px] text-ink-3">
          <Pill variant="accent">{{ disciplineLabel }}</Pill>
          текущий грейд{{ mgrTrack ? " · менеджерский трек" : "" }}
        </div>
      </div>
    </div>

    <div v-if="promoReady" class="mt-4 rounded-lg border border-line bg-bg-tint p-3.5">
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <span class="text-[13px] font-semibold text-ink">
          Цель: {{ targetCode }} {{ targetName }}
        </span>
        <Pill variant="accent">
          <Clock :size="11" /> {{ readyMonths }}/3–6 мес
        </Pill>
      </div>
      <div class="relative h-2 rounded-full bg-bg-sunken">
        <div class="h-2 rounded-full bg-brand" :style="{ width: `${Math.min((readyMonths / 6) * 100, 100)}%` }" />
        <span class="absolute top-0 h-2 w-0.5 bg-brand-strong" style="left: 50%" title="минимум 3 мес" />
      </div>
      <div class="mt-1.5 text-[11.5px] text-ink-3">
        {{
          readyMonths >= 3
            ? "Достаточно свидетельств для постановки на ближайшее ревью."
            : `Ещё ${3 - readyMonths} мес стабильного проявления до порога ревью.`
        }}
      </div>
    </div>
    <div v-else class="mt-4 text-[13px] text-ink-3">
      Уверенно держит уровень. Цель на повышение не выставлена.
    </div>

    <div class="mt-4 flex flex-wrap gap-6 border-t border-line-2 pt-3 text-[12.5px]">
      <div>
        <div class="text-[10.5px] uppercase tracking-wide text-ink-4">Ближайшее ревью</div>
        <div class="text-ink-2">{{ fmt(nextReview) }}</div>
      </div>
      <div>
        <div class="text-[10.5px] uppercase tracking-wide text-ink-4">Прошлое ревью</div>
        <div class="text-ink-2">{{ fmt(lastReview) }}</div>
      </div>
      <div class="ml-auto flex items-center gap-2 self-center">
        <Pill v-if="activeReview === 'pending'" variant="accent">На согласовании HR</Pill>
        <template v-else-if="onOpenReview">
          <Pill v-if="activeReview === 'draft'" variant="accent">{{ returned ? "возвращено HR" : "черновик" }}</Pill>
          <button
            type="button"
            class="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
            @click="onOpenReview"
          >
            {{ activeReview === "draft" ? "Продолжить ревью" : "Открыть ревью" }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
