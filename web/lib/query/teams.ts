import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

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
export function useTeamMembers(teamId: string | null, filters: Filters) {
  return useQuery<MemberRow[]>({
    queryKey: ["team-members", teamId, filters],
    enabled: teamId != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/teams/{id}/members", {
        params: {
          path: { id: teamId! },
          query: {
            q: filters.q || undefined,
            role: filters.role || undefined,
            tenure: filters.tenure || undefined,
            mood: filters.mood || undefined,
            since: filters.since || undefined,
            tags: filters.tags && filters.tags.length ? filters.tags.join(",") : undefined,
          },
        },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Fetch the 4 stat-card values for a team. */
export function useTeamStats(teamId: string | null) {
  return useQuery<TeamStats>({
    queryKey: ["team-stats", teamId],
    enabled: teamId != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/teams/{id}/stats", {
        params: { path: { id: teamId! } },
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
