<script setup lang="ts">
import { RouterLink } from "vue-router";
import { MoreHorizontal } from "lucide-vue-next";
import Avatar from "~/components/Avatar.vue";
import Pill from "~/components/Pill.vue";
import MoodTrendBars from "~/components/MoodTrendBars.vue";
import type { components } from "~/lib/api/schema";

type Member = components["schemas"]["MemberRow"];

defineProps<{ members: Member[] }>();

const RU_MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "не назначено";
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "сегодня";
  if (days > 0) return `${days} дн. назад`;
  return `через ${-days} дн.`;
}
</script>

<template>
  <div
    v-if="members.length === 0"
    class="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-[13px] text-ink-3"
  >
    Никого не нашлось — попробуйте изменить фильтры.
  </div>
  <div v-else class="overflow-hidden rounded-lg border border-line bg-bg-elev">
    <div class="grid grid-cols-[2fr_1.2fr_1.2fr_1.3fr_1fr_44px] gap-3 border-b border-line bg-bg-tint px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
      <div>Сотрудник</div><div>Последняя 1-2-1</div><div>Следующая встреча</div>
      <div>Настроение, тренд</div><div>Статус</div><div />
    </div>
    <RouterLink
      v-for="m in members"
      :key="m.id"
      :to="`/profile/${m.id}`"
      class="grid grid-cols-[2fr_1.2fr_1.2fr_1.3fr_1fr_44px] items-center gap-3 border-b border-line-2 px-4 py-3 last:border-b-0 hover:bg-bg-tint"
    >
      <div class="flex items-center gap-3 min-w-0">
        <Avatar :name="m.name" :hue="m.hue" size="md" />
        <div class="min-w-0">
          <div class="truncate text-[13.5px] font-semibold">{{ m.name }}</div>
          <div class="flex items-center gap-1.5 text-[12px] text-ink-3">
            <span class="truncate">{{ m.role }}</span>
            <Pill v-for="t in m.tags" :key="t" variant="accent" class="h-[18px] text-[10.5px]">{{ t }}</Pill>
          </div>
        </div>
      </div>
      <div>
        <div class="text-[13px] tabular">{{ fmtDate(m.last_meet) }}</div>
        <div class="text-[11.5px] text-ink-3">{{ ago(m.last_meet) }}</div>
      </div>
      <div>
        <div class="text-[13px] tabular">{{ fmtDate(m.next_meet) }}</div>
        <div class="text-[11.5px] text-ink-3">{{ ago(m.next_meet) }}</div>
      </div>
      <div class="flex items-center gap-2.5">
        <MoodTrendBars :trend="m.mood_trend" />
        <span class="tabular text-[13px] font-semibold">
          {{ m.mood_trend.length ? m.mood_trend[m.mood_trend.length - 1]!.toFixed(1) : "—" }}
        </span>
      </div>
      <div>
        <Pill v-if="m.status === 'ok'" variant="ok" dot>В графике</Pill>
        <Pill v-else-if="m.status === 'warn'" variant="warn" dot>Внимание</Pill>
        <Pill v-else variant="miss" dot>Просрочена</Pill>
      </div>
      <!-- .prevent keeps the row link from navigating (RouterLink skips defaultPrevented clicks) -->
      <button
        type="button"
        aria-label="Действия"
        class="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-sunken"
        @click.prevent
      >
        <MoreHorizontal :size="15" />
      </button>
    </RouterLink>
  </div>
</template>
