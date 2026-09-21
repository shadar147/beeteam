<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import ProfileHeader from "~/components/ProfileHeader.vue";
import NoAccess from "~/components/NoAccess.vue";
import HistoryTab from "~/components/profile/HistoryTab.vue";
import GoalsTab from "~/components/profile/GoalsTab.vue";
import FilesTab from "~/components/profile/FilesTab.vue";
import GradeTab from "~/components/profile/GradeTab.vue";
import { api } from "~/lib/api/client";
import { hasPermission } from "~/lib/permissions";
import type { MemberDetail } from "~/lib/query/profile";

const TABS = [
  { key: "history", label: "История 1-2-1" },
  { key: "goals", label: "Цели и развитие" },
  { key: "grade", label: "Грейд" },
  { key: "files", label: "Файлы" },
];

const route = useRoute();
const user = useSessionUser();

const id = computed(() => String(route.params.id));
const tab = computed(() => (typeof route.query.tab === "string" ? route.query.tab : "history"));
const canManage = computed(() => !user.value || hasPermission(user.value, "manage_team"));

// Same key as useMemberDetail (meeting mutations invalidate it), but fetched here
// because the 403 branch needs the HTTP status, which the hook's error drops.
const member = useQuery<MemberDetail, { status: number }>({
  queryKey: ["member", id],
  retry: false,
  queryFn: async () => {
    const { data, error, response } = await api.GET("/v1/members/{id}", { params: { path: { id: id.value } } });
    if (error) throw { status: response.status };
    return data!;
  },
});
const { data: memberData, error: memberError } = member;
</script>

<template>
  <!-- Error branches only before the first successful load: the key is refetched after
       every meeting mutation, and a transient failure must not unmount an open tab/modal. -->
  <div v-if="!memberData && memberError?.status === 403" class="p-10 text-center">
    <p class="text-[15px] font-medium text-ink-2">Нет доступа к этому профилю</p>
    <RouterLink to="/" class="mt-2 inline-block text-[13px] text-brand-text underline">← Вернуться к команде</RouterLink>
  </div>
  <div v-else-if="!memberData && memberError" class="p-10 text-center text-[14px] text-miss">Не удалось загрузить профиль.</div>
  <div v-else-if="memberData">
    <ProfileHeader :member="memberData" />
    <NoAccess v-if="!canManage" />
    <div v-else class="p-6">
      <nav class="-mt-2 mb-5 flex gap-1 border-b border-line">
        <RouterLink
          v-for="t in TABS"
          :key="t.key"
          :to="`/profile/${id}?tab=${t.key}`"
          :data-active="tab === t.key"
          class="-mb-px border-b-2 border-transparent px-3 py-2.5 text-[13px] text-ink-2 hover:text-ink data-[active=true]:border-brand data-[active=true]:font-medium data-[active=true]:text-ink"
        >
          {{ t.label }}
        </RouterLink>
      </nav>
      <GoalsTab v-if="tab === 'goals'" :member-id="id" />
      <GradeTab v-else-if="tab === 'grade'" :member-id="id" />
      <FilesTab v-else-if="tab === 'files'" :member-id="id" />
      <HistoryTab v-else :member-id="id" />
    </div>
  </div>
</template>
