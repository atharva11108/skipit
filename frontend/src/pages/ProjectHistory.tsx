import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AppShell, PageHeader, StatusPill } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import type { ProjectCheckpoint, ProjectDetail } from "@/lib/skipti";
import { PageSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";

export default function ProjectHistory() {
  const { id = "" } = useParams(); const client = useQueryClient();
  const detail = useQuery({ queryKey: ["project", id], queryFn: () => apiGet<ProjectDetail>(`/projects/${id}`) });
  const history = useQuery({ queryKey: ["project-history", id], queryFn: () => apiGet<ProjectCheckpoint[]>(`/projects/${id}/history`) });
  const restore = useMutation({ mutationFn: (revision: number) => apiPost<ProjectCheckpoint>(`/projects/${id}/restore`, { revision, expected_revision: detail.data?.project.revision }), onSuccess: (checkpoint) => { for (const queryKey of [["project-history", id], ["project", id], ["projects"], ["overview"]]) client.invalidateQueries({ queryKey }); toast.success(`Restored as revision ${checkpoint.revision}`); }, onError: (error) => { client.invalidateQueries({ queryKey: ["project", id] }); toast.error(error.message); } });
  const current = detail.data?.project.revision;
  return <AppShell><PageHeader eyebrow="Immutable history" title={`${detail.data?.project.name ?? "Project"} revisions`} description="Restoring writes the selected state as a new checkpoint, preserving every earlier revision." />
    <Link to={`/projects/${id}`} className="mb-6 inline-block text-sm text-[#d7a0b1]">← Back to project</Link>
    {history.isError || detail.isError ? <QueryError error={history.error ?? detail.error} retry={() => { history.refetch(); detail.refetch(); }} /> : history.isLoading || detail.isLoading ? <PageSkeleton cards={3} /> : <section className="relative mx-auto max-w-4xl space-y-5" data-testid="project-history-timeline">{(history.data ?? []).map((checkpoint) => <article className="panel p-6" key={checkpoint.id} data-testid={`project-history-revision-${checkpoint.revision}`}><div className="flex flex-wrap justify-between gap-4"><div><StatusPill tone={checkpoint.revision === current ? "brand" : "neutral"}>Revision {checkpoint.revision}</StatusPill><p className="mt-3 text-xs text-muted-foreground">{new Date(checkpoint.created_at).toLocaleString()} · {checkpoint.source}</p><h2 className="mt-4 font-heading text-3xl">{checkpoint.summary}</h2></div>{checkpoint.revision !== current ? <Button variant="outline" size="sm" disabled={restore.isPending || !current} onClick={() => restore.mutate(checkpoint.revision)} data-testid={`project-history-revision-${checkpoint.revision}-restore-button`}><RotateCcw className="size-3.5" /> Restore as revision {(current ?? 0) + 1}</Button> : <StatusPill tone="good">Current</StatusPill>}</div><details className="mt-5 border-t border-border pt-4"><summary className="cursor-pointer text-xs text-muted-foreground">View saved state</summary><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">{JSON.stringify(checkpoint.state, null, 2)}</pre></details></article>)}</section>}
  </AppShell>;
}
