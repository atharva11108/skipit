import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";

export function QueryError({ error, retry }: { error: unknown; retry: () => unknown }) {
  return <div className="panel p-6" role="alert" data-testid="query-error"><AlertCircle className="size-5 text-[#c47a91]" /><h2 className="mt-4 font-heading text-3xl">We couldn’t load this.</h2><p className="mt-2 text-sm text-muted-foreground">{errorMessage(error)}</p><Button className="mt-5" variant="outline" onClick={retry}><RefreshCw className="size-4" /> Try again</Button></div>;
}

export function EmptyState({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <div className="panel p-8 text-center" data-testid="empty-state"><h2 className="font-heading text-3xl">{title}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>{children ? <div className="mt-5">{children}</div> : null}</div>;
}
