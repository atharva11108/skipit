import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="mx-auto max-w-xl px-5 py-24"><section className="panel p-8"><h1 className="font-heading text-4xl">Something interrupted this page.</h1><p className="mt-4 text-sm text-muted-foreground">Your saved context is safe. Reload to try again.</p><Button className="mt-6" onClick={() => window.location.reload()}>Reload page</Button><a className="ml-5 text-sm text-[#d7a0b1]" href="/">Go home</a></section></main> : this.props.children; }
}
