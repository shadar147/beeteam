import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { toValue, type MaybeRefOrGetter } from "vue";
import { api } from "~/lib/api/client";
import type { components } from "~/lib/api/schema";

export type CreateGoalRequest = components["schemas"]["CreateGoalRequest"];
export type UpdateGoalRequest = components["schemas"]["UpdateGoalRequest"];
export type CreateDevItemRequest = components["schemas"]["CreateDevItemRequest"];
export type UpdateDevItemRequest = components["schemas"]["UpdateDevItemRequest"];
export type CreateCompetencyRequest = components["schemas"]["CreateCompetencyRequest"];
export type UpdateCompetencyRequest = components["schemas"]["UpdateCompetencyRequest"];

function useGoalsInvalidator(memberId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["member-goals", toValue(memberId)] });
}

// ── OKRs ──
export function useCreateGoal(memberId: MaybeRefOrGetter<string>) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (body: CreateGoalRequest) => {
      const { data, error } = await api.POST("/v1/goals", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useUpdateGoal(memberId: MaybeRefOrGetter<string>) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (v: { id: string; body: UpdateGoalRequest }) => {
      const { data, error } = await api.PATCH("/v1/goals/{id}", { params: { path: { id: v.id } }, body: v.body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useDeleteGoal(memberId: MaybeRefOrGetter<string>) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/v1/goals/{id}", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// ── Development items ──
export function useCreateDevItem(memberId: MaybeRefOrGetter<string>) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (body: CreateDevItemRequest) => {
      const { data, error } = await api.POST("/v1/development-items", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useUpdateDevItem(memberId: MaybeRefOrGetter<string>) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (v: { id: string; body: UpdateDevItemRequest }) => {
      const { data, error } = await api.PATCH("/v1/development-items/{id}", { params: { path: { id: v.id } }, body: v.body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useDeleteDevItem(memberId: MaybeRefOrGetter<string>) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/v1/development-items/{id}", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// ── Competencies ──
export function useCreateCompetency(memberId: MaybeRefOrGetter<string>) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (body: CreateCompetencyRequest) => {
      const { data, error } = await api.POST("/v1/competencies", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useUpdateCompetency(memberId: MaybeRefOrGetter<string>) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (v: { id: string; body: UpdateCompetencyRequest }) => {
      const { data, error } = await api.PATCH("/v1/competencies/{id}", { params: { path: { id: v.id } }, body: v.body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useDeleteCompetency(memberId: MaybeRefOrGetter<string>) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/v1/competencies/{id}", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
