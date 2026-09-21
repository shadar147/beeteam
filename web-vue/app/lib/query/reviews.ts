import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { api } from "~/lib/api/client";
import type { components } from "~/lib/api/schema";

export type Review = components["schemas"]["Review"];
export type ReviewScore = components["schemas"]["ReviewScore"];
export type UpdateReview = components["schemas"]["UpdateReview"];
export type CalibrationPeer = components["schemas"]["CalibrationPeer"];

export function useMemberReviews(memberId: MaybeRefOrGetter<string>) {
  return useQuery<Review[]>({
    queryKey: ["member-reviews", computed(() => toValue(memberId))],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/reviews", { params: { path: { id: toValue(memberId) } } });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStartReview(memberId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/v1/members/{id}/reviews", { params: { path: { id: toValue(memberId) } } });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", toValue(memberId)] }),
  });
}

export function useUpdateReview(reviewId: MaybeRefOrGetter<string>, memberId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateReview) => {
      const { data, error } = await api.PATCH("/v1/reviews/{id}", {
        params: { path: { id: toValue(reviewId) } },
        body: patch,
      });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", toValue(memberId)] }),
  });
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Debounced PATCH autosave for the review wizard (same shape as useMeetingAutosave). */
export function useReviewAutosave(
  reviewId: MaybeRefOrGetter<string>,
  memberId: MaybeRefOrGetter<string>,
  delay = 800,
): {
  schedule: (patch: UpdateReview) => void;
  flush: () => void;
  cancel: () => void;
  status: ComputedRef<SaveStatus>;
} {
  const mutation = useUpdateReview(reviewId, memberId);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: UpdateReview | null = null;

  const send = () => {
    if (pending) {
      mutation.mutate(pending);
      pending = null;
    }
  };

  const schedule = (patch: UpdateReview) => {
    // Merge so a summary keystroke doesn't drop a queued scores patch.
    pending = { ...pending, ...patch };
    if (timer) clearTimeout(timer);
    timer = setTimeout(send, delay);
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    send();
  };

  const cancel = () => {
    if (timer) clearTimeout(timer);
    pending = null;
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

  return { schedule, flush, cancel, status };
}

export function useFinalizeReview(memberId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reviewId: string) => {
      const { data, error } = await api.POST("/v1/reviews/{id}/finalize", {
        params: { path: { id: reviewId } },
      });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", toValue(memberId)] }),
  });
}

export function useDeleteReview(memberId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await api.DELETE("/v1/reviews/{id}", { params: { path: { id: reviewId } } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", toValue(memberId)] }),
  });
}

export function useReviewCalibration(reviewId: MaybeRefOrGetter<string>) {
  return useQuery<CalibrationPeer[]>({
    queryKey: ["review-calibration", computed(() => toValue(reviewId))],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/reviews/{id}/calibration", {
        params: { path: { id: toValue(reviewId) } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
