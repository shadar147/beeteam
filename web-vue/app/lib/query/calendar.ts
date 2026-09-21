import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { api } from "~/lib/api/client";
import type { components } from "~/lib/api/schema";

export type CalendarMeeting = components["schemas"]["CalendarMeeting"];

export function useTeamCalendar(
  teamId: MaybeRefOrGetter<string | null>,
  fromISO: MaybeRefOrGetter<string>,
  toISO: MaybeRefOrGetter<string>,
) {
  return useQuery<CalendarMeeting[]>({
    queryKey: [
      "team-calendar",
      computed(() => toValue(teamId)),
      computed(() => toValue(fromISO)),
      computed(() => toValue(toISO)),
    ],
    enabled: computed(() => toValue(teamId) != null),
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/teams/{id}/calendar", {
        params: { path: { id: toValue(teamId)! }, query: { from: toValue(fromISO), to: toValue(toISO) } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
