import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Copy, MessageSquareText, QrCode, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader, StatusPill } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiGet, apiPost } from "@/lib/api";
import type { Project, ShareCreated, ShareGrant } from "@/lib/skipti";
import { copyText } from "@/lib/clipboard";
import { QueryError } from "@/components/QueryError";

const permissionOptions = [
  { id: "general_profile", label: "General profile", detail: "All approved, non-sensitive Persona entries" },
  { id: "goals", label: "Goals", detail: "Current user-approved goals only" },
  { id: "skills", label: "Skills", detail: "Relevant technical experience only" },
  { id: "ai_preferences", label: "AI preferences", detail: "Response and collaboration style" },
  { id: "project", label: "Project overview", detail: "Identity, purpose, description, and stack" },
  { id: "project_progress", label: "Approved project progress", detail: "Latest completed work, blockers, decisions, and next steps" },
];



function formatRemaining(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe % 60).toString().padStart(2, "0")}`;
}

export default function Share() {
  const client = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [duration, setDuration] = useState(15);
  const [permissions, setPermissions] = useState(new Set(["goals", "skills", "ai_preferences"]));
  const [retainChat, setRetainChat] = useState(false);
  const [created, setCreated] = useState<ShareCreated | null>(null);
  const [createdRemaining, setCreatedRemaining] = useState(0);

  const updatePermission = (permissionId: string, checked: boolean) => {
    setPermissions((current) => {
      const next = new Set(current);
      if (checked) next.add(permissionId); else next.delete(permissionId);
      return next;
    });
  };

  const projects = useQuery({ queryKey: ["projects"], queryFn: () => apiGet<Project[]>("/projects") });
  const shares = useQuery({ queryKey: ["shares"], queryFn: () => apiGet<ShareGrant[]>("/shares"), retry: false });
  const create = useMutation({
    mutationFn: () => apiPost<ShareCreated>("/shares", {
      project_id: projectId || null,
      permissions: [...permissions].filter((permission) => projectId || !permission.startsWith("project")),
      duration_minutes: duration,
      retain_chat_until_expiry: retainChat,
    }),
    onSuccess: (grant) => {
      setCreated(grant);
      setCreatedRemaining(Math.max(0, Math.floor((new Date(grant.expires_at).getTime() - Date.now()) / 1000)));
      client.invalidateQueries({ queryKey: ["shares"] });
      client.invalidateQueries({ queryKey: ["overview"] });
      toast.success("Context-aware AI pass created");
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!created) return;
    const timer = window.setInterval(() => setCreatedRemaining(Math.max(0, Math.floor((new Date(created.expires_at).getTime() - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [created]);
  const revoke = useMutation({
    mutationFn: (id: string) => apiPost<{ message: string }>(`/shares/${id}/revoke`),
    onSuccess: (_, id) => {
      if (created?.id === id) setCreated(null);
      client.invalidateQueries({ queryKey: ["shares"] });
      client.invalidateQueries({ queryKey: ["overview"] });
      toast.success("Guest AI access revoked");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Persona pass"
        title="Connect context to a live AI."
        description="Create a one-time QR that opens a temporary Gemini session. Every guest question automatically retrieves only relevant, permitted Persona and project context."
        action={<StatusPill tone="brand">Connect to AI · Read only</StatusPill>}
      />
      <section className="grid gap-7 xl:grid-cols-[.92fr_1.08fr]" data-testid="share-workspace">
        <form className="panel p-6 md:p-8" onSubmit={(event) => { event.preventDefault(); create.mutate(); }} data-testid="share-create-form">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#c47a91]" data-testid="share-form-kicker">AI connection builder</p>
          <h2 className="mt-2 font-heading text-4xl" data-testid="share-form-title">Create a Persona Pass</h2>
          <div className="mt-7">
            <label className="mb-2 block text-xs text-muted-foreground" htmlFor="share-project" data-testid="share-project-label">Project scope</label>
            <select id="share-project" className="w-full border border-border bg-[#0c0a09] px-3 py-3 text-sm outline-none focus:border-[#872c4c]" value={projectId} onChange={(event) => setProjectId(event.target.value)} data-testid="share-project-select">
              <option value="" label="Base Persona only" />
              {(projects.data ?? []).map((project) => <option key={project.id} value={project.id} label={`Base Persona + ${project.name} · revision ${project.revision}`} />)}
            </select>
          </div>
          <div className="mt-7" data-testid="share-permissions-list">
            <p className="mb-3 text-xs text-muted-foreground" data-testid="share-permissions-label">Context Gemini may retrieve</p>
            {permissionOptions.map((permission) => (
              <label className="flex cursor-pointer gap-3 border-t border-border py-4" key={permission.id} data-testid={`share-permission-${permission.id}-row`}>
                <Checkbox
                  checked={permissions.has(permission.id)}
                  disabled={!projectId && permission.id.startsWith("project")}
                  onCheckedChange={(checked) => updatePermission(permission.id, Boolean(checked))}
                  data-testid={`share-permission-${permission.id}-checkbox`}
                />
                <span>
                  <span className="block text-sm" data-testid={`share-permission-${permission.id}-label`}>{permission.label}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground" data-testid={`share-permission-${permission.id}-detail`}>{permission.detail}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-6">
            <p className="mb-3 text-xs text-muted-foreground" data-testid="share-duration-label">Access duration</p>
            <div className="grid grid-cols-4 gap-2" data-testid="share-duration-options">
              {[5, 15, 30, 60].map((minutes) => (
                <button type="button" key={minutes} onClick={() => setDuration(minutes)} className={`border px-3 py-3 font-mono text-[9px] transition-[border-color,background-color] ${duration === minutes ? "border-[#872c4c] bg-[#1b0c10] text-[#e0a7b8]" : "border-border text-muted-foreground hover:border-[#581d30]"}`} data-testid={`share-duration-${minutes}-button`}>
                  {minutes === 60 ? "1 hour" : `${minutes} min`}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between gap-5 border-y border-border py-5" data-testid="share-chat-retention-row">
            <div>
              <div className="flex items-center gap-2"><p className="text-sm" data-testid="share-chat-retention-label">Keep chat until this pass expires</p><span className={`rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-widest ${retainChat ? "border-[#8f2e50] bg-[#261117] text-[#e3aabd]" : "border-border bg-[#12100f] text-muted-foreground"}`} data-testid="share-chat-retention-state">{retainChat ? "On" : "Off"}</span></div>
              <p className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground" data-testid="share-chat-retention-description">Off deletes temporary messages as soon as the guest ends or you revoke. On retains them only until the selected expiration.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={retainChat}
              onClick={() => setRetainChat((value) => !value)}
              aria-label="Keep chat until this pass expires"
              className={`relative h-7 w-12 shrink-0 overflow-hidden rounded-full border transition-[background-color,border-color,box-shadow] duration-200 ${retainChat ? "border-[#b44a6d] bg-[#761f3d] shadow-[0_0_0_3px_rgba(118,31,61,.16)]" : "border-[#51494b] bg-[#12100f]"}`}
              data-testid="share-chat-retention-switch"
            >
              <span className={`absolute left-1 top-1 size-[18px] rounded-full bg-[#f5f1ec] shadow-[0_2px_8px_rgba(0,0,0,.3)] transition-[transform] duration-200 ${retainChat ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
          <Button className="mt-7 w-full" size="lg" type="submit" disabled={create.isPending || ![...permissions].some((p) => projectId || !p.startsWith("project"))} data-testid="share-generate-button">
            <MessageSquareText className="size-4" />{create.isPending ? "Creating AI session…" : "Generate AI connection QR"}
          </Button>
        </form>

        <div className="space-y-7" data-testid="share-preview-column">
          <section className="relative min-h-[520px] overflow-hidden rounded-2xl border border-[#581d30] bg-[#100e0e] p-6 shadow-[0_24px_60px_rgba(0,0,0,.2)] md:p-9" data-testid="share-pass-preview">
            <img src="https://static.prod-images.emergentagent.com/jobs/998467b0-e0cb-41de-9528-3854c8262275/images/86651936e90994e3fab1ceb2e1097038611957257229a46dca61f4133da8715e.jpeg" alt="Abstract secure context network" className="absolute inset-0 h-full w-full object-cover opacity-35" loading="lazy" data-testid="share-custom-artwork" />
            <div className="absolute inset-0 bg-[#160b0e]/78 backdrop-blur-[2px]" />
            <div className="relative z-10 flex min-h-[450px] flex-col">
              <div className="flex items-start justify-between"><div><p className="font-heading text-3xl" data-testid="share-preview-brand">Skipti AI Connection</p><p className="mt-1 font-mono text-[8px] uppercase tracking-[.2em] text-[#d7a0b1]" data-testid="share-preview-caption">Temporary context-aware Gemini</p></div><StatusPill tone={created ? "good" : "neutral"}>{created ? createdRemaining > 0 ? "Ready" : "Expired" : "Draft"}</StatusPill></div>
              {created ? (
                <div className="my-auto grid items-center gap-7 md:grid-cols-[220px_1fr]" data-testid="share-created-pass">
                  <div className="bg-[#fafaf9] p-4"><img src={created.qr_data_uri} alt="One-time Skipti AI connection QR code" className="w-full" data-testid="share-qr-image" /></div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-emerald-300" data-testid="share-created-status">Ready · {formatRemaining(createdRemaining)} remaining</p>
                    <p className="mt-1 font-mono text-[8px] uppercase tracking-widest text-[#9e8790]" data-testid="share-created-duration">Expires {new Date(created.expires_at).toLocaleTimeString()}</p>
                    <h3 className="mt-3 font-heading text-4xl" data-testid="share-created-title">Scan. Ask Gemini.<br />Continue with context.</h3>
                    <p className="mt-4 text-xs leading-5 text-[#c5b8bc]" data-testid="share-created-description">The QR contains no Persona data. It exchanges once for a scoped guest session where context is retrieved automatically.</p>
                    <p className="mt-3 font-mono text-[8px] uppercase tracking-wide text-[#9e8790]" data-testid="share-created-retention">Chat retention · {created.retain_chat_until_expiry ? "until expiration" : "delete on end or revoke"}</p>
                    <div className="mt-5 flex flex-wrap gap-2"><Button size="sm" variant="outline" type="button" onClick={() => { void copyText(created.connect_url, "Device link copied"); }} data-testid="share-copy-link-button"><Copy className="size-3.5" /> Copy device link</Button><Button size="sm" variant="outline" type="button" onClick={() => { void copyText(created.ai_context_url, "Plain-text AI link copied"); }} data-testid="share-copy-ai-link-button"><Copy className="size-3.5" /> Copy AI link</Button><Button size="sm" variant="destructive" type="button" onClick={() => revoke.mutate(created.id)} data-testid="share-created-revoke-button"><ShieldOff className="size-3.5" /> Revoke</Button></div>
                  </div>
                </div>
              ) : (
                <div className="my-auto text-center" data-testid="share-empty-preview"><QrCode className="mx-auto size-16 text-[#6b3949]" /><h3 className="mt-6 font-heading text-4xl text-[#d4bcc4]" data-testid="share-empty-title">A live AI connection appears here.</h3><p className="mx-auto mt-3 max-w-md text-xs leading-5 text-[#9e8790]" data-testid="share-empty-description">Select exactly what Gemini may retrieve for the guest.</p></div>
              )}
              <div className="mt-auto flex items-center gap-2 border-t border-[#6e3346] pt-4 text-[10px] text-[#c5b8bc]" data-testid="share-revocation-note"><Clock3 className="size-3.5" /> Revocation blocks future generation and retrieval; it cannot erase information already displayed.</div>
            </div>
          </section>
          <section className="panel" data-testid="share-active-sessions">
            <div className="border-b border-border p-5"><h2 className="font-heading text-3xl" data-testid="share-active-title">Recent AI passes</h2></div>
            <div className="divide-y divide-border">{shares.isError ? <QueryError error={shares.error} retry={() => shares.refetch()} /> : shares.isLoading ? <p className="p-5 text-sm text-muted-foreground">Loading passes…</p> : !shares.data?.length ? <p className="p-5 text-sm text-muted-foreground">No passes yet. Create one to share approved context.</p> : null}{(shares.data ?? []).map((share) => <div className="flex items-center justify-between gap-4 p-4" key={share.id} data-testid={`share-session-${share.id}`}><div><p className="font-mono text-[9px] uppercase text-muted-foreground" data-testid={`share-session-${share.id}-id`}>{share.id.slice(0, 8)} · {share.retain_chat_until_expiry ? "retained to expiry" : "delete on end"}</p><p className="mt-1 text-xs text-muted-foreground" data-testid={`share-session-${share.id}-expiry`}>Until {new Date(share.expires_at).toLocaleTimeString()}</p></div><div className="flex items-center gap-2"><StatusPill tone={share.status === "active" || share.status === "ready" ? "good" : "neutral"}>{share.status}</StatusPill>{["ready", "active"].includes(share.status) ? <Button variant="ghost" size="sm" onClick={() => revoke.mutate(share.id)} disabled={revoke.isPending} data-testid={`share-session-${share.id}-revoke-button`}>Revoke</Button> : null}</div></div>)}</div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
