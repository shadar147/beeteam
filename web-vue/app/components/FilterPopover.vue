<script setup lang="ts">
import { ref } from "vue";
import SegControl from "~/components/SegControl.vue";
import type { Filters } from "~/lib/query/teams";

const ROLES = ["Frontend", "Backend", "QA", "Design", "DevOps", "PM"];
const TAGS = ["Mentor", "Promotion", "Lead Track", "Onboarding", "Burnout risk", "PIP", "Performance"];

const TENURE_OPTIONS = [
  { value: "", label: "Все" }, { value: "new", label: "<1 года" },
  { value: "mid", label: "1–3" }, { value: "sen", label: "3+" },
];
const MOOD_OPTIONS = [
  { value: "", label: "Все" }, { value: "up", label: "↑" },
  { value: "flat", label: "→" }, { value: "down", label: "↓" },
];
const SINCE_OPTIONS = [
  { value: "", label: "Все" }, { value: "lt1w", label: "<1 нед" },
  { value: "lt2w", label: "<2 нед" }, { value: "gt4w", label: ">4 нед" },
];

const props = defineProps<{ value: Filters }>();
const emit = defineEmits<{ apply: [f: Filters]; close: [] }>();

const draft = ref<Filters>(props.value);
const set = (patch: Partial<Filters>) => { draft.value = { ...draft.value, ...patch }; };
const toggleTag = (t: string) =>
  set({ tags: draft.value.tags?.includes(t) ? draft.value.tags.filter((x) => x !== t) : [...(draft.value.tags ?? []), t] });

function reset() {
  const cleared = {};
  draft.value = cleared;
  emit("apply", cleared);
  emit("close");
}

function apply() {
  emit("apply", draft.value);
  emit("close");
}
</script>

<template>
  <div class="absolute right-0 z-20 mt-2 w-[320px] rounded-lg border border-line bg-bg-elev p-4 shadow-pop">
    <div class="mb-3">
      <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Роль</div>
      <select
        class="h-9 w-full rounded-md border border-line bg-bg-elev px-2 text-[13px]"
        :value="draft.role ?? ''"
        @change="set({ role: ($event.target as HTMLSelectElement).value || undefined })"
      >
        <option value="">Все</option>
        <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
      </select>
    </div>

    <div class="mb-3">
      <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Стаж</div>
      <SegControl :options="TENURE_OPTIONS" :value="draft.tenure ?? ''" @change="(v) => set({ tenure: v || undefined })" />
    </div>

    <div class="mb-3">
      <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Тренд настроения</div>
      <SegControl :options="MOOD_OPTIONS" :value="draft.mood ?? ''" @change="(v) => set({ mood: v || undefined })" />
    </div>

    <div class="mb-3">
      <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Теги</div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="t in TAGS"
          :key="t"
          type="button"
          :data-tag="t"
          :aria-pressed="draft.tags?.includes(t) ?? false"
          :class="
            'rounded-full border px-2 py-0.5 text-[11.5px] ' +
            (draft.tags?.includes(t)
              ? 'border-brand bg-brand-soft text-brand-text'
              : 'border-line text-ink-3 hover:text-ink-2')
          "
          @click="toggleTag(t)"
        >
          {{ t }}
        </button>
      </div>
    </div>

    <div class="mb-4">
      <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Последняя 1-2-1</div>
      <SegControl :options="SINCE_OPTIONS" :value="draft.since ?? ''" @change="(v) => set({ since: v || undefined })" />
    </div>

    <div class="flex justify-end gap-2">
      <button type="button" class="rounded-md px-3 py-1.5 text-[13px] text-ink-3 hover:bg-bg-tint" @click="reset">
        Сбросить
      </button>
      <button type="button" class="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-[#1A1100]" @click="apply">
        Применить
      </button>
    </div>
  </div>
</template>
