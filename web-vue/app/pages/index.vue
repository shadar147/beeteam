<script setup lang="ts">
import NoAccess from "~/components/NoAccess.vue";
import TeamListClient from "~/components/TeamListClient.vue";
import { hasPermission } from "~/lib/permissions";

const user = useSessionUser(); // middleware already guaranteed non-null
const canManage = computed(() => !user.value || hasPermission(user.value, "manage_team"));

// HR lands on the queue instead of an empty team screen.
const toApprovals = !canManage.value && hasPermission(user.value!, "approve_reviews");
if (toApprovals) await navigateTo("/approvals", { replace: true });
</script>

<template>
  <TeamListClient v-if="canManage" :team-id="user?.teamId ?? null" />
  <NoAccess v-else-if="!toApprovals" />
</template>
