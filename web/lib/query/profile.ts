import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type MemberDetail = components["schemas"]["MemberDetail"];
export type MeetingListItem = components["schemas"]["MeetingListItem"];
export type MeetingDetail = components["schemas"]["MeetingDetail"];
export type GoalsResponse = components["schemas"]["GoalsResponse"];
export type Goal = components["schemas"]["Goal"];
export type DevItem = components["schemas"]["DevItem"];
export type Competency = components["schemas"]["Competency"];
export type FileMeta = components["schemas"]["FileMeta"];

export function useMemberDetail(id: string) {
  return useQuery<MemberDetail>({
    queryKey: ["member", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}", { params: { path: { id } } });
      if (error) throw error;
      return data!;
    },
  });
}

export function useMemberMeetings(id: string) {
  return useQuery<MeetingListItem[]>({
    queryKey: ["member-meetings", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/meetings", { params: { path: { id } } });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMeeting(id: string | null) {
  return useQuery<MeetingDetail>({
    queryKey: ["meeting", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/meetings/{id}", { params: { path: { id: id! } } });
      if (error) throw error;
      return data!;
    },
  });
}

export function useMemberGoals(id: string) {
  return useQuery<GoalsResponse>({
    queryKey: ["member-goals", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/goals", { params: { path: { id } } });
      if (error) throw error;
      return data!;
    },
  });
}

export function useMemberFiles(id: string) {
  return useQuery<FileMeta[]>({
    queryKey: ["member-files", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/files", { params: { path: { id } } });
      if (error) throw error;
      return data ?? [];
    },
  });
}
