import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { api } from "~/lib/api/client";
import type { components } from "~/lib/api/schema";

export type MemberDetail = components["schemas"]["MemberDetail"];
export type MeetingListItem = components["schemas"]["MeetingListItem"];
export type MeetingDetail = components["schemas"]["MeetingDetail"];
export type GoalsResponse = components["schemas"]["GoalsResponse"];
export type Goal = components["schemas"]["Goal"];
export type DevItem = components["schemas"]["DevItem"];
export type Competency = components["schemas"]["Competency"];
export type FileMeta = components["schemas"]["FileMeta"];

export function useMemberDetail(id: MaybeRefOrGetter<string>) {
  return useQuery<MemberDetail>({
    queryKey: ["member", computed(() => toValue(id))],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}", { params: { path: { id: toValue(id) } } });
      if (error) throw error;
      return data!;
    },
  });
}

export function useMemberMeetings(id: MaybeRefOrGetter<string>) {
  return useQuery<MeetingListItem[]>({
    queryKey: ["member-meetings", computed(() => toValue(id))],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/meetings", { params: { path: { id: toValue(id) } } });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMeeting(id: MaybeRefOrGetter<string | null>) {
  return useQuery<MeetingDetail>({
    queryKey: ["meeting", computed(() => toValue(id))],
    enabled: computed(() => toValue(id) != null),
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/meetings/{id}", { params: { path: { id: toValue(id)! } } });
      if (error) throw error;
      return data!;
    },
  });
}

export function useMemberGoals(id: MaybeRefOrGetter<string>) {
  return useQuery<GoalsResponse>({
    queryKey: ["member-goals", computed(() => toValue(id))],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/goals", { params: { path: { id: toValue(id) } } });
      if (error) throw error;
      return data!;
    },
  });
}

export function useMemberFiles(id: MaybeRefOrGetter<string>) {
  return useQuery<FileMeta[]>({
    queryKey: ["member-files", computed(() => toValue(id))],
    enabled: computed(() => !!toValue(id)),
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/files", { params: { path: { id: toValue(id) } } });
      if (error) throw error;
      return data ?? [];
    },
  });
}
