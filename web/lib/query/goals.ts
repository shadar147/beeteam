import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type CreateGoalRequest = components["schemas"]["CreateGoalRequest"];
export type UpdateGoalRequest = components["schemas"]["UpdateGoalRequest"];
export type CreateDevItemRequest = components["schemas"]["CreateDevItemRequest"];
export type UpdateDevItemRequest = components["schemas"]["UpdateDevItemRequest"];
export type CreateCompetencyRequest = components["schemas"]["CreateCompetencyRequest"];
export type UpdateCompetencyRequest = components["schemas"]["UpdateCompetencyRequest"];

function useGoalsInvalidator(memberId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["member-goals", memberId] });
}

// ── OKRs ──
export function useCreateGoal(memberId: string) {
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
export function useUpdateGoal(memberId: string) {
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
export function useDeleteGoal(memberId: string) {
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
export function useCreateDevItem(memberId: string) {
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
export function useUpdateDevItem(memberId: string) {
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
export function useDeleteDevItem(memberId: string) {
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
export function useCreateCompetency(memberId: string) {
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
export function useUpdateCompetency(memberId: string) {
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
export function useDeleteCompetency(memberId: string) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/v1/competencies/{id}", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
