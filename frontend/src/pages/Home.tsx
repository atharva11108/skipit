import { ArrowDown, ArrowRight, Braces, Database, KeyRound, Route, ScanLine, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { buttonVariants } from "@/components/ui/button";
import { HeroAtmosphere } from "@/components/HeroAtmosphere";

const architecture = [
  { label: "Persona", detail: "Approved user context", icon: KeyRound },
  { label: "Router", detail: "Minimum disclosure", icon: Route },
  { label: "MCP", detail: "Cross-client protocol", icon: Braces },
  { label: "Memory", detail: "Canonical revisions", icon: Database },
];
const principles = [
  { title: "A little more you.", detail: "Keep your preferences, working style, and project knowledge in one evolving workspace.", label: "Build your context", icon: KeyRound },
  { title: "Only what is needed.", detail: "Choose the context to share. Route relevant details to each conversation with minimum disclosure.", label: "Choose what travels", icon: Route },
  { title: "Always in your hands.", detail: "Create temporary connections, review your approved memory, and revoke access when you are done.", label: "Stay in control", icon: ShieldCheck },
];

export default function Home() {
  const reducedMotion = useReducedMotion();
  const reveal = (delay = 0) => ({ initial: reducedMotion ? false as const : { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] as const } });
  return (
    <main className="editorial-grid home-page relative isolate min-h-screen overflow-hidden bg-[#0c0a09] text-[#fafaf9]" data-testid="public-home-page">
      <HeroAtmosphere />
      <nav className="public-nav glass-surface relative z-20 mx-auto flex max-w-[1436px] items-center justify-between gap-3 px-5 py-4 md:px-7" data-testid="public-navigation">
        <Link to="/" className="flex items-center gap-3 font-heading text-3xl" data-testid="home-logo-link"><img src="/skipti-mark.svg" alt="" className="brand-mark size-9 rounded-2xl" /> Skipti AI</Link>
        <div className="flex items-center gap-2"><Link to="/login" className={buttonVariants({ variant: "ghost", size: "sm", className: "rounded-full px-4" })} data-testid="home-login-link">Login</Link><Link to="/signup" className={buttonVariants({ size: "sm", className: "rounded-full px-4" })} data-testid="home-signup-link">Sign up <ArrowRight className="size-3.5" /></Link></div>
      </nav>
      <section className="relative mx-auto grid max-w-[1500px] items-center gap-4 px-6 pb-16 pt-12 md:px-10 lg:min-h-[calc(100svh-116px)] lg:grid-cols-[1.18fr_.82fr] lg:gap-8 lg:px-16 lg:pb-20 lg:pt-10" data-testid="home-hero-section">
        <div className="relative z-10 flex flex-col justify-center py-5 lg:py-12" data-testid="home-hero-copy">
          <motion.p {...reveal()} className="hero-eyebrow mb-8 flex w-fit items-center gap-3 rounded-full px-4 py-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[#d7a0b1]" data-testid="home-eyebrow"><span className="size-1.5 rounded-full bg-[#d7a0b1] shadow-[0_0_12px_#c47a91]" /> Context intelligence infrastructure</motion.p>
          <motion.h1 {...reveal(0.1)} className="max-w-4xl font-heading text-[clamp(4.3rem,8.6vw,8.5rem)] font-light leading-[.86] tracking-[-.055em]" data-testid="home-headline">Your context.<br /><em className="hero-accent font-normal">Any AI.</em><br />Temporarily.</motion.h1>
          <motion.p {...reveal(0.2)} className="mt-8 max-w-lg text-[15px] leading-7 text-[#b7adb0] md:text-base" data-testid="home-description">One evolving source of approved Persona and project memory. Routed with minimum disclosure, shared through a real MCP endpoint, and always controlled by you.</motion.p>
          <motion.div {...reveal(0.3)} className="mt-8 flex flex-wrap gap-3" data-testid="home-hero-actions">
            <Link to="/signup" className={buttonVariants({ size: "lg", className: "hero-primary group h-12 rounded-full px-6" })} data-testid="home-create-account-link">Create your account <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" /></Link>
            <Link to="/login" className={buttonVariants({ variant: "outline", size: "lg", className: "hero-secondary h-12 rounded-full px-6" })} data-testid="home-signin-link">Sign in</Link>
          </motion.div>
          <motion.div {...reveal(0.4)} className="glass-surface mt-10 grid max-w-lg grid-cols-3 overflow-hidden rounded-[1.75rem]" data-testid="home-proof-grid">
            {[{ value: "01", label: "Private workspace" }, { value: "100%", label: "Your approval" }, { value: "MCP", label: "Portable context" }].map((proof) => <div className="px-4 py-5 [&:not(:last-child)]:border-r [&:not(:last-child)]:border-white/[.07]" key={proof.label} data-testid={`home-proof-${proof.label.toLowerCase().replaceAll(" ", "-")}`}><p className="font-heading text-3xl text-[#f5f1ec]" data-testid={`home-proof-${proof.label.toLowerCase().replaceAll(" ", "-")}-value`}>{proof.value}</p><p className="mt-1 text-[10px] leading-4 text-[#aba0a3]" data-testid={`home-proof-${proof.label.toLowerCase().replaceAll(" ", "-")}-label`}>{proof.label}</p></div>)}
          </motion.div>
          <motion.p {...reveal(0.5)} className="mt-5 flex items-center gap-2 text-[10px] tracking-wide text-[#94868b]" data-testid="home-security-disclosure"><ShieldCheck className="size-3.5 shrink-0 text-[#c47a91]" /> Supabase accounts · Private project storage · Context-aware AI</motion.p>
        </div>
        <motion.div {...reveal(0.25)} className="hero-console glass-surface relative overflow-hidden rounded-[2.5rem] p-6 sm:p-8 lg:p-9" data-testid="home-architecture-panel">
          <img src="https://static.prod-images.emergentagent.com/jobs/998467b0-e0cb-41de-9528-3854c8262275/images/86651936e90994e3fab1ceb2e1097038611957257229a46dca61f4133da8715e.jpeg" alt="" className="animate-hero-drift pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-screen" data-testid="home-context-artwork" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#21141b]/35 via-[#100d0e]/60 to-[#100d0e]/95" />
          <div className="relative">
            <div className="mb-7 flex items-center justify-between gap-3"><span className="font-mono text-[9px] uppercase tracking-[.2em] text-[#c3b6ba]" data-testid="home-flow-label">How context flows</span><span className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-950/25 px-2.5 py-1.5 text-[9px] text-emerald-200" data-testid="home-flow-status"><span className="size-1.5 animate-status-pulse rounded-full bg-emerald-400" /> Owner controlled</span></div>
            <div className="context-orbit mx-auto mb-8 grid size-24 place-items-center" aria-hidden="true"><span className="context-orbit-ring" /><img src="/skipti-mark.svg" alt="" className="context-core size-12 rounded-2xl" /><span className="context-orbit-dot" /></div>
            <div className="context-flow space-y-3" data-testid="home-architecture-list">
              {architecture.map((item, index) => { const Icon = item.icon; return <motion.div key={item.label} {...reveal(0.35 + 0.1 * index)} className="context-flow-card glass-surface group relative rounded-[1.4rem] p-4 sm:p-5" data-testid={`home-architecture-${item.label.toLowerCase()}-card`}><div className="relative flex items-center gap-4"><span className="glass-icon grid size-11 shrink-0 place-items-center rounded-2xl text-[#e4b3c2]"><Icon className="size-4" /></span><div><p className="font-heading text-2xl" data-testid={`home-architecture-${item.label.toLowerCase()}-title`}>{item.label}</p><p className="text-[11px] text-[#b5a6ac]" data-testid={`home-architecture-${item.label.toLowerCase()}-detail`}>{item.detail}</p></div><span className="ml-auto font-mono text-[10px] text-[#9d7d88]" data-testid={`home-architecture-${item.label.toLowerCase()}-step`}>0{index + 1}</span></div></motion.div>; })}
            </div>
            <div className="endpoint-glass mt-6 rounded-[1.4rem] p-5" data-testid="home-mcp-endpoint-card"><div className="mb-3 flex items-center gap-2"><ScanLine className="size-4 text-[#d7a0b1]" /><span className="font-mono text-[9px] uppercase tracking-widest text-[#d7a0b1]" data-testid="home-mcp-transport">Streamable HTTP</span></div><code className="break-all font-mono text-xs text-[#ded5d8]" data-testid="home-mcp-endpoint">{`${window.location.origin}/mcp/`}</code></div>
          </div>
        </motion.div>
      </section>
      <section id="your-context" className="relative z-10 mx-auto max-w-[1372px] px-6 pb-20 md:px-10 lg:pb-28" aria-labelledby="principles-heading">
        <div className="mb-8 flex items-end justify-between gap-5 border-t border-white/[.08] pt-10"><div><p className="mb-3 text-[9px] uppercase tracking-[.24em] text-[#c47a91]">Less repetition. More continuity.</p><h2 id="principles-heading" className="font-heading text-4xl font-light md:text-5xl">Context that moves with you.</h2></div><ArrowDown className="mb-1 hidden size-5 text-[#b58696] sm:block" aria-hidden="true" /></div>
        <div className="grid gap-4 md:grid-cols-3">{principles.map((item, index) => { const Icon = item.icon; return <motion.article key={item.title} initial={reducedMotion ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6, delay: index * 0.08 }} className="principle-card glass-surface rounded-[1.8rem] p-7"><div className="mb-8 flex items-center justify-between"><Icon className="size-5 text-[#d7a0b1]" /><span className="font-mono text-[9px] text-[#8e7a82]">0{index + 1}</span></div><h3 className="font-heading text-3xl">{item.title}</h3><p className="mt-4 text-sm leading-6 text-[#b4a8ad]">{item.detail}</p><p className="mt-7 text-[9px] uppercase tracking-[.18em] text-[#d7a0b1]">{item.label}</p></motion.article>; })}</div>
      </section>
      <footer className="relative z-10 mx-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/[.08] py-7 text-xs text-muted-foreground lg:mx-12"><p>© {new Date().getFullYear()} Skipti AI</p><div className="flex flex-wrap gap-6"><Link to="/help" className="hover:text-foreground">Help & how it works</Link><Link to="/privacy" className="hover:text-foreground">Privacy & sharing</Link><Link to="/login" className="hover:text-foreground">Open workspace</Link></div></footer>
    </main>
  );
}
