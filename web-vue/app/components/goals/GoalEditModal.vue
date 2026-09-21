<script setup lang="ts">
import { computed, ref } from "vue";
import Modal from "~/components/Modal.vue";
import OkrForm, { type OkrValues } from "~/components/goals/OkrForm.vue";
import { useCreateGoal, useUpdateGoal, useDeleteGoal } from "~/lib/query/goals";
import type { Goal } from "~/lib/query/profile";

const props = defineProps<{ memberId: string; goal?: Goal }>();
const emit = defineEmits<{ close: [] }>();

const create = useCreateGoal(() => props.memberId);
const update = useUpdateGoal(() => props.memberId);
const del = useDeleteGoal(() => props.memberId);
const error = ref<string | null>(null);
const pending = computed(() => create.isPending.value || update.isPending.value || del.isPending.value);

const onClose = () => emit("close");

function submit(v: OkrValues) {
  error.value = null;
  const onError = () => (error.value = "Не удалось сохранить");
  if (props.goal) update.mutate({ id: props.goal.id, body: v }, { onSuccess: onClose, onError });
  else create.mutate({ member_id: props.memberId, ...v }, { onSuccess: onClose, onError });
}
function remove() {
  if (props.goal && confirm("Удалить цель?"))
    del.mutate(props.goal.id, { onSuccess: onClose, onError: () => (error.value = "Не удалось удалить") });
}
</script>

<template>
  <Modal :title="goal ? 'Изменить цель' : 'Новая цель'" @close="onClose">
    <OkrForm :initial="goal" :on-delete="goal ? remove : undefined" :pending="pending" :error="error" @submit="submit" />
  </Modal>
</template>
