<script setup lang="ts">
import { Layers } from "lucide-vue-next";
</script>

<template>
  <div class="rounded-xl border border-line bg-bg-elev p-7 text-center">
    <span class="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-bg-tint text-ink-3">
      <Layers :size="22" :stroke-width="1.5" />
    </span>
    <div class="text-[14px] font-semibold text-ink-2">Грейд не назначен</div>
    <div class="mt-1 text-[12.5px] text-ink-3">
      Эта роль использует другую карьерную лестницу (дизайн / менеджмент).
    </div>
  </div>
</template>
