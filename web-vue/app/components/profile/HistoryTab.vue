<script setup lang="ts">
import { computed, ref } from "vue";
import MonthCalendar, { type CalMeeting } from "~/components/MonthCalendar.vue";
import MeetingDetailCard from "~/components/MeetingDetailCard.vue";
import Feed from "~/components/Feed.vue";
import { useMemberMeetings, useMeeting } from "~/lib/query/profile";

const props = defineProps<{ memberId: string }>();

const meetings = useMemberMeetings(() => props.memberId);
const selectedId = ref<string | null>(null);
const month = ref(new Date());
const detail = useMeeting(selectedId);

const items = computed(() => meetings.data.value ?? []);
const calMeetings = computed<CalMeeting[]>(() =>
  items.value.map((m) => ({ id: m.id, date: m.date, state: m.state })),
);
</script>

<template>
  <div v-if="meetings.isLoading.value" class="text-[13px] text-ink-3">Загрузка…</div>
  <div v-else-if="meetings.isError.value" class="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
    Не удалось загрузить встречи.
    <button class="underline" @click="meetings.refetch()">Повторить</button>
  </div>
  <div v-else class="grid grid-cols-[1.45fr_1fr] gap-6">
    <div class="space-y-4">
      <MonthCalendar
        :month="month"
        :today="new Date()"
        :meetings="calMeetings"
        :selected-id="selectedId"
        @select="selectedId = $event"
        @month-change="month = $event"
      />
      <MeetingDetailCard v-if="selectedId && detail.data.value" :meeting="detail.data.value" />
      <div v-else class="rounded-lg border border-dashed border-line-strong bg-bg-tint p-6 text-center text-[13px] text-ink-3">
        Выберите встречу в календаре или ленте
      </div>
    </div>
    <Feed :items="items" :active-id="selectedId" @select="selectedId = $event" />
  </div>
</template>
