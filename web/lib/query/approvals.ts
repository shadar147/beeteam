import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type PendingReview = components["schemas"]["PendingReview"];

export function usePendingReviews() {
  return useQuery<PendingReview[]>({
    queryKey: ["pending-reviews"],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/reviews/pending");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useResolveMutation(action: "approve" | "reject") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reviewId, comment }: { reviewId: string; comment?: string }) => {
      const { data, error } =
        action === "approve"
          ? await api.POST("/v1/reviews/{id}/approve", { params: { path: { id: reviewId } } })
          : await api.POST("/v1/reviews/{id}/reject", {
              params: { path: { id: reviewId } },
              body: { comment: comment ?? "" },
            });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-reviews"] });
      qc.invalidateQueries({ queryKey: ["member-reviews"] });
    },
  });
}

export function useApproveReview() {
  return useResolveMutation("approve");
}

export function useRejectReview() {
  return useResolveMutation("reject");
}
