import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

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
