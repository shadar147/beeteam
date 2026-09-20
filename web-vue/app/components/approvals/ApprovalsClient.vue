<script setup lang="ts">
import { computed, ref } from "vue";
import Avatar from "~/components/Avatar.vue";
import Pill from "~/components/Pill.vue";
import { cn } from "~/lib/utils";
import { DECISION_LABEL } from "~/components/grades/ReviewHistory";
import { usePendingReviews, useApproveReview, useRejectReview } from "~/lib/query/approvals";
import ApprovalDetail from "./ApprovalDetail.vue";

function fmt(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

const { data, isLoading, isError } = usePendingReviews();
const approve = useApproveReview();
const reject = useRejectReview();
const selectedId = ref<string | null>(null);

const items = computed(() => data.value ?? []);
const selected = computed(
  () => items.value.find((p) => p.review.id === selectedId.value) ?? items.value[0] ?? null,
);
const busy = computed(() => approve.isPending.value || reject.isPending.value);

const clearSelection = () => { selectedId.value = null; };
const onApprove = (reviewId: string) => approve.mutate({ reviewId }, { onSuccess: clearSelection });
const onReject = (reviewId: string, comment: string) =>
  reject.mutate({ reviewId, comment }, { onSuccess: clearSelection });
</script>

<template>
  <div v-if="isLoading" class="p-6 text-[13px] text-ink-3">Загрузка…</div>
  <div v-else-if="isError" class="m-6 rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">Не удалось загрузить очередь.</div>
  <div v-else class="p-6">
    <h1 class="mb-1 text-[20px] font-bold tracking-tight text-ink">Согласование</h1>
    <p class="mb-5 text-[12.5px] text-ink-3">
      Performance Review, ожидающие решения HR · {{ items.length }}
    </p>

    <div v-if="items.length === 0" class="rounded-xl border border-line bg-bg-elev p-8 text-center text-[13px] text-ink-3">
      Нет ревью на согласовании.
    </div>
    <div v-else class="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div class="space-y-2">
        <button
          v-for="p in items"
          :key="p.review.id"
          type="button"
          :data-active="selected?.review.id === p.review.id"
          :class="cn(
            'flex w-full items-center gap-3 rounded-xl border p-3 text-left',
            selected?.review.id === p.review.id
              ? 'border-brand bg-brand-soft/40'
              : 'border-line bg-bg-elev hover:bg-bg-tint',
          )"
          @click="selectedId = p.review.id"
        >
          <Avatar :name="p.member_name" :hue="p.member_hue" size="sm" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13px] font-semibold text-ink">{{ p.member_name }}</div>
            <div class="text-[11.5px] text-ink-3">
              {{ p.team_name }} · {{ p.discipline_label }} ·
              <span class="tabular">IC{{ p.review.from_grade_ord }} → IC{{ p.review.to_grade_ord ?? p.review.from_grade_ord }}</span>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1">
            <Pill variant="accent">
              {{ p.review.decision ? DECISION_LABEL[p.review.decision] ?? p.review.decision : "—" }}
            </Pill>
            <span class="text-[11px] text-ink-4">{{ fmt(p.review.finalized_at) }}</span>
          </div>
        </button>
      </div>

      <ApprovalDetail v-if="selected" :item="selected" :busy="busy" @approve="onApprove" @reject="onReject" />
    </div>
  </div>
</template>
