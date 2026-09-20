<script setup lang="ts">
import GradesClient from "~/components/grades/GradesClient.vue";
import { hasPermission } from "~/lib/permissions";

const user = useSessionUser(); // middleware already guaranteed non-null
</script>

<template>
  <GradesClient
    :can-edit="user ? hasPermission(user, 'edit_framework') : false"
    :can-edit-bands="user ? hasPermission(user, 'edit_salary_bands') : false"
  />
</template>
