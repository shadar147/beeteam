import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { api } from "~/lib/api/client";
import type { components } from "~/lib/api/schema";

export type MemberGrade = components["schemas"]["MemberGrade"];
export type BlockLevel = components["schemas"]["BlockLevel"];

export function useMemberGrade(id: MaybeRefOrGetter<string>) {
  return useQuery<MemberGrade | null>({
    queryKey: ["member-grade", computed(() => toValue(id))],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/grade", { params: { path: { id: toValue(id) } } });
      if (error) throw error;
      return data ?? null;
    },
  });
}
