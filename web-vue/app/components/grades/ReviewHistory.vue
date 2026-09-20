<script setup lang="ts">
import { computed } from "vue";
import Pill from "~/components/Pill.vue";
import type { Review } from "~/lib/query/reviews";
import { DECISION_LABEL } from "./ReviewHistory";

const props = defineProps<{ reviews: Review[]; codeOf: (ord: number) => string }>();

function fmt(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

const rows = computed(() => props.reviews.filter((r) => r.status !== "draft"));
</script>

<template>
  <div class="rounded-xl border border-line bg-bg-elev p-5">
    <div class="mb-2 text-[13px] font-semibold text-ink">История ревью</div>
    <p v-if="rows.length === 0" class="text-[12.5px] leading-relaxed text-ink-3">
      Ревью ещё не проводились. Запустите первое из карточки грейда.
    </p>
    <div v-else class="space-y-3">
      <div v-for="r in rows" :key="r.id" class="border-b border-line-2 pb-3 last:border-b-0 last:pb-0">
        <div class="flex items-center gap-2">
          <span class="text-[12.5px] font-semibold tabular text-ink">{{ r.period }}</span>
          <span class="text-[12px] tabular text-ink-2">
            {{ codeOf(r.from_grade_ord) }} → {{ codeOf(r.to_grade_ord ?? r.from_grade_ord) }}
          </span>
          <Pill v-if="r.status === 'pending'" variant="accent">на согласовании</Pill>
          <span v-else-if="r.decision" class="text-[11.5px] text-ink-3">{{ DECISION_LABEL[r.decision] ?? r.decision }}</span>
          <span class="ml-auto text-[11px] text-ink-4">{{ fmt(r.resolved_at ?? r.finalized_at) }}</span>
        </div>
        <p v-if="r.summary" class="mt-1 text-[12px] leading-relaxed text-ink-3">{{ r.summary }}</p>
      </div>
    </div>
  </div>
</template>
