import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { api } from "~/lib/api/client";
import type { components } from "~/lib/api/schema";

export type TeamRow = components["schemas"]["TeamRow"];
export type AssignableLead = components["schemas"]["AssignableLead"];
export type TeamInput = components["schemas"]["TeamInput"];

export type Filters = {
  q?: string;
  role?: string;
  tenure?: string;
  mood?: string;
  since?: string;
  tags?: string[];
};

type MemberRow = components["schemas"]["MemberRow"];
type TeamStats = components["schemas"]["TeamStats"];

/** Fetch members for a team. All filtering happens server-side via query params. */
export function useTeamMembers(teamId: MaybeRefOrGetter<string | null>, filters: MaybeRefOrGetter<Filters>) {
  return useQuery<MemberRow[]>({
    queryKey: ["team-members", computed(() => toValue(teamId)), computed(() => toValue(filters))],
    enabled: computed(() => toValue(teamId) != null),
    queryFn: async () => {
      const f = toValue(filters);
      const { data, error } = await api.GET("/v1/teams/{id}/members", {
        params: {
          path: { id: toValue(teamId)! },
          query: {
            q: f.q || undefined,
            role: f.role || undefined,
            tenure: f.tenure || undefined,
            mood: f.mood || undefined,
            since: f.since || undefined,
            tags: f.tags && f.tags.length ? f.tags.join(",") : undefined,
          },
        },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Fetch the 4 stat-card values for a team. */
export function useTeamStats(teamId: MaybeRefOrGetter<string | null>) {
  return useQuery<TeamStats>({
    queryKey: ["team-stats", computed(() => toValue(teamId))],
    enabled: computed(() => toValue(teamId) != null),
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/teams/{id}/stats", {
        params: { path: { id: toValue(teamId)! } },
      });
      if (error) throw error;
      return data!;
    },
  });
}

export function useTeams() {
  return useQuery<TeamRow[]>({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/teams");
      if (error) throw error;
      return data!;
    },
  });
}

export function useAssignableLeads() {
  return useQuery<AssignableLead[]>({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/leads");
      if (error) throw error;
      return data!;
    },
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TeamInput) => {
      const { data, error } = await api.POST("/v1/teams", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; body: TeamInput }) => {
      const { data, error } = await api.PATCH("/v1/teams/{id}", { params: { path: { id: v.id } }, body: v.body });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE("/v1/teams/{id}", { params: { path: { id } } });
      // Carry the HTTP status so the UI can show a specific 409 (team-has-members) banner.
      if (error) throw Object.assign(new Error("delete team failed"), { status: response?.status ?? 0 });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}
