<script setup lang="ts">
import { computed, ref } from "vue";
import Modal from "~/components/Modal.vue";
import DevItemForm, { type DevItemValues } from "~/components/goals/DevItemForm.vue";
import { useCreateDevItem, useUpdateDevItem, useDeleteDevItem } from "~/lib/query/goals";
import type { DevItem } from "~/lib/query/profile";

const props = defineProps<{ memberId: string; item?: DevItem }>();
const emit = defineEmits<{ close: [] }>();

const create = useCreateDevItem(() => props.memberId);
const update = useUpdateDevItem(() => props.memberId);
const del = useDeleteDevItem(() => props.memberId);
const error = ref<string | null>(null);
const pending = computed(() => create.isPending.value || update.isPending.value || del.isPending.value);

const onClose = () => emit("close");

function submit(v: DevItemValues) {
  error.value = null;
  const onError = () => (error.value = "Не удалось сохранить");
  if (props.item) update.mutate({ id: props.item.id, body: v }, { onSuccess: onClose, onError });
  else create.mutate({ member_id: props.memberId, ...v }, { onSuccess: onClose, onError });
}
function remove() {
  if (props.item && confirm("Удалить пункт?"))
    del.mutate(props.item.id, { onSuccess: onClose, onError: () => (error.value = "Не удалось удалить") });
}
</script>

<template>
  <Modal :title="item ? 'Изменить пункт' : 'Новый пункт развития'" @close="onClose">
    <DevItemForm :initial="item" :on-delete="item ? remove : undefined" :pending="pending" :error="error" @submit="submit" />
  </Modal>
</template>
