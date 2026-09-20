<script setup lang="ts">
import NoAccess from "~/components/NoAccess.vue";
import TeamsAdminClient from "~/components/admin/TeamsAdminClient.vue";
import { hasPermission } from "~/lib/permissions";

const user = useSessionUser(); // middleware already guaranteed non-null
const canManage = computed(() => !user.value || hasPermission(user.value, "manage_workspace"));
</script>

<template>
  <TeamsAdminClient v-if="canManage" />
  <NoAccess v-else />
</template>
