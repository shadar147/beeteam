import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Review = components["schemas"]["Review"];
export type ReviewScore = components["schemas"]["ReviewScore"];
export type UpdateReview = components["schemas"]["UpdateReview"];
export type CalibrationPeer = components["schemas"]["CalibrationPeer"];

export function useMemberReviews(memberId: string) {
  return useQuery<Review[]>({
    queryKey: ["member-reviews", memberId],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/reviews", { params: { path: { id: memberId } } });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStartReview(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/v1/members/{id}/reviews", { params: { path: { id: memberId } } });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", memberId] }),
  });
}

export function useUpdateReview(reviewId: string, memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateReview) => {
      const { data, error } = await api.PATCH("/v1/reviews/{id}", {
        params: { path: { id: reviewId } },
        body: patch,
      });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", memberId] }),
  });
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Debounced PATCH autosave for the review wizard (same shape as useMeetingAutosave). */
export function useReviewAutosave(reviewId: string, memberId: string, delay = 800) {
  const mutation = useUpdateReview(reviewId, memberId);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<UpdateReview | null>(null);

  const send = useCallback(() => {
    if (pending.current) {
      mutation.mutate(pending.current);
      pending.current = null;
    }
  }, [mutation]);

  const schedule = useCallback(
    (patch: UpdateReview) => {
      // Merge so a summary keystroke doesn't drop a queued scores patch.
      pending.current = { ...pending.current, ...patch };
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

export function useFinalizeReview(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reviewId: string) => {
      const { data, error } = await api.POST("/v1/reviews/{id}/finalize", {
        params: { path: { id: reviewId } },
      });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", memberId] }),
  });
}

export function useDeleteReview(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await api.DELETE("/v1/reviews/{id}", { params: { path: { id: reviewId } } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", memberId] }),
  });
}

export function useReviewCalibration(reviewId: string) {
  return useQuery<CalibrationPeer[]>({
    queryKey: ["review-calibration", reviewId],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/reviews/{id}/calibration", {
        params: { path: { id: reviewId } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
