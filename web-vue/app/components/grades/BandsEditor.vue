<script setup lang="ts">
import { computed } from "vue";
import { formatTenge } from "~/lib/format";
import type { DraftBand } from "./editorTypes";

type BandField = "band_low" | "band_mid" | "band_high";

const props = defineProps<{ levels: DraftBand[]; taxPct: number }>();
const emit = defineEmits<{
  band: [ord: number, patch: Partial<DraftBand>];
  tax: [pct: number];
}>();

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/\s/g, "")));
const valueOf = (e: Event) => (e.target as HTMLInputElement).value;

const rate = computed(() => (Number.isFinite(props.taxPct) ? props.taxPct / 100 : 0));
const cell = "w-[120px] rounded-md border border-line bg-bg px-2 py-1.5 text-right text-[12.5px] tabular text-ink outline-none focus:border-brand";
const inputs: [BandField, string][] = [
  ["band_low", "мин."], ["band_mid", "медиана"], ["band_high", "макс."],
];

function netMid(l: DraftBand) {
  return Number.isFinite(l.band_mid) ? Math.round(l.band_mid * (1 - rate.value)) : 0;
}
</script>

<template>
  <div class="space-y-3.5">
    <div class="flex items-center gap-3 rounded-xl border border-line bg-bg-tint p-3.5">
      <label for="tax" class="text-[13px] font-medium text-ink">Ставка ИПН, %</label>
      <input
        id="tax"
        aria-label="Ставка ИПН, %"
        inputmode="decimal"
        :value="Number.isFinite(taxPct) ? String(taxPct) : ''"
        class="w-[80px] rounded-md border border-line bg-bg px-2 py-1.5 text-right text-[12.5px] tabular text-ink outline-none focus:border-brand"
        @input="emit('tax', num(valueOf($event)))"
      />
      <span class="text-[12px] text-ink-3">«На руки» считается как оклад × (1 − ставка).</span>
    </div>

    <div class="overflow-hidden rounded-xl border border-line bg-bg-elev">
      <div
        class="grid items-center gap-3 bg-bg-tint px-[18px] py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"
        style="grid-template-columns: 150px repeat(3, 120px) 1fr"
      >
        <div>Грейд</div><div class="text-right">Мин.</div><div class="text-right">Медиана</div>
        <div class="text-right">Макс.</div><div class="text-right">На руки (медиана)</div>
      </div>
      <div
        v-for="l in levels"
        :key="l.ord"
        class="grid items-center gap-3 border-t border-line-2 px-[18px] py-3"
        style="grid-template-columns: 150px repeat(3, 120px) 1fr"
      >
        <div class="text-[13px] font-semibold text-ink">{{ l.code }} · {{ l.name }}</div>
        <input
          v-for="[field, label] in inputs"
          :key="field"
          :aria-label="`${l.code} ${label}`"
          inputmode="numeric"
          :value="Number.isFinite(l[field]) ? String(l[field]) : ''"
          :class="cell"
          @input="emit('band', l.ord, { [field]: num(valueOf($event)) })"
        />
        <div class="text-right text-[12.5px] tabular text-ink-2">{{ formatTenge(netMid(l)) }}</div>
      </div>
    </div>
  </div>
</template>
