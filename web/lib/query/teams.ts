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

/** Fetch all members for a team, then apply client-side filters. */
export function useTeamMembers(teamId: string | null, filters: Filters) {
  return useQuery<MemberRow[]>({
    queryKey: ["team-members", teamId, filters],
    enabled: teamId != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/teams/{id}/members", {
        params: { path: { id: teamId! } },
      });
      if (error) throw error;

      let rows = data ?? [];

      if (filters.q) {
        const q = filters.q.toLowerCase();
        rows = rows.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.role.toLowerCase().includes(q),
        );
      }

      if (filters.role) {
        const role = filters.role.toLowerCase();
        rows = rows.filter((m) => m.role.toLowerCase().includes(role));
      }

      if (filters.tags && filters.tags.length > 0) {
        rows = rows.filter((m) =>
          filters.tags!.every((t) => m.tags.includes(t)),
        );
      }

      if (filters.since === "gt4w") {
        const cutoff = Date.now() - 28 * 86_400_000;
        rows = rows.filter(
          (m) => !m.last_meet || new Date(m.last_meet).getTime() < cutoff,
        );
      }

      if (filters.mood) {
        const threshold = Number(filters.mood);
        if (!Number.isNaN(threshold)) {
          rows = rows.filter((m) => {
            const last = m.mood_trend[m.mood_trend.length - 1];
            return last !== undefined && last <= threshold;
          });
        }
      }

      return rows;
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
