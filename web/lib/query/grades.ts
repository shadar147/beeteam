import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type GradesFramework = components["schemas"]["GradesFramework"];
export type Discipline = components["schemas"]["Discipline"];
export type GradeBlock = components["schemas"]["GradeBlock"];
export type GradeLevel = components["schemas"]["GradeLevel"];
export type MatrixCell = components["schemas"]["MatrixCell"];

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
