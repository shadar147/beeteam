<script setup lang="ts">
import { computed, ref } from "vue";
import Modal from "~/components/Modal.vue";
import CompetencyForm, { type CompetencyValues } from "~/components/goals/CompetencyForm.vue";
import { useCreateCompetency, useUpdateCompetency, useDeleteCompetency } from "~/lib/query/goals";
import type { Competency } from "~/lib/query/profile";

const props = defineProps<{ memberId: string; competency?: Competency }>();
const emit = defineEmits<{ close: [] }>();

const create = useCreateCompetency(() => props.memberId);
const update = useUpdateCompetency(() => props.memberId);
const del = useDeleteCompetency(() => props.memberId);
const error = ref<string | null>(null);
const pending = computed(() => create.isPending.value || update.isPending.value || del.isPending.value);

const onClose = () => emit("close");

function submit(v: CompetencyValues) {
  error.value = null;
  const onError = () => (error.value = "Не удалось сохранить");
  if (props.competency) update.mutate({ id: props.competency.id, body: v }, { onSuccess: onClose, onError });
  else create.mutate({ member_id: props.memberId, ...v }, { onSuccess: onClose, onError });
}
function remove() {
  if (props.competency && confirm("Удалить компетенцию?"))
    del.mutate(props.competency.id, { onSuccess: onClose, onError: () => (error.value = "Не удалось удалить") });
}
</script>

<template>
  <Modal :title="competency ? 'Изменить компетенцию' : 'Новая компетенция'" @close="onClose">
    <CompetencyForm :initial="competency" :on-delete="competency ? remove : undefined" :pending="pending" :error="error" @submit="submit" />
  </Modal>
</template>
