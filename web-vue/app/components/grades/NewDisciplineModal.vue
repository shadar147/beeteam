<script setup lang="ts">
import { computed, ref } from "vue";
import { Layers, SlidersHorizontal, Sparkles, CircleCheck, Settings } from "lucide-vue-next";
import Modal from "~/components/Modal.vue";
import { cn } from "~/lib/utils";

const ICONS = [
  { key: "layers", Icon: Layers },
  { key: "fields", Icon: SlidersHorizontal },
  { key: "spark", Icon: Sparkles },
  { key: "check", Icon: CircleCheck },
  { key: "settings", Icon: Settings },
];

const props = defineProps<{
  bases: { id: string; label: string }[];
  creating: boolean;
}>();
const emit = defineEmits<{
  create: [body: { label: string; icon: string; description: string; copy_from_discipline_id: string }];
  close: [];
}>();

const label = ref("");
const description = ref("");
const icon = ref("layers");
const base = ref(props.bases[0]?.id ?? "");
const valid = computed(() => label.value.trim().length >= 2 && base.value !== "");
</script>

<template>
  <Modal title="Новая дисциплина" @close="emit('close')">
    <div class="space-y-3">
      <div>
        <div class="mb-1 text-[11px] uppercase tracking-wide text-ink-3">Иконка</div>
        <div class="flex gap-2">
          <button
            v-for="i in ICONS"
            :key="i.key"
            type="button"
            :aria-label="`Иконка ${i.key}`"
            :class="cn('grid h-9 w-9 place-items-center rounded-lg border',
              icon === i.key ? 'border-brand bg-brand-soft text-brand-text' : 'border-line text-ink-3 hover:bg-bg-tint')"
            @click="icon = i.key"
          >
            <component :is="i.Icon" :size="16" />
          </button>
        </div>
      </div>
      <div>
        <label for="disc-label" class="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">
          Название дисциплины
        </label>
        <input
          id="disc-label"
          v-model="label"
          class="w-full rounded-md border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
        />
      </div>
      <div>
        <label for="disc-desc" class="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">Описание</label>
        <input
          id="disc-desc"
          v-model="description"
          class="w-full rounded-md border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
        />
      </div>
      <div>
        <label for="disc-base" class="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">
          Скопировать структуру блоков из…
        </label>
        <select
          id="disc-base"
          v-model="base"
          class="w-full rounded-md border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
        >
          <option v-for="b in bases" :key="b.id" :value="b.id">{{ b.label }}</option>
        </select>
      </div>
    </div>
    <div class="mt-4 flex justify-end gap-2">
      <button
        type="button"
        class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint"
        @click="emit('close')"
      >
        Отмена
      </button>
      <button
        type="button"
        :disabled="!valid || creating"
        class="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
        @click="emit('create', { label: label.trim(), icon, description: description.trim(), copy_from_discipline_id: base })"
      >
        Создать
      </button>
    </div>
  </Modal>
</template>
