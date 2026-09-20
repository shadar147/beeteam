<script setup lang="ts">
import { Primitive } from "reka-ui";
import { cn } from "~/lib/utils";
import { buttonVariants, type ButtonVariants } from "./button";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants["variant"];
    size?: ButtonVariants["size"];
    asChild?: boolean;
    class?: string;
  }>(),
  { asChild: false },
);
</script>

<template>
  <Primitive as="button" :as-child="asChild" :class="cn(buttonVariants({ variant, size }), props.class)">
    <slot />
  </Primitive>
</template>
