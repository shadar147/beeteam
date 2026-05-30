"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export default function Home() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/health");
      if (error) throw error;
      return data;
    },
  });

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg text-ink">
      <div className="rounded-lg shadow-2 bg-bg-elev p-8 border border-line">
        <h1 className="text-2xl font-bold tracking-tight">BeeTeam</h1>
        <p className="mt-2 text-ink-3">
          API status:{" "}
          <span data-testid="health-status" className="tabular font-mono text-brand-strong">
            {isLoading ? "…" : isError ? "down" : data?.status}
          </span>
        </p>
      </div>
    </main>
  );
}
