<script setup lang="ts">
import { computed, type Component } from "vue";
import { RouterLink } from "vue-router";
import { Users, Calendar, Layers, SlidersHorizontal, Download, User, Settings, ClipboardCheck } from "lucide-vue-next";
import { cn } from "~/lib/utils";

const ICONS: Record<string, Component> = {
  team: Users,
  calendar: Calendar,
  layers: Layers,
  fields: SlidersHorizontal,
  download: Download,
  user: User,
  settings: Settings,
  approvals: ClipboardCheck,
};

const props = withDefaults(
  defineProps<{
    label: string;
    icon: string;
    count?: number;
    active?: boolean;
    disabled?: boolean;
    href?: string;
  }>(),
  { active: false, disabled: false },
);

const isLink = computed(() => !!props.href && !props.disabled);
const className = computed(() =>
  cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium cursor-default select-none",
    props.active ? "bg-brand-soft text-brand-text" : "text-ink-2 hover:bg-bg-tint",
    props.disabled && "opacity-45",
  ),
);
</script>

<template>
  <component
    :is="isLink ? RouterLink : 'div'"
    :to="isLink ? href : undefined"
    data-nav-item
    :aria-current="active ? 'page' : undefined"
    :aria-disabled="!isLink && disabled ? true : undefined"
    :class="className"
  >
    <component :is="ICONS[icon] ?? Users" :size="16" class="shrink-0" />
    <span class="flex-1">{{ label }}</span>
    <span v-if="count != null" class="tabular text-ink-3 text-xs">{{ count }}</span>
    <slot name="trailing" />
  </component>
</template>
