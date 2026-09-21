<script setup lang="ts">
import MoodPicker from "~/components/MoodPicker.vue";
import type { FieldDef } from "~/lib/query/meetings";

const props = defineProps<{
  field: FieldDef;
  value: string;
  moodScore: number | null;
}>();
const emit = defineEmits<{
  change: [value: string];
  mood: [emoji: string, score: number];
}>();

function cnScale(active: boolean): string {
  return `h-7 w-7 rounded text-[12px] tabular ${active ? "bg-brand text-brand-text" : "border border-line text-ink-2 hover:bg-bg-tint"}`;
}

function toggleOption(option: string, checked: boolean) {
  const set = new Set(props.value.split(",").filter(Boolean));
  if (checked) set.add(option);
  else set.delete(option);
  emit("change", Array.from(set).join(","));
}
</script>

<template>
  <div class="py-2">
    <div class="mb-1 text-[12px] font-medium text-ink-2">{{ field.title }}</div>
    <MoodPicker
      v-if="field.kind === 'mood'"
      :value="value"
      :score="moodScore"
      @change="(emoji, score) => emit('mood', emoji, score)"
    />
    <textarea
      v-else-if="field.kind === 'longtext'"
      :value="value"
      :placeholder="field.placeholder ?? ''"
      rows="3"
      class="w-full rounded-md border border-line bg-bg-elev p-2 text-[13px] text-ink"
      @input="emit('change', ($event.target as HTMLTextAreaElement).value)"
    />
    <input
      v-else-if="field.kind === 'text' || field.kind === 'date'"
      type="text"
      :value="value"
      :placeholder="field.placeholder ?? (field.kind === 'date' ? 'ДД.ММ.ГГГГ' : '')"
      class="w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink"
      @input="emit('change', ($event.target as HTMLInputElement).value)"
    >
    <div v-else-if="field.kind === 'scale'" class="flex gap-1">
      <button
        v-for="n in 10"
        :key="n"
        type="button"
        :class="cnScale(value === String(n))"
        @click="emit('change', String(n))"
      >
        {{ n }}
      </button>
    </div>
    <select
      v-else-if="field.kind === 'select'"
      :value="value"
      class="w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink"
      @change="emit('change', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">—</option>
      <option v-for="o in field.options" :key="o" :value="o">{{ o }}</option>
    </select>
    <div v-else-if="field.kind === 'checklist'" class="space-y-1">
      <label v-for="o in field.options" :key="o" class="flex items-center gap-2 text-[13px] text-ink-2">
        <input
          type="checkbox"
          :checked="value.split(',').includes(o)"
          @change="toggleOption(o, ($event.target as HTMLInputElement).checked)"
        >
        {{ o }}
      </label>
    </div>
    <div
      v-else-if="field.kind === 'file'"
      class="rounded-md border border-dashed border-line-strong bg-bg-tint p-3 text-center text-[12px] text-ink-3"
    >
      Используйте раздел «Вложения» ниже
    </div>
    <div
      v-else
      class="rounded-md border border-dashed border-line-strong bg-bg-tint p-3 text-center text-[12px] text-ink-3"
    >
      Неизвестный тип поля
    </div>
  </div>
</template>
