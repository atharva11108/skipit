import { copyText } from "@/lib/clipboard";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Braces, ChevronRight, Clock3, Eye, LockKeyhole, Send, ShieldCheck, Square } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import type { ContextSearchResponse, ExternalContextLink, GuestChatMessage, GuestChatResponse, GuestContext, ShareGrant } from "@/lib/skipti";

const starterPrompts = [
  "What do you know about my current project?",
  "What should I work on next?",
  "Summarize my latest project progress.",
  "What should I learn next?",
];

function guestErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object" && "detail" in error.body) {
    const detail = (error.body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) return String((detail as { message: unknown }).message);
  }
  return "Skipti couldn't connect to the AI service. Please try again.";
}

function formatRemaining(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export default function Connect() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const isSession = token === "session";
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<GuestChatMessage[]>([]);
  const [trace, setTrace] = useState<ContextSearchResponse | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [ended, setEnded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [linkRemaining, setLinkRemaining] = useState(0);

  const redeem = useMutation({
    mutationFn: () => apiPost<ShareGrant>("/shares/redeem", { token }),
    onSuccess: () => { client.removeQueries({ queryKey: ["guest-context"] }); setHydrated(false); setEnded(false); setTrace(null); setRemaining(0); setMessages([]); navigate("/connect/session", { replace: true }); },
  });
  const externalLink = useQuery({
    queryKey: ["external-context-link", token],
    queryFn: () => apiGet<ExternalContextLink>(`/connect/${token}/link`),
    enabled: !isSession,
    retry: false,
  });
  const guest = useQuery({
    queryKey: ["guest-context"],
    queryFn: () => apiGet<GuestContext>("/guest/context"),
    enabled: isSession && !ended,
    retry: false,
    refetchInterval: 10000,
  });
  const chat = useMutation({
    mutationFn: (message: string) => apiPost<GuestChatResponse>("/guest/chat", { message }),
    onMutate: (message) => {
      const localId = `local-${crypto.randomUUID()}`;
      setMessages((current) => [...current, { id: localId, role: "user", content: message, created_at: new Date().toISOString() }]);
      setInput("");
      return { localId };
    },
    onSuccess: (result) => {
      setMessages((current) => [...current, result.message]);
      setTrace(result.retrieval);
      setRemaining(result.remaining_seconds);
    },
    onError: (error, message, context) => { setMessages((current) => current.filter((item) => item.id !== context?.localId)); setInput(message); toast.error(guestErrorMessage(error)); },
  });
  const endSession = useMutation({
    mutationFn: () => apiPost<{ message: string }>("/guest/end"),
    onSuccess: () => { setEnded(true); setMessages([]); setTrace(null); setRemaining(0); client.removeQueries({ queryKey: ["guest-context"] }); toast.success("Temporary session ended"); },
    onError: (error) => { if (error instanceof ApiError && error.status === 401) { setEnded(true); setMessages([]); setTrace(null); client.removeQueries({ queryKey: ["guest-context"] }); } else toast.error(guestErrorMessage(error)); },
  });

  useEffect(() => {
    if (guest.data) {
      if (!hydrated) setMessages((current) => current.length ? current : guest.data.recent_messages);
      setRemaining(guest.data.remaining_seconds);
      setHydrated(true);
    }
  }, [guest.data, hydrated]);
  useEffect(() => {
    if (!isSession || ended) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [isSession, ended]);
  useEffect(() => {
    if (!externalLink.data) return;
    setLinkRemaining(Math.max(0, Math.floor((new Date(externalLink.data.expires_at).getTime() - Date.now()) / 1000)));
    const timer = window.setInterval(() => setLinkRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [externalLink.data]);

  const activeGuest = !ended && !guest.isError && remaining > 0 ? guest.data : undefined;
  const categories = useMemo(() => [...new Set((activeGuest?.persona_entries ?? []).map((entry) => entry.category))], [activeGuest?.persona_entries]);
  const send = (message: string) => { if (message.trim() && !chat.isPending && guest.data && !guest.isError && remaining > 0 && !ended) chat.mutate(message.trim()); };
  const sessionError = guest.isError ? guestErrorMessage(guest.error) : null;
  const sessionStatus = ended ? "Ended" : sessionError ? "Unavailable" : guest.isLoading ? "Connecting" : remaining > 0 ? "Connected" : "Expired";

  if (!isSession) {
    return (
      <main className="editorial-grid page-enter min-h-screen bg-[#0c0a09] px-5 py-12 text-foreground" data-testid="connect-page">
        <div className="mx-auto max-w-xl"><p className="font-heading text-3xl" data-testid="connect-brand">Skipti AI</p>
          <section className="panel mt-20 p-8 text-center" data-testid="connect-redeem-panel">
            <span className="mx-auto grid size-12 place-items-center border border-[#581d30] bg-[#1b0c10] text-[#d7a0b1]" data-testid="connect-lock-icon"><LockKeyhole className="size-4" /></span>
            <p className="mt-7 font-mono text-[9px] uppercase tracking-widest text-[#c47a91]" data-testid="connect-kicker">One-time AI connection</p>
            <h1 className="mt-3 font-heading text-5xl font-light" data-testid="connect-title">Connect approved context.</h1>
            <p className="mt-5 text-sm leading-6 text-muted-foreground" data-testid="connect-description">Redeem once to open a temporary, read-only Gemini session. The QR contains no Persona information.</p>
            {externalLink.data ? <div className="mt-5 flex items-center justify-center gap-2 font-mono text-[9px] uppercase tracking-widest text-emerald-300" data-testid="connect-link-status"><ShieldCheck className="size-3.5" /> {externalLink.data.status} · {formatRemaining(linkRemaining)} remaining</div> : null}
            {externalLink.isError ? <p className="mt-5 text-sm text-red-300" role="alert">{guestErrorMessage(externalLink.error)}</p> : null}{redeem.isError ? <p className="mt-5 border border-red-950 bg-red-950/20 p-3 text-xs text-red-300" data-testid="connect-redeem-error">This Skipti connection is invalid, expired, revoked, or already redeemed.</p> : null}
            <div className="mt-7 flex flex-wrap justify-center gap-2"><Button size="lg" onClick={() => redeem.mutate()} disabled={redeem.isPending || externalLink.isLoading || externalLink.isError || externalLink.data?.status !== "active" || linkRemaining <= 0} data-testid="connect-redeem-button">{redeem.isPending ? "Securing AI session…" : "Connect to Skipti AI"}<ArrowRight className="size-4" /></Button><Button size="lg" variant="outline" onClick={() => { if (externalLink.data) { void copyText(externalLink.data.ai_context_url, "Plain-text AI link copied"); } }} disabled={!externalLink.data || externalLink.data.status !== "active" || linkRemaining <= 0} data-testid="connect-copy-ai-link-button"><Braces className="size-4" /> Copy AI link</Button></div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-enter min-h-screen bg-[#0c0a09] text-foreground" data-testid="connected-ai-page">
      <header className="sticky top-0 z-30 border-b border-border bg-[#0c0a09]/92 px-4 py-4 backdrop-blur-xl md:px-8" data-testid="connected-ai-header">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div><p className="font-heading text-2xl" data-testid="connected-ai-brand">Skipti AI</p><p className="font-mono text-[8px] uppercase tracking-[.2em] text-[#9f5169]" data-testid="connected-ai-mode">Connected session</p></div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 border border-border px-3 py-2 font-mono text-[9px] uppercase text-muted-foreground sm:flex" data-testid="connected-ai-status">{sessionStatus} · {formatRemaining(remaining)} remaining</span>
            <Button variant="outline" size="sm" aria-label="View shared context" onClick={() => setShowContext((value) => !value)} data-testid="connected-ai-view-context-button"><Eye className="size-3.5" /> <span className="hidden sm:inline">View shared context</span></Button>
            <Button variant="destructive" size="sm" aria-label="End session" onClick={() => endSession.mutate()} disabled={endSession.isPending || ended} data-testid="connected-ai-end-session-button"><Square className="size-3.5" /> <span className="hidden sm:inline">End session</span></Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl lg:grid-cols-[1fr_360px]" data-testid="connected-ai-workspace">
        <section className="flex min-h-[calc(100vh-73px)] flex-col border-r border-border" data-testid="connected-ai-chat-panel">
          <div className="border-b border-border px-5 py-6 md:px-9" data-testid="connected-ai-intro">
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground sm:hidden" data-testid="connected-ai-mobile-status"><ShieldCheck className="size-3.5" /> {sessionStatus} · {formatRemaining(remaining)}</div>
            <h1 className="mt-3 font-heading text-4xl font-light md:text-5xl" data-testid="connected-ai-title">Your context is connected.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground" data-testid="connected-ai-description">Ask anything. Skipti will provide relevant information from the context shared with this session.</p>
            {activeGuest?.project ? <p className="mt-4 font-mono text-[9px] uppercase tracking-widest text-[#c47a91]" data-testid="connected-ai-project-label">Project · {activeGuest.project.name} · revision {activeGuest.project.revision}</p> : activeGuest ? <p className="mt-4 font-mono text-[9px] uppercase tracking-widest text-[#c47a91]" data-testid="connected-ai-persona-label">Base Persona session</p> : null}
          </div>

          {ended || sessionError || (hydrated && remaining === 0) ? (
            <div className="m-auto max-w-lg px-6 text-center" data-testid="connected-ai-ended-state"><LockKeyhole className="mx-auto size-7 text-[#6b3949]" /><h2 className="mt-5 font-heading text-4xl" data-testid="connected-ai-ended-title">{ended ? "This session has ended." : sessionError ?? "This session has expired."}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground" data-testid="connected-ai-ended-description">No further Persona retrieval or Gemini generation is available through this connection.</p></div>
          ) : (
            <>
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-7 md:px-9" data-testid="connected-ai-messages">
                {guest.isLoading ? <div className="border border-border bg-[#151313] p-5" data-testid="connected-ai-loading-session"><div className="flex items-center gap-3"><span className="size-1.5 animate-status-pulse rounded-full bg-[#c47a91]" /><p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Securing permitted context…</p></div></div> : null}
                {!guest.isLoading && !messages.length ? <div data-testid="connected-ai-empty-conversation"><p className="font-mono text-[9px] uppercase tracking-widest text-[#9f5169]" data-testid="connected-ai-starters-label">Try a context-aware question</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{starterPrompts.map((prompt, index) => <button key={prompt} type="button" onClick={() => send(prompt)} className="group flex items-center justify-between gap-3 border border-border bg-[#151313] p-4 text-left text-sm text-muted-foreground transition-[border-color,background-color,color] hover:border-[#6e0d25] hover:bg-[#1b1416] hover:text-foreground" data-testid={`connected-ai-starter-${index}-button`}><span>{prompt}</span><ChevronRight className="size-4 shrink-0 transition-[transform] group-hover:translate-x-1" /></button>)}</div></div> : null}
                {messages.map((message) => <article className={message.role === "user" ? "ml-auto max-w-[88%] border border-[#581d30] bg-[#1a0e12] p-4 md:max-w-[75%]" : "max-w-[92%] border border-border bg-[#151313] p-5 md:max-w-[82%]"} key={message.id} data-testid={`connected-ai-message-${message.id}`}><p className="font-mono text-[8px] uppercase tracking-widest text-[#c47a91]" data-testid={`connected-ai-message-${message.id}-role`}>{message.role === "user" ? "You" : "Skipti Gemini"}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#dedad7]" data-testid={`connected-ai-message-${message.id}-content`}>{message.content}</p></article>)}
                {chat.isPending ? <div className="max-w-[82%] border border-border bg-[#151313] p-5" data-testid="connected-ai-generating"><div className="flex items-center gap-3"><span className="size-1.5 animate-status-pulse rounded-full bg-[#c47a91]" /><p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Selecting permitted context, then asking Gemini…</p></div></div> : null}
              </div>
              <form className="sticky bottom-0 border-t border-border bg-[#0c0a09]/95 p-4 backdrop-blur-xl md:p-6" onSubmit={(event) => { event.preventDefault(); send(input); }} data-testid="connected-ai-chat-form"><div className="relative mx-auto max-w-4xl"><Textarea aria-label="Ask with the connected context" maxLength={2000} className="min-h-24 resize-none pr-16" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask with the connected context…" disabled={chat.isPending} data-testid="connected-ai-chat-input" /><Button className="absolute bottom-3 right-3" size="icon" type="submit" disabled={chat.isPending || !input.trim() || guest.isLoading || remaining <= 0} aria-label="Ask Gemini" data-testid="connected-ai-send-button"><Send className="size-4" /></Button></div></form>
            </>
          )}
        </section>

        <aside className={`${showContext ? "fixed inset-0 z-40 overflow-y-auto bg-[#100e0e] p-5 lg:static lg:block" : "hidden lg:block"} p-6`} data-testid="connected-ai-context-sidebar">
          <div className="flex items-center justify-between"><div><p className="font-mono text-[9px] uppercase tracking-widest text-[#c47a91]" data-testid="connected-ai-context-kicker">Shared context</p><h2 className="mt-2 font-heading text-3xl" data-testid="connected-ai-context-title">Permitted only</h2></div>{showContext ? <Button variant="ghost" size="sm" onClick={() => setShowContext(false)} data-testid="connected-ai-close-context-button">Close</Button> : null}</div>
          <div className="mt-6 flex flex-wrap gap-2" data-testid="connected-ai-categories">{categories.map((category) => <span className="border border-border px-2 py-1 font-mono text-[8px] uppercase text-muted-foreground" key={category} data-testid={`connected-ai-category-${category.toLowerCase().replaceAll(" ", "-")}`}>{category}</span>)}</div>
          {activeGuest?.project ? <div className="mt-6 border border-[#581d30] bg-[#160b0e] p-4" data-testid="connected-ai-project-card"><p className="font-mono text-[8px] uppercase text-[#c47a91]">Latest approved Project Holder</p><p className="mt-2 font-heading text-2xl" data-testid="connected-ai-project-name">{activeGuest.project.name}</p><p className="mt-1 text-xs text-muted-foreground" data-testid="connected-ai-project-revision">Revision {activeGuest.project.revision}</p></div> : null}
          <div className="mt-5 divide-y divide-border" data-testid="connected-ai-shared-entries">{(activeGuest?.persona_entries ?? []).map((entry) => <div className="py-4" key={entry.id} data-testid={`connected-ai-context-${entry.id}`}><p className="font-mono text-[8px] text-[#c47a91]" data-testid={`connected-ai-context-${entry.id}-label`}>{entry.category} / {entry.label}</p><p className="mt-2 text-xs leading-5 text-muted-foreground" data-testid={`connected-ai-context-${entry.id}-value`}>{entry.value}</p></div>)}</div>
          {trace && activeGuest ? <div className="mt-7 border-t border-border pt-6" data-testid="connected-ai-trace"><div className="flex items-center gap-2"><Braces className="size-3.5 text-[#c47a91]" /><p className="font-mono text-[9px] uppercase tracking-widest text-[#c47a91]" data-testid="connected-ai-trace-title">Used for last answer</p></div><div className="mt-4 grid grid-cols-3 gap-px bg-border"><div className="bg-[#151313] p-3"><p className="font-heading text-2xl" data-testid="connected-ai-trace-selected">{trace.selected.length}</p><p className="font-mono text-[7px] uppercase text-muted-foreground">Entries</p></div><div className="bg-[#151313] p-3"><p className="font-heading text-2xl" data-testid="connected-ai-trace-tokens">~{trace.approximate_tokens}</p><p className="font-mono text-[7px] uppercase text-muted-foreground">Tokens</p></div><div className="bg-[#151313] p-3"><p className="font-heading text-2xl" data-testid="connected-ai-trace-revision">{trace.project_revision ?? "—"}</p><p className="font-mono text-[7px] uppercase text-muted-foreground">Revision</p></div></div>{trace.selected.map((item) => <div className="border-b border-border py-3" key={item.id} data-testid={`connected-ai-trace-${item.id}`}><p className="font-mono text-[8px] text-[#d7a0b1]" data-testid={`connected-ai-trace-${item.id}-label`}>{item.label}</p><p className="mt-1 text-[10px] text-muted-foreground" data-testid={`connected-ai-trace-${item.id}-reason`}>{item.reason}</p></div>)}</div> : null}
          <div className="mt-7 border-t border-border pt-6" data-testid="connected-ai-external-section"><p className="font-mono text-[9px] uppercase tracking-widest text-[#c47a91]" data-testid="connected-ai-external-title">Use with another AI</p><p className="mt-3 text-[11px] leading-5 text-muted-foreground" data-testid="connected-ai-external-description">Compatible external clients require a separately authorized MCP connection. Copying context creates a snapshot that Skipti cannot remotely erase.</p><code className="mt-3 block break-all bg-[#151313] p-3 font-mono text-[9px] text-[#8f8581]" data-testid="connected-ai-mcp-endpoint">{`${window.location.origin}/mcp/`}</code></div>
          <div className="mt-7 flex items-center gap-2 border-t border-border pt-5 text-[10px] text-muted-foreground" data-testid="connected-ai-retention-note"><Clock3 className="size-3.5" /> Chat {guest.data?.grant.retain_chat_until_expiry ? "is retained only until pass expiration" : "deletes when this session ends"}.</div>
        </aside>
      </div>
    </main>
  );
}
