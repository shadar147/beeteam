<script setup lang="ts">
import { computed, ref } from "vue";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-vue-next";
import Avatar from "~/components/Avatar.vue";
import {
  useTeams, useAssignableLeads, useCreateTeam, useUpdateTeam, useDeleteTeam,
  type TeamRow, type TeamInput,
} from "~/lib/query/teams";
import TeamEditModal from "~/components/admin/TeamEditModal.vue";

const GRID = { gridTemplateColumns: "minmax(180px,1.4fr) 1.2fr 110px 130px 44px" };

/** Dark ink on light colors, white on dark — keeps the initials readable on any team color. */
function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#1A1812";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1A1812" : "#FFFFFF";
}

const { data: teams, isLoading, isError } = useTeams();
const { data: leads } = useAssignableLeads();
const createTeam = useCreateTeam();
const updateTeam = useUpdateTeam();
const deleteTeam = useDeleteTeam();

const modal = ref<{ open: boolean; team: TeamRow | null }>({ open: false, team: null });
const menuFor = ref<string | null>(null);
const error = ref<string | null>(null);

const rows = computed(() => teams.value ?? []);
const totalMembers = computed(() => rows.value.reduce((s, t) => s + t.member_count, 0));
const noLead = computed(() => rows.value.filter((t) => t.lead_id == null).length);
const saving = computed(() => createTeam.isPending.value || updateTeam.isPending.value);

function openModal(team: TeamRow | null) {
  menuFor.value = null;
  error.value = null;
  modal.value = { open: true, team };
}

async function save(body: TeamInput) {
  error.value = null;
  try {
    if (modal.value.team) await updateTeam.mutateAsync({ id: modal.value.team.id, body });
    else await createTeam.mutateAsync(body);
    modal.value = { open: false, team: null };
  } catch {
    error.value = "Не удалось сохранить команду. Попробуйте ещё раз.";
  }
}

async function remove(t: TeamRow) {
  menuFor.value = null;
  if (!confirm(`Удалить команду «${t.name}»?`)) return;
  error.value = null;
  try {
    await deleteTeam.mutateAsync(t.id);
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status;
    error.value = status === 409
      ? "Нельзя удалить команду с сотрудниками — сначала переместите или удалите их."
      : "Не удалось удалить команду.";
  }
}
</script>

<template>
  <div v-if="isLoading" class="p-6 text-[13px] text-ink-3">Загрузка…</div>
  <div v-else-if="isError" class="p-6 text-[13px] text-miss">Не удалось загрузить команды.</div>
  <div v-else class="p-6">
    <div class="mb-[18px] flex items-start justify-between gap-3">
      <div>
        <h1 class="text-[20px] font-semibold text-ink">Команды</h1>
        <p class="text-[13px] text-ink-3 tabular">{{ rows.length }} команд · {{ totalMembers }} сотрудников · {{ noLead }} без лида</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
        @click="openModal(null)"
      >
        <Plus :size="14" /> Новая команда
      </button>
    </div>

    <div v-if="error" class="mb-4 rounded-lg border border-miss/30 bg-miss-soft p-3 text-[12.5px] text-miss">{{ error }}</div>

    <div class="overflow-hidden rounded-xl border border-line bg-bg-elev">
      <div
        class="grid items-center gap-4 bg-bg-tint px-[18px] py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"
        :style="GRID"
      >
        <div>Команда</div><div>Лид</div><div>Сотрудников</div><div>Статус</div><div></div>
      </div>
      <div v-for="t in rows" :key="t.id" class="grid items-center gap-4 border-t border-line-2 px-[18px] py-3" :style="GRID">
        <div class="flex items-center gap-2.5">
          <span
            class="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-[11px] font-bold tabular"
            :style="{ background: t.color, color: readableOn(t.color) }"
          >{{ t.name.slice(0, 2).toUpperCase() }}</span>
          <span class="text-[13.5px] font-semibold text-ink">{{ t.name }}</span>
        </div>
        <div class="flex items-center gap-2">
          <template v-if="t.lead_id != null">
            <Avatar :name="t.lead_name ?? ''" :hue="t.lead_hue ?? 40" size="sm" /><span class="text-[13px]">{{ t.lead_name }}</span>
          </template>
          <span v-else class="text-[13px] italic text-miss">— не назначен —</span>
        </div>
        <div class="tabular text-[14px] font-semibold text-ink">{{ t.member_count }}</div>
        <div>
          <span v-if="t.lead_id == null" class="rounded-full bg-miss-soft px-2 py-0.5 text-[11px] font-medium text-miss">Без лида</span>
          <span v-else class="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok">Активна</span>
        </div>
        <div class="relative">
          <button
            type="button"
            :aria-label="`Меню ${t.name}`"
            class="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint"
            @click="menuFor = menuFor === t.id ? null : t.id"
          ><MoreHorizontal :size="14" /></button>
          <template v-if="menuFor === t.id">
            <div class="fixed inset-0 z-10" @click="menuFor = null" />
            <div class="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-line bg-bg-elev shadow-pop">
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-bg-tint"
                @click="openModal(t)"
              ><Pencil :size="13" /> Редактировать</button>
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-miss hover:bg-bg-tint"
                @click="remove(t)"
              ><Trash2 :size="13" /> Удалить</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <TeamEditModal
      v-if="modal.open"
      :initial="modal.team"
      :leads="leads ?? []"
      :saving="saving"
      :error="error"
      @close="modal = { open: false, team: null }"
      @save="save"
    />
  </div>
</template>
