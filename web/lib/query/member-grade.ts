import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type MemberGrade = components["schemas"]["MemberGrade"];
export type BlockLevel = components["schemas"]["BlockLevel"];

export function useMemberGrade(id: string) {
  return useQuery<MemberGrade | null>({
    queryKey: ["member-grade", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/grade", { params: { path: { id } } });
      if (error) throw error;
      return data ?? null;
    },
  });
}
