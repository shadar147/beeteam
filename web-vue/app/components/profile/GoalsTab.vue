<script setup lang="ts">
import { ref } from "vue";
import OkrCard from "~/components/OkrCard.vue";
import DevItemRow from "~/components/DevItemRow.vue";
import CompetencyBar from "~/components/CompetencyBar.vue";
import GoalEditModal from "~/components/goals/GoalEditModal.vue";
import DevItemEditModal from "~/components/goals/DevItemEditModal.vue";
import CompetencyEditModal from "~/components/goals/CompetencyEditModal.vue";
import { useMemberGoals, type Goal, type DevItem, type Competency } from "~/lib/query/profile";

type ModalState =
  | { type: "okr"; entity?: Goal }
  | { type: "dev"; entity?: DevItem }
  | { type: "comp"; entity?: Competency }
  | null;

const addBtn = "rounded-md border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:bg-bg-tint";

const props = defineProps<{ memberId: string }>();
const { data, isLoading, isError, refetch } = useMemberGoals(() => props.memberId);
const modal = ref<ModalState>(null);
</script>

<template>
  <div v-if="isLoading" class="text-[13px] text-ink-3">Загрузка…</div>
  <div v-else-if="isError" class="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
    Не удалось загрузить цели. <button class="underline" @click="refetch()">Повторить</button>
  </div>
  <div v-else-if="data" class="grid grid-cols-[1.45fr_1fr] gap-6">
    <div class="space-y-6">
      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[15px] font-semibold text-ink">Цели на {{ data.okrs[0]?.quarter ?? "квартал" }}</h2>
          <button :class="addBtn" @click="modal = { type: 'okr' }">+ Добавить</button>
        </div>
        <div v-if="data.okrs.length" class="space-y-3">
          <OkrCard v-for="o in data.okrs" :key="o.id" :okr="o" @edit="modal = { type: 'okr', entity: o }" />
        </div>
        <p v-else class="text-[13px] text-ink-3">Целей пока нет</p>
      </section>
      <section>
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-[15px] font-semibold text-ink">План развития</h2>
          <button :class="addBtn" @click="modal = { type: 'dev' }">+ Добавить</button>
        </div>
        <div v-if="data.development.length" class="rounded-lg border border-line bg-bg-elev px-4">
          <DevItemRow v-for="d in data.development" :key="d.id" :item="d" @edit="modal = { type: 'dev', entity: d }" />
        </div>
        <p v-else class="text-[13px] text-ink-3">План развития пуст</p>
      </section>
    </div>
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-[15px] font-semibold text-ink">Компетенции</h2>
        <button :class="addBtn" @click="modal = { type: 'comp' }">+ Добавить</button>
      </div>
      <div class="rounded-lg border border-line bg-bg-elev p-4">
        <template v-if="data.competencies.length">
          <CompetencyBar v-for="c in data.competencies" :key="c.id" :competency="c" @edit="modal = { type: 'comp', entity: c }" />
        </template>
        <p v-else class="text-[13px] text-ink-3">Нет данных</p>
      </div>
    </section>

    <GoalEditModal v-if="modal?.type === 'okr'" :member-id="memberId" :goal="modal.entity" @close="modal = null" />
    <DevItemEditModal v-if="modal?.type === 'dev'" :member-id="memberId" :item="modal.entity" @close="modal = null" />
    <CompetencyEditModal v-if="modal?.type === 'comp'" :member-id="memberId" :competency="modal.entity" @close="modal = null" />
  </div>
</template>
