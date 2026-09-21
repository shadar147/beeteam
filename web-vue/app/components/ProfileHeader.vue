<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import Avatar from "~/components/Avatar.vue";
import Pill from "~/components/Pill.vue";
import MoodTrendBars from "~/components/MoodTrendBars.vue";
import ProfileActions from "~/components/ProfileActions.vue";
import type { MemberDetail } from "~/lib/query/profile";

const props = defineProps<{ member: MemberDetail }>();
const latestMood = computed(() => props.member.mood_trend.at(-1) ?? null);
</script>

<template>
  <div class="border-b border-line bg-bg-elev px-6 pb-4 pt-5">
    <RouterLink to="/" class="text-[12px] text-ink-3 hover:text-ink-2">← Моя команда / {{ member.name }}</RouterLink>
    <div class="mt-3 flex items-start gap-4">
      <Avatar :name="member.name" :hue="member.hue" size="xl" />
      <div class="min-w-0 flex-1">
        <h1 class="text-[20px] font-semibold text-ink">{{ member.name }}</h1>
        <div class="mt-0.5 text-[13px] text-ink-3">
          {{ member.role }} · с {{ member.joined }} · {{ member.email }} · {{ member.tz }}
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <Pill :variant="member.status === 'ok' ? 'ok' : member.status === 'warn' ? 'warn' : 'miss'" dot>
            {{ member.status === "ok" ? "В норме" : member.status === "warn" ? "Внимание" : "Риск" }}
          </Pill>
          <Pill variant="info">{{ member.meetings_total }} встреч за год</Pill>
          <span v-if="latestMood != null" class="inline-flex items-center gap-1.5">
            <MoodTrendBars :trend="member.mood_trend" />
            <span class="text-[12px] text-ink-3 tabular">Настроение {{ latestMood }}/10</span>
          </span>
          <Pill v-for="t in member.tags" :key="t">{{ t }}</Pill>
        </div>
      </div>
      <ProfileActions :member-id="member.id" />
    </div>
  </div>
</template>
