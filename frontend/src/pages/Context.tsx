import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { AppShell, PageHeader, StatusPill } from "@/components/AppShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { ContextSearchResponse, EntryType, PersonaEntry, PersonaView } from "@/lib/skipti";
import { PageSkeleton } from "@/components/PageSkeleton";
import { EmptyState, QueryError } from "@/components/QueryError";

export default function Context() {
  const client = useQueryClient();
  const [category, setCategory] = useState("Goals"); const [label, setLabel] = useState(""); const [value, setValue] = useState("");
  const [entryType, setEntryType] = useState<EntryType>("goal"); const [sensitive, setSensitive] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); const [query, setQuery] = useState(""); const [filter, setFilter] = useState(""); const [deleteId, setDeleteId] = useState<string | null>(null);
  const persona = useQuery({ queryKey: ["persona"], queryFn: () => apiGet<PersonaView>("/persona") });
  const refresh = () => { client.invalidateQueries({ queryKey: ["persona"] }); client.invalidateQueries({ queryKey: ["overview"] }); search.reset(); };
  const reset = () => { setEditing(null); setLabel(""); setValue(""); setSensitive(false); };
  const save = useMutation({ mutationFn: () => {
    const body = { category: category.trim(), label: label.trim(), value: value.trim(), entry_type: entryType, sensitivity: sensitive ? "sensitive" : "standard" };
    return editing ? apiPatch<PersonaEntry>(`/persona/entries/${editing}`, body) : apiPost<PersonaEntry>("/persona/entries", body);
  }, onSuccess: () => { refresh(); reset(); toast.success(editing ? "Context updated" : "Context entry approved"); }, onError: (error) => toast.error(error.message) });
  const remove = useMutation({ mutationFn: (id: string) => apiDelete(`/persona/entries/${id}`), onSuccess: () => { refresh(); if (editing === deleteId) reset(); setDeleteId(null); toast.success("Context entry deleted"); }, onError: (error) => toast.error(error.message) });
  const approve = useMutation({ mutationFn: (id: string) => apiPost(`/persona/entries/${id}/approve`), onSuccess: () => { refresh(); toast.success("Candidate approved"); }, onError: (error) => toast.error(error.message) });
  const search = useMutation({ mutationFn: () => apiPost<ContextSearchResponse>("/context/search", { query: query.trim(), max_entries: 5 }), onError: (error) => toast.error(error.message) });
  const entries = (persona.data?.entries ?? []).filter((entry) => `${entry.category} ${entry.label} ${entry.value}`.toLowerCase().includes(filter.toLowerCase()));
  const grouped = entries.reduce<Record<string, PersonaEntry[]>>((acc, entry) => { (acc[entry.category] ??= []).push(entry); return acc; }, {});
  const startEdit = (entry: PersonaEntry) => { setEditing(entry.id); setCategory(entry.category); setLabel(entry.label); setValue(entry.value); setEntryType(entry.entry_type); setSensitive(entry.sensitivity === "sensitive"); document.getElementById("context-add-form")?.scrollIntoView({ block: "center" }); };
  return <AppShell><PageHeader eyebrow="Persona core" title="Approved context, in full view." description="Keep the facts, goals, and preferences your AI should know. Review each addition and change it whenever you need." action={<StatusPill tone="brand">Revision {persona.data?.revision ?? "—"}</StatusPill>} />
    {persona.isLoading ? <PageSkeleton cards={4} /> : persona.isError ? <QueryError error={persona.error} retry={() => persona.refetch()} /> : <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <div className="space-y-5"><Input aria-label="Filter persona entries" placeholder="Find context…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {!entries.length ? <EmptyState title={filter ? "No matching context" : "Your Persona starts here."} description={filter ? "Try a different search." : "Add an entry or start a guided interview to build useful context."}><Link to="/setup" className={buttonVariants({ variant: "outline" })}>Start persona interview</Link></EmptyState> : null}
        {Object.entries(grouped).map(([group, items]) => <article className="panel" key={group}><div className="flex items-center justify-between border-b border-border p-5"><h2 className="font-heading text-3xl">{group}</h2><StatusPill>{items.length} entries</StatusPill></div><div className="divide-y divide-border">{items.map((entry) => <div className="p-5" key={entry.id} data-testid={`context-entry-${entry.id}`}><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{entry.label}</p><StatusPill tone={entry.approval_status === "approved" ? "good" : "warning"}>{entry.approval_status}</StatusPill>{entry.sensitivity === "sensitive" ? <StatusPill>Sensitive · private</StatusPill> : null}</div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{entry.value}</p><p className="mt-3 text-[10px] text-muted-foreground">{entry.entry_type} · {entry.scope} · {entry.source}</p></div><Button variant="ghost" size="icon-sm" aria-label={`Edit ${entry.label}`} onClick={() => startEdit(entry)} data-testid={`context-entry-${entry.id}-edit-button`}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="icon-sm" aria-label={`Delete ${entry.label}`} onClick={() => setDeleteId(entry.id)} data-testid={`context-entry-${entry.id}-delete-button`}><Trash2 className="size-3.5" /></Button></div>
          {entry.approval_status === "candidate" ? <Button className="mt-4" size="sm" disabled={approve.isPending} onClick={() => approve.mutate(entry.id)}>Approve candidate</Button> : null}
          {deleteId === entry.id ? <div className="mt-4 rounded-lg border border-red-900/50 p-4" role="alert"><p className="text-sm">Delete this entry permanently?</p><div className="mt-3 flex gap-2"><Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(entry.id)}>Delete entry</Button><Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button></div></div> : null}
        </div>)}</div></article>)}
      </div>
      <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start"><form id="context-add-form" className="panel p-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} data-testid="context-add-form"><h2 className="font-heading text-3xl">{editing ? "Edit context" : "Add context"}</h2><div className="mt-6 space-y-4">
        <div><label htmlFor="context-category" className="mb-2 block text-xs text-muted-foreground">Category</label><Input id="context-category" value={category} onChange={(e) => setCategory(e.target.value)} required minLength={2} maxLength={60} data-testid="context-category-input" /></div>
        <div><label htmlFor="context-label" className="mb-2 block text-xs text-muted-foreground">Label</label><Input id="context-label" value={label} onChange={(e) => setLabel(e.target.value)} required minLength={2} maxLength={100} data-testid="context-label-input" /></div>
        <div><label htmlFor="context-value" className="mb-2 block text-xs text-muted-foreground">Context</label><Textarea id="context-value" value={value} onChange={(e) => setValue(e.target.value)} required maxLength={2000} data-testid="context-value-input" /></div>
        <div><label htmlFor="context-type" className="mb-2 block text-xs text-muted-foreground">Entry type</label><select id="context-type" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={entryType} onChange={(e) => setEntryType(e.target.value as EntryType)}>{["fact", "preference", "constraint", "goal"].map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
        <label className="flex items-center gap-3 text-xs text-muted-foreground"><input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} /> Sensitive: exclude from AI, passes, and exports</label>
        </div><div className="mt-5 flex gap-2"><Button type="submit" disabled={save.isPending || !category.trim() || !label.trim() || !value.trim()} data-testid="context-add-submit-button"><Plus className="size-4" /> {save.isPending ? "Saving…" : editing ? "Save changes" : "Add approved entry"}</Button>{editing ? <Button type="button" variant="ghost" onClick={reset}><X className="size-4" /> Cancel</Button> : null}</div></form>
        <form className="panel p-6" onSubmit={(e) => { e.preventDefault(); search.mutate(); }} data-testid="context-router-form"><h2 className="font-heading text-3xl">Test minimum disclosure</h2><p className="mt-3 text-xs leading-5 text-muted-foreground">See which approved entries match a question.</p><div className="mt-5 flex gap-2"><Input aria-label="Context search question" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What should I learn next?" minLength={2} required data-testid="context-router-query-input" /><Button type="submit" size="icon" disabled={search.isPending || query.trim().length < 2} aria-label="Search context" data-testid="context-router-search-button"><Search className="size-4" /></Button></div>
        {search.data ? <div className="mt-5" aria-live="polite" data-testid="context-router-results"><p className="text-xs text-muted-foreground">{search.data.selected.length} selected · {search.data.excluded_count} excluded · ~{search.data.approximate_tokens} tokens</p>{!search.data.selected.length ? <p className="mt-4 text-sm text-muted-foreground">No approved context matches this question.</p> : null}{search.data.selected.map((item) => <div className="mt-4 border-t border-border pt-4" key={item.id}><p className="text-sm text-[#d7a0b1]">{item.category} / {item.label}</p><p className="mt-2 text-xs text-muted-foreground">{item.value}</p><p className="mt-2 text-[10px] text-muted-foreground">{item.reason}</p></div>)}</div> : null}</form>
      </aside></section>}
  </AppShell>;
}
