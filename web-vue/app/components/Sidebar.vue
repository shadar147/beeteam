<script lang="ts">
import { defineComponent, h } from "vue";
import { usePendingReviews } from "~/lib/query/approvals";

// Own component so the pending query only runs when the approvals item is visible.
const ApprovalsCount = defineComponent({
  setup() {
    const pending = usePendingReviews();
    return () => {
      const n = pending.data.value?.length ?? 0;
      return n === 0 ? null : h("span", { class: "tabular text-ink-3 text-xs" }, n);
    };
  },
});
</script>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Bell, LogOut } from "lucide-vue-next";
import Logo from "~/components/Logo.vue";
import Avatar from "~/components/Avatar.vue";
import NavItem from "~/components/NavItem.vue";
import { hasPermission, type SessionUser } from "~/lib/permissions";
import { ADMIN_NAV, visibleNavItems, type Nav } from "./Sidebar";

const props = defineProps<{ user: SessionUser }>();
// The layout owns the session state: it clears it and navigates to /login.
const emit = defineEmits<{ logout: [] }>();

const route = useRoute();
const items = computed(() => visibleNavItems(props.user.permissions));
const isHr = computed(() => hasPermission(props.user, "approve_reviews"));
const canAdmin = computed(() => hasPermission(props.user, "manage_workspace"));

function isActive(n: Pick<Nav, "href">): boolean {
  if (!n.href) return false;
  return n.href === "/" ? route.path === "/" : route.path.startsWith(n.href);
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  emit("logout");
}
</script>

<template>
  <aside class="flex w-[232px] shrink-0 flex-col gap-4 border-r border-line bg-bg-elev p-4">
    <div class="flex items-center justify-between px-1.5">
      <Logo class="text-[15px]" />
      <button class="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint" title="Уведомления">
        <Bell :size="15" />
      </button>
    </div>

    <div class="flex flex-col gap-0.5">
      <div class="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">
        {{ isHr ? "HR" : "Команда" }}
      </div>
      <NavItem
        v-for="n in items"
        :key="n.id"
        :label="n.label"
        :icon="n.icon"
        :count="n.count"
        :active="isActive(n)"
        :disabled="n.disabled ?? false"
        :href="n.href"
      >
        <template v-if="n.id === 'approvals'" #trailing><ApprovalsCount /></template>
      </NavItem>
    </div>

    <div v-if="canAdmin" class="flex flex-col gap-0.5">
      <div class="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Администрирование</div>
      <NavItem
        v-for="n in ADMIN_NAV"
        :key="n.id"
        :label="n.label"
        :icon="n.icon"
        :href="n.href"
        :active="isActive(n)"
        :disabled="n.disabled ?? false"
      />
    </div>

    <div class="mt-auto flex items-center gap-2.5 rounded-md border border-line bg-bg-elev p-2.5">
      <Avatar :name="user.name" :hue="42" />
      <div class="min-w-0 flex-1">
        <div class="truncate text-[13px] font-semibold tracking-tight">{{ user.name }}</div>
        <div class="text-[11.5px] text-ink-3">{{ user.role }}</div>
      </div>
      <button class="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint" title="Выйти" aria-label="Выйти" @click="logout">
        <LogOut :size="14" />
      </button>
    </div>
  </aside>
</template>
