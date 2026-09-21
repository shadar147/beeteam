<script setup lang="ts">
import { RouterLink } from "vue-router";
import { ShieldOff } from "lucide-vue-next";
</script>

<template>
  <div class="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
    <ShieldOff :size="28" class="text-ink-4" />
    <div class="text-[15px] font-semibold text-ink">Недостаточно прав</div>
    <p class="max-w-[360px] text-[12.5px] leading-relaxed text-ink-3">
      У вашей роли нет доступа к этому разделу.
    </p>
    <RouterLink to="/grades" class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
      К грейдам
    </RouterLink>
  </div>
</template>
