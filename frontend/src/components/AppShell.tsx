import { NavLink } from "react-router-dom";
import {
  Blocks,
  BookOpenText,
  Braces,
  LayoutDashboard,
  Menu,
  Settings,
  Share2,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { UserView } from "@/lib/skipti";

const nav = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/setup", label: "Persona interview", icon: Sparkles },
  { to: "/context", label: "Persona core", icon: UserRound },
  { to: "/projects", label: "Project holders", icon: Blocks },
  { to: "/playground", label: "MCP playground", icon: Braces },
  { to: "/share", label: "Persona pass", icon: Share2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

const mobilePrimary = [nav[0], nav[2], nav[3], nav[4], nav[5]];

export function AppShell({ children }: { children: ReactNode }) {
  const account = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<UserView>("/auth/me"), staleTime: 30_000 });
  const user = account.data;
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="skipti-app-shell">
      <a href="#main-content" className="fixed left-4 top-3 z-[80] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-[transform] focus:translate-y-0" data-testid="skip-to-content-link">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-border bg-[#100e0e] p-6 lg:flex lg:flex-col" data-testid="desktop-navigation-sidebar">
        <NavLink to="/dashboard" className="mb-12 block" data-testid="sidebar-skipti-logo-link">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl border border-[#6e0d25] bg-[#1b0c10] shadow-[0_8px_24px_rgba(110,13,37,.16)]" data-testid="sidebar-logo-mark"><BookOpenText className="size-4 text-[#d7a0b1]" /></div>
            <div>
              <p className="font-heading text-2xl leading-none" data-testid="sidebar-product-name">Skipti AI</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground" data-testid="sidebar-protocol-label">Context infrastructure</p>
            </div>
          </div>
        </NavLink>
        <nav className="space-y-1" data-testid="sidebar-navigation-list">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={`sidebar-${item.label.toLowerCase().replaceAll(" ", "-")}-link`}
                className={({ isActive }) => cn("group flex items-center gap-3 rounded-xl border px-3 py-3 text-sm text-muted-foreground transition-[color,background-color,border-color,transform] duration-200 hover:translate-x-0.5 hover:border-[#4a3039] hover:bg-[#1c1718] hover:text-foreground", isActive ? "border-[#6e3346] bg-[#211519] text-foreground shadow-[0_8px_22px_rgba(0,0,0,.14)]" : "border-transparent")}
              >
                <Icon className="size-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-border bg-[#151313] p-4 shadow-[0_16px_36px_rgba(0,0,0,.18)]" data-testid="sidebar-owner-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground" data-testid="sidebar-owner-mode">Secure account</span>
            <span className="size-1.5 animate-status-pulse rounded-full bg-[#c47a91]" data-testid="sidebar-connection-indicator" />
          </div>
          <p className="text-sm font-medium" data-testid="sidebar-owner-name">{user?.display_name ?? "Loading account…"}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground" data-testid="sidebar-owner-email">{user?.email ?? ""}</p>
        </div>
      </aside>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-[#0c0a09]/90 px-5 backdrop-blur-xl lg:hidden" data-testid="mobile-header">
        <NavLink to="/dashboard" className="font-heading text-2xl" data-testid="mobile-logo-link">Skipti</NavLink>
        <details ref={menu} className="group relative" data-testid="mobile-more-menu">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-[#6e0d25] px-3 py-2 font-mono text-[10px] uppercase tracking-widest marker:hidden" data-testid="mobile-more-menu-button"><Menu className="size-3.5" /> More</summary>
          <nav className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-border bg-[#151313] p-2 shadow-[0_24px_60px_rgba(0,0,0,.45)]" aria-label="More destinations" data-testid="mobile-more-menu-list">
            {nav.map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} onClick={() => { if (menu.current) menu.current.open = false; }} className={({ isActive }) => cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground transition-[color,background-color] hover:bg-[#21191b] hover:text-foreground", isActive && "bg-[#26171c] text-foreground")} data-testid={`mobile-menu-${item.label.toLowerCase().replaceAll(" ", "-")}-link`}><Icon className="size-4" />{item.label}</NavLink>; })}
          </nav>
        </details>
      </header>
      <main id="main-content" className="page-enter relative z-10 mx-auto px-5 pb-28 pt-8 lg:ml-72 lg:max-w-[1800px] lg:px-12 lg:pb-14 lg:pt-12" data-testid="app-main-content">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 gap-1 border-t border-border bg-[#100e0e]/95 px-2 py-2 backdrop-blur-xl lg:hidden" aria-label="Primary navigation" data-testid="mobile-bottom-navigation">
        {mobilePrimary.map((item) => {
          const Icon = item.icon;
          const mobileLabel = item.to === "/context" ? "Core" : item.to === "/share" ? "Pass" : item.label.split(" ")[0];
          return <NavLink key={item.to} to={item.to} aria-label={item.label} className={({ isActive }) => cn("flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[9px] text-muted-foreground transition-[color,background-color]", isActive && "bg-[#26171c] text-[#e3aabd]")} data-testid={`mobile-${item.label.toLowerCase().replaceAll(" ", "-")}-link`}><Icon className="size-4" />{mobileLabel}</NavLink>;
        })}
      </nav>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="workspace-hero glass-surface mb-10 flex flex-col gap-7 p-6 md:flex-row md:items-end md:justify-between md:p-8 lg:mb-12 lg:p-10" data-testid={`${eyebrow.toLowerCase().replaceAll(" ", "-")}-page-header`}>
      <div className="max-w-3xl">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#c47a91]" data-testid="page-header-eyebrow">{eyebrow}</p>
        <h1 className="font-heading text-[clamp(2.9rem,7vw,5rem)] font-light leading-[.92] tracking-[-.035em]" data-testid="page-header-title">{title}</h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground" data-testid="page-header-description">{description}</p>
      </div>
      {action ? <div data-testid="page-header-action">{action}</div> : null}
    </header>
  );
}

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "good" | "warning" }) {
  const tones = { neutral: "border-border text-muted-foreground", brand: "border-[#6e0d25] bg-[#1d0b10] text-[#e0a7b8]", good: "border-emerald-900 bg-emerald-950/40 text-emerald-300", warning: "border-amber-900 bg-amber-950/30 text-amber-300" };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.14em]", tones[tone])}>{children}</span>;
}
