import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ApiError, apiGet } from "@/lib/api";
import { QueryError } from "@/components/QueryError";
import type { UserView } from "@/lib/skipti";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const auth = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<UserView>("/auth/me"), retry: false, staleTime: 30_000 });
  if (auth.isLoading) return <main className="grid min-h-screen place-items-center bg-background" data-testid="auth-guard-loading"><div className="text-center"><img src="/skipti-mark.svg" alt="" className="mx-auto size-12 animate-pulse rounded-2xl" /><p className="mt-4 font-mono text-[9px] uppercase tracking-[.25em] text-muted-foreground">Securing your workspace…</p></div></main>;
  if (auth.isError && auth.error instanceof ApiError && auth.error.status === 401) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (auth.isError) return <main className="mx-auto max-w-xl px-5 py-20"><QueryError error={auth.error} retry={() => auth.refetch()} /></main>;
  return children;
}
