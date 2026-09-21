<script setup lang="ts">
import NoAccess from "~/components/NoAccess.vue";
import ApprovalsClient from "~/components/approvals/ApprovalsClient.vue";
import { hasPermission } from "~/lib/permissions";

const user = useSessionUser(); // middleware already guaranteed non-null
const denied = computed(() => user.value != null && !hasPermission(user.value, "approve_reviews"));
</script>

<template>
  <NoAccess v-if="denied" />
  <ApprovalsClient v-else />
</template>
