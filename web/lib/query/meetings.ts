import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useCallback } from "react";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { UpdateMeetingRequest } from "@/lib/meeting-form";

export type TemplateDetail = components["schemas"]["TemplateDetail"];
export type FieldDef = components["schemas"]["FieldDef"];
export type MeetingDetail = components["schemas"]["MeetingDetail"];

export function useTemplate(id: string | null | undefined) {
  return useQuery<TemplateDetail>({
    queryKey: ["template", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/templates/{id}", { params: { path: { id: id! } } });
      if (error) throw error;
      return data!;
    },
  });
}

/** Invalidate everything that reflects a member's meetings. */
function useInvalidateMeetings() {
  const qc = useQueryClient();
  return useCallback(
    (memberId: string, meetingId?: string) => {
      qc.invalidateQueries({ queryKey: ["member-meetings", memberId] });
      qc.invalidateQueries({ queryKey: ["member", memberId] });
      if (meetingId) qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
    },
    [qc],
  );
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
export function useMeetingAutosave(meetingId: string, memberId: string, delay = 800) {
  const invalidate = useInvalidateMeetings();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<UpdateMeetingRequest | null>(null);

  const mutation = useMutation({
    mutationFn: async (patch: UpdateMeetingRequest) => {
      const { data, error } = await api.PATCH("/v1/meetings/{id}", {
        params: { path: { id: meetingId } },
        body: patch,
      });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => invalidate(memberId, meetingId),
  });

  const send = useCallback(() => {
    if (pending.current) {
      mutation.mutate(pending.current);
      pending.current = null;
    }
  }, [mutation]);

  const schedule = useCallback(
    (patch: UpdateMeetingRequest) => {
      pending.current = patch;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(send, delay);
    },
    [send, delay],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    send();
  }, [send]);

  const status: SaveStatus = mutation.isPending
    ? "saving"
    : mutation.isError
      ? "error"
      : mutation.isSuccess
        ? "saved"
        : "idle";

  return { schedule, flush, status };
}
