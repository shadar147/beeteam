import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type CalendarMeeting = components["schemas"]["CalendarMeeting"];

export function useTeamCalendar(teamId: string | null, fromISO: string, toISO: string) {
  return useQuery<CalendarMeeting[]>({
    queryKey: ["team-calendar", teamId, fromISO, toISO],
    enabled: teamId != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/teams/{id}/calendar", {
        params: { path: { id: teamId! }, query: { from: fromISO, to: toISO } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
