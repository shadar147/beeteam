<script setup lang="ts">
import NoAccess from "~/components/NoAccess.vue";
import CalendarClient from "~/components/calendar/CalendarClient.vue";
import { hasPermission } from "~/lib/permissions";

const user = useSessionUser(); // middleware already guaranteed non-null
const canManage = computed(() => !user.value || hasPermission(user.value, "manage_team"));
</script>

<template>
  <CalendarClient v-if="canManage" :team-id="user?.teamId ?? null" />
  <NoAccess v-else />
</template>
