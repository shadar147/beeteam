import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api } from "~/lib/api/client";
import type { components } from "~/lib/api/schema";
import type { UpdateMeetingRequest } from "~/lib/meeting-form";

export type TemplateDetail = components["schemas"]["TemplateDetail"];
export type FieldDef = components["schemas"]["FieldDef"];
export type MeetingDetail = components["schemas"]["MeetingDetail"];

export function useTemplate(id: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery<TemplateDetail>({
    queryKey: ["template", computed(() => toValue(id))],
    enabled: computed(() => toValue(id) != null),
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/templates/{id}", { params: { path: { id: toValue(id)! } } });
      if (error) throw error;
      return data!;
    },
  });
}

/** Invalidate everything that reflects a member's meetings. */
function useInvalidateMeetings() {
  const qc = useQueryClient();
  return (memberId: string, meetingId?: string) => {
    qc.invalidateQueries({ queryKey: ["member-meetings", memberId] });
    qc.invalidateQueries({ queryKey: ["member", memberId] });
    if (meetingId) qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
  };
}

export function useCreateMeeting() {
  const invalidate = useInvalidateMeetings();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await api.POST("/v1/meetings", { body: { member_id: memberId } });
      if (error) throw error;
      return data!;
    },
    onSuccess: (m) => invalidate(m.member_id, m.id),
  });
}

export function useCompleteMeeting() {
  const invalidate = useInvalidateMeetings();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST("/v1/meetings/{id}/complete", { params: { path: { id } } });
      if (error) throw error;
      return data!;
    },
    onSuccess: (m) => invalidate(m.member_id, m.id),
  });
}

export function useDeleteMeeting() {
  const invalidate = useInvalidateMeetings();
  return useMutation({
    mutationFn: async (vars: { id: string; memberId: string }) => {
      const { error } = await api.DELETE("/v1/meetings/{id}", { params: { path: { id: vars.id } } });
      if (error) throw error;
      return vars;
    },
    onSuccess: (vars) => invalidate(vars.memberId, vars.id),
  });
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Debounced autosave PATCH. `schedule(patch)` coalesces rapid edits into one
 * request after `delay` ms; `flush()` sends any pending patch immediately.
 */
export function useMeetingAutosave(
  meetingId: MaybeRefOrGetter<string>,
  memberId: MaybeRefOrGetter<string>,
  delay = 800,
): { schedule: (patch: UpdateMeetingRequest) => void; flush: () => void; status: ComputedRef<SaveStatus> } {
  const invalidate = useInvalidateMeetings();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: UpdateMeetingRequest | null = null;

  const mutation = useMutation({
    mutationFn: async (patch: UpdateMeetingRequest) => {
      const { data, error } = await api.PATCH("/v1/meetings/{id}", {
        params: { path: { id: toValue(meetingId) } },
        body: patch,
      });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => invalidate(toValue(memberId), toValue(meetingId)),
  });

  const send = () => {
    if (pending) {
      mutation.mutate(pending);
      pending = null;
    }
  };

  const schedule = (patch: UpdateMeetingRequest) => {
    pending = patch;
    if (timer) clearTimeout(timer);
    timer = setTimeout(send, delay);
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    send();
  };

  const status = computed<SaveStatus>(() =>
    mutation.isPending.value
      ? "saving"
      : mutation.isError.value
        ? "error"
        : mutation.isSuccess.value
          ? "saved"
          : "idle",
  );

  return { schedule, flush, status };
}
