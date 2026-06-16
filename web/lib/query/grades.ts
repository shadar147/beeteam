import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type GradesFramework = components["schemas"]["GradesFramework"];
export type Discipline = components["schemas"]["Discipline"];
export type GradeBlock = components["schemas"]["GradeBlock"];
export type GradeLevel = components["schemas"]["GradeLevel"];
export type MatrixCell = components["schemas"]["MatrixCell"];
export type UpdateLevels = components["schemas"]["UpdateLevels"];
export type PutDiscipline = components["schemas"]["PutDiscipline"];
export type CreateDiscipline = components["schemas"]["CreateDiscipline"];

export function useGradesFramework() {
  return useQuery<GradesFramework>({
    queryKey: ["grades-framework"],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/grades/framework");
      if (error) throw error;
      return data!;
    },
  });
}

export function useUpdateLevels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateLevels) => {
      const { data, error } = await api.PATCH("/v1/grades/levels", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grades-framework"] }),
  });
}

export function usePutDiscipline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: PutDiscipline }) => {
      const { data, error, response } = await api.PUT("/v1/grades/disciplines/{id}", {
        params: { path: { id } },
        body,
      });
      // Carry the HTTP status so the caller can show a specific 409 (block in use) banner.
      if (error) throw Object.assign(new Error("put discipline failed"), { status: response.status });
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grades-framework"] }),
  });
}

export function useCreateDiscipline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateDiscipline) => {
      const { data, error } = await api.POST("/v1/grades/disciplines", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grades-framework"] }),
  });
}
