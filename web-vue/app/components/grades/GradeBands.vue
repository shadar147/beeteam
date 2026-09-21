<script setup lang="ts">
import { computed } from "vue";
import { Shield } from "lucide-vue-next";
import GradeChip from "./GradeChip.vue";
import { formatTenge } from "~/lib/format";
import type { GradeLevel } from "~/lib/query/grades";

const props = defineProps<{ levels: GradeLevel[]; taxRate?: number | null }>();

const rows = computed(() => [...props.levels].sort((a, b) => a.ord - b.ord));
// Exact figures + a tax rate are co-gated by EditSalaryBands (either both present or both absent),
// so require every row's bands AND the rate before showing money — avoids a misleading "ИПН 0%".
const exact = computed(
  () => rows.value.length > 0 && rows.value.every((l) => l.band_low != null) && props.taxRate != null,
);
const rate = computed(() => props.taxRate ?? 0);
const cols = computed(() => (exact.value ? "170px 1fr 70px 190px 190px" : "200px 1fr 80px"));

function spread(l: GradeLevel) {
  return l.band_shape.mid > 0
    ? Math.round(((l.band_shape.high - l.band_shape.low) / (2 * l.band_shape.mid)) * 100)
    : 0;
}
</script>

<template>
  <div class="space-y-3.5">
    <div class="flex items-start gap-3 rounded-xl border border-line bg-bg-tint p-3.5">
      <Shield :size="16" class="mt-0.5 shrink-0 text-brand-strong" />
      <p v-if="exact" class="text-[13px] leading-relaxed text-ink-2">
        <b class="font-semibold text-ink">Точные оклады (₸/мес, до налога).</b>{{ " " }}
        <span class="text-ink-3">
          «На руки» — с учётом ИПН {{ Math.round(rate * 100) }}%. Вилки общие для всех дисциплин на одном грейде.
        </span>
      </p>
      <p v-else class="text-[13px] leading-relaxed text-ink-2">
        <b class="font-semibold text-ink">Вид лида: полосы без точных окладов.</b>{{ " " }}
        <span class="text-ink-3">
          Вилки общие для всех дисциплин на одном грейде. Точные цифры — у HR-администратора.
        </span>
      </p>
    </div>

    <div class="overflow-hidden rounded-xl border border-line bg-bg-elev">
      <div
        class="grid items-center gap-4 bg-bg-tint px-[18px] py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"
        :style="{ gridTemplateColumns: cols }"
      >
        <div>Грейд</div>
        <div>Полоса (нижняя → медиана → верхняя)</div>
        <div class="text-right">Разброс</div>
        <div v-if="exact" class="text-right">Оклад (до налога)</div>
        <div v-if="exact" class="text-right">На руки · ИПН {{ Math.round(rate * 100) }}%</div>
      </div>

      <div
        v-for="l in rows"
        :key="l.ord"
        class="grid items-center gap-4 border-t border-line-2 px-[18px] py-3.5"
        :style="{ gridTemplateColumns: cols }"
      >
        <div class="flex items-center gap-2.5">
          <GradeChip :ord="l.ord" :code="l.code" size="sm" />
          <span class="text-[13px] font-semibold text-ink">{{ l.name }}</span>
        </div>
        <div class="relative flex h-7 items-center">
          <div
            class="absolute h-2 rounded-full border border-line bg-gradient-to-r from-bg-sunken via-brand-soft to-brand"
            :style="{
              left: `${l.band_shape.low * 100}%`,
              width: `${l.band_shape.high * 100 - l.band_shape.low * 100}%`,
            }"
          />
          <div class="absolute h-3.5 w-0.5 rounded bg-ink-4" :style="{ left: `${l.band_shape.low * 100}%` }" />
          <div class="absolute h-[18px] w-0.5 rounded bg-brand-strong" :style="{ left: `${l.band_shape.mid * 100}%` }" />
          <div class="absolute h-3.5 w-0.5 rounded bg-ink-4" :style="{ left: `calc(${l.band_shape.high * 100}% - 2px)` }" />
        </div>
        <div class="text-right text-[12.5px] tabular text-ink-2">±{{ spread(l) }}%</div>
        <div v-if="exact" class="text-right text-[12.5px] tabular text-ink">
          {{ formatTenge(l.band_low!) }} – {{ formatTenge(l.band_high!) }}
        </div>
        <div v-if="exact" class="text-right text-[12.5px] tabular text-ink-2">
          {{ formatTenge(l.band_low! * (1 - rate)) }} – {{ formatTenge(l.band_high! * (1 - rate)) }}
        </div>
      </div>
    </div>
  </div>
</template>
