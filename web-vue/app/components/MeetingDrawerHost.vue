<script setup lang="ts">
import { useDrawerStore } from "~/stores/drawer";
import MeetingDrawer from "~/components/MeetingDrawer.vue";

const drawer = useDrawerStore();
</script>

<template>
  <MeetingDrawer v-if="drawer.openMeetingId" :meeting-id="drawer.openMeetingId" @close="drawer.close()" />
</template>
