<script setup lang="ts">
import Sidebar from "~/components/Sidebar.vue";
import MeetingDrawerHost from "~/components/MeetingDrawerHost.vue";

// Non-null on every page using this layout: middleware/auth.global.ts loads it
// (or bounces to /login) before the route renders.
const user = useSessionUser();

// Clear first: the auth middleware sends a signed-in user away from /login.
async function onLogout() {
  user.value = null;
  await navigateTo("/login");
}
</script>

<template>
  <div v-if="user" class="flex min-h-screen bg-bg text-ink">
    <Sidebar :user="user" @logout="onLogout" />
    <main class="flex-1 min-w-0"><slot /></main>
    <MeetingDrawerHost />
  </div>
</template>
