<script setup lang="ts">
import { computed, ref } from "vue";
import { Plus, Download, Search, Filter } from "lucide-vue-next";
import Topbar from "~/components/Topbar.vue";
import StatCard from "~/components/StatCard.vue";
import SegControl from "~/components/SegControl.vue";
import TeamTable from "~/components/TeamTable.vue";
import FilterPopover from "~/components/FilterPopover.vue";
import { activeFilterCount } from "~/components/FilterPopover";
import { useTeamMembers, useTeamStats, type Filters } from "~/lib/query/teams";

const TABS = [
  { value: "all", label: "Все" },
  { value: "this-week", label: "На этой неделе" },
  { value: "overdue", label: "Просрочены" },
  { value: "attention", label: "Требуют внимания" },
];

const props = defineProps<{ teamId: string | null }>();

const q = ref("");
const tab = ref("all");
const popoverFilters = ref<Filters>({});
const showFilter = ref(false);

const filters = computed<Filters>(() => ({
  ...popoverFilters.value,
  q: q.value || undefined,
  since: tab.value === "overdue" ? "gt4w" : popoverFilters.value.since,
}));

const { data: stats } = useTeamStats(() => props.teamId);
const { data: members, isError, isLoading, refetch } = useTeamMembers(() => props.teamId, filters);

const rows = computed(() =>
  (members.value ?? []).filter((m) => {
    if (tab.value === "attention") return m.status !== "ok";
    if (tab.value === "this-week") return Boolean(m.next_meet) &&
      (new Date(m.next_meet!).getTime() - Date.now()) <= 7 * 86_400_000 &&
      new Date(m.next_meet!).getTime() >= Date.now();
    return true;
  }),
);

const count = computed(() => activeFilterCount(popoverFilters.value));
</script>

<template>
  <Topbar title="Моя команда" />
  <div class="p-6">
    <div class="mb-5 flex items-start justify-between">
      <div>
        <h1 class="text-[26px] font-bold tracking-tight">Моя команда</h1>
        <p class="mt-0.5 text-[13px] text-ink-3">
          {{ members?.length ?? "…" }} человек · Платформенный отдел · Q2 2026
        </p>
      </div>
      <div class="flex gap-2">
        <button class="flex h-9 items-center gap-1.5 rounded-md border border-line bg-bg-elev px-3 text-[13px]" title="Скоро">
          <Download :size="14" /> Экспорт в Excel
        </button>
        <button class="flex h-9 items-center gap-1.5 rounded-md border border-line bg-bg-elev px-3 text-[13px]" title="Скоро">
          <Plus :size="14" /> Сотрудник
        </button>
        <button class="flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-semibold text-[#1A1100]" title="Скоро">
          <Plus :size="14" /> Новая 1-2-1
        </button>
      </div>
    </div>

    <div class="mb-4 grid grid-cols-4 gap-3">
      <StatCard label="На этой неделе" :value="stats?.this_week ?? '…'" sub="запланировано встреч" accent-dot />
      <StatCard
        label="Просрочены"
        :value="stats?.overdue ?? '…'"
        :danger="(stats?.overdue ?? 0) > 0"
        :sub="(stats?.overdue ?? 0) > 0 ? 'давно не виделись' : 'все встречи в графике'"
      />
      <StatCard
        label="Среднее настроение"
        :value="stats?.avg_mood ?? '…'"
        suffix="/10"
        :sub="stats ? `${stats.avg_mood_delta >= 0 ? '↑ +' : '↓ '}${stats.avg_mood_delta} за месяц` : undefined"
      />
      <StatCard label="Заметок за квартал" :value="stats?.notes_quarter ?? '…'" sub="по всей команде" />
    </div>

    <div class="mb-4 flex items-center gap-3">
      <div class="flex h-9 flex-1 items-center gap-2 rounded-md border border-line bg-bg-elev px-3">
        <Search :size="15" class="text-ink-3" />
        <input
          v-model="q"
          placeholder="Поиск по имени или роли"
          class="w-full bg-transparent text-[13px] outline-none"
        />
      </div>
      <SegControl :options="TABS" :value="tab" @change="tab = $event" />
      <div class="relative">
        <button
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-md border border-line bg-bg-elev px-3 text-[13px]"
          @click="showFilter = !showFilter"
        >
          <Filter :size="13" /> Фильтр
          <span v-if="count > 0" class="ml-1 rounded-full bg-brand px-1.5 text-[11px] font-semibold text-[#1A1100]">{{ count }}</span>
        </button>
        <FilterPopover
          v-if="showFilter"
          :value="popoverFilters"
          @apply="popoverFilters = $event"
          @close="showFilter = false"
        />
      </div>
    </div>

    <div v-if="isError" class="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
      Не удалось загрузить команду. <button class="underline" @click="refetch()">Повторить</button>
    </div>
    <div v-else-if="isLoading" class="rounded-lg border border-line bg-bg-elev p-10 text-center text-[13px] text-ink-3">Загрузка…</div>
    <TeamTable v-else :members="rows" />

    <div class="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-tint px-4 py-3.5 text-[13px] text-ink-3">
      <Plus :size="14" />
      <span>Добавить сотрудника в команду — он получит приглашение по email</span>
      <button class="ml-auto rounded-md border border-line bg-bg-elev px-3 py-1.5 text-[13px]" title="Скоро">Добавить</button>
    </div>
  </div>
</template>
