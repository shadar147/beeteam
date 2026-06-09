import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Evidence = components["schemas"]["Evidence"];
export type CreateEvidence = components["schemas"]["CreateEvidence"];

export function useMemberEvidence(id: string) {
  return useQuery<Evidence[]>({
    queryKey: ["member-evidence", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/evidence", { params: { path: { id } } });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateEvidence(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateEvidence) => {
      const { data, error } = await api.POST("/v1/evidence", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-evidence", memberId] }),
  });
}

export function useDeleteEvidence(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/v1/evidence/{id}", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-evidence", memberId] }),
  });
}
