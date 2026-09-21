<script setup lang="ts">
import { computed, ref } from "vue";
import SegControl from "~/components/SegControl.vue";
import { useTeamCalendar } from "~/lib/query/calendar";
import { useDrawerStore } from "~/stores/drawer";
import { monthRange, weekRange, listRange, mondayOf, RU_MONTHS_FULL, sameDay, RU_MONTHS, STATE_META } from "~/lib/calendar";
import Modal from "~/components/Modal.vue";
import Avatar from "~/components/Avatar.vue";
import Pill from "~/components/Pill.vue";
import CalendarMonth from "./CalendarMonth.vue";
import CalendarWeek from "./CalendarWeek.vue";
import CalendarList from "./CalendarList.vue";
import CalendarSidebar from "./CalendarSidebar.vue";

type View = "month" | "week" | "list";

const PILL: Record<string, "info" | "ok" | "miss"> = { planned: "info", done: "ok", miss: "miss" };

const VIEW_OPTIONS = [
  { value: "month", label: "Месяц" },
  { value: "week", label: "Неделя" },
  { value: "list", label: "Список" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "planned", label: "Запланировано" },
  { value: "done", label: "Проведено" },
  { value: "miss", label: "Пропущено" },
];

const props = defineProps<{ teamId: string | null }>();

const view = ref<View>("month");
const anchor = ref(new Date());
const status = ref("all");
const dayModal = ref<Date | null>(null);
const drawer = useDrawerStore();

const today = new Date();

const range = computed(() =>
  view.value === "month" ? monthRange(anchor.value) :
  view.value === "week"  ? weekRange(anchor.value)  :
                           listRange(anchor.value),
);

// enabled: teamId != null — no-ops when teamId is null
const { data, isLoading, isError, refetch } = useTeamCalendar(
  () => props.teamId,
  () => range.value.from,
  () => range.value.to,
);

const meetings = computed(() =>
  (data.value ?? []).filter((m) => status.value === "all" || m.state === status.value),
);

const dayMeetings = computed(() => {
  const day = dayModal.value;
  if (!day) return [];
  return meetings.value
    .filter((m) => sameDay(new Date(m.date), day))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
});

function shift(dir: -1 | 1) {
  const d = new Date(anchor.value);
  if (view.value === "month") d.setMonth(d.getMonth() + dir);
  else if (view.value === "week") d.setDate(d.getDate() + 7 * dir);
  else d.setDate(d.getDate() + 14 * dir);
  anchor.value = d;
}

const title = computed(() => {
  const a = anchor.value;
  return view.value === "month"
    ? `${RU_MONTHS_FULL[a.getMonth()]} ${a.getFullYear()}`
    : view.value === "week"
      ? `Неделя с ${mondayOf(a).getDate()} ${RU_MONTHS_FULL[mondayOf(a).getMonth()]!.toLowerCase()}`
      : "Список встреч";
});

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function openFromModal(id: string) {
  drawer.open(id);
  dayModal.value = null;
}
</script>

<template>
  <div v-if="teamId == null" class="p-10 text-center text-[14px] text-ink-3">
    Календарь доступен лидам команды
  </div>
  <div v-else class="p-6">
    <!-- Page header -->
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h1 class="text-[20px] font-semibold text-ink">Календарь</h1>
        <p class="text-[13px] text-ink-3 tabular">
          Все 1-2-1 встречи команды · {{ title }}
        </p>
      </div>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
        >
          .ics
        </button>
        <button
          type="button"
          class="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
        >
          + Запланировать
        </button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <SegControl :options="VIEW_OPTIONS" :value="view" @change="(v) => (view = v as View)" />
        <div class="flex items-center gap-1">
          <button
            type="button"
            aria-label="Назад"
            class="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint"
            @click="shift(-1)"
          >
            ‹
          </button>
          <button
            type="button"
            class="rounded px-2 py-1 text-[12px] text-ink-2 hover:bg-bg-tint"
            @click="anchor = new Date()"
          >
            Сегодня
          </button>
          <button
            type="button"
            aria-label="Вперёд"
            class="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint"
            @click="shift(1)"
          >
            ›
          </button>
        </div>
      </div>
      <SegControl :options="STATUS_OPTIONS" :value="status" @change="(v) => (status = v)" />
    </div>

    <!-- Main grid -->
    <div class="grid grid-cols-[1.7fr_minmax(280px,1fr)] gap-5">
      <div>
        <div v-if="isLoading" class="rounded-lg border border-line bg-bg-elev p-10 text-center text-[13px] text-ink-3">
          Загрузка…
        </div>
        <div v-else-if="isError" class="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
          Не удалось загрузить календарь.
          <button class="underline" @click="refetch()">
            Повторить
          </button>
        </div>
        <CalendarMonth
          v-else-if="view === 'month'"
          :month="anchor"
          :today="today"
          :meetings="meetings"
          @select="drawer.open"
          @open-day="(d) => (dayModal = d)"
        />
        <CalendarWeek
          v-else-if="view === 'week'"
          :week-start="mondayOf(anchor)"
          :today="today"
          :meetings="meetings"
          @select="drawer.open"
        />
        <CalendarList v-else :meetings="meetings" @select="drawer.open" />
      </div>
      <CalendarSidebar :meetings="data ?? []" :today="today" @select="drawer.open" />
    </div>

    <Modal
      v-if="dayModal"
      :title="`${dayModal.getDate()} ${RU_MONTHS[dayModal.getMonth()]} ${dayModal.getFullYear()}`"
      @close="dayModal = null"
    >
      <ul class="space-y-1">
        <li v-for="m in dayMeetings" :key="m.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-md border border-line-2 px-3 py-2 text-left hover:bg-bg-tint"
            @click="openFromModal(m.id)"
          >
            <span class="w-12 shrink-0 text-[12px] text-ink-3 tabular">
              {{ hhmm(m.date) }}
            </span>
            <Avatar :name="m.member_name" :hue="m.hue" size="sm" />
            <span class="flex-1 truncate text-[13px] text-ink">{{ m.member_name }}</span>
            <Pill :variant="PILL[m.state] ?? 'default'" dot>{{ STATE_META[m.state]?.label ?? m.state }}</Pill>
          </button>
        </li>
      </ul>
    </Modal>
  </div>
</template>
