<script setup lang="ts">
const user = useSessionUser();
</script>
<template><div class="p-10">boot ok: {{ user?.name }}</div></template>
