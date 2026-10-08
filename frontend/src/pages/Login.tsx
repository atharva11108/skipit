import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { HeroAtmosphere } from "@/components/HeroAtmosphere";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api";
import type { AuthResponse } from "@/lib/skipti";
import { beginSession } from "@/lib/session";

export default function Login() {
  const reducedMotion = useReducedMotion();
  const location = useLocation(); const navigate = useNavigate(); const client = useQueryClient();
  const signup = location.pathname === "/signup";
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState("");
  const auth = useMutation({
    mutationFn: () => apiPost<AuthResponse>(signup ? "/auth/signup" : "/auth/login", signup ? { email, password, display_name: displayName } : { email, password }),
    onSuccess: (result) => {
      if (result.requires_confirmation) { toast.success(result.message); navigate("/login"); return; }
      if (!result.user) throw new Error("Sign-in did not return an account. Please try again.");
      beginSession();
      if (result.user) client.setQueryData(["auth", "me"], result.user);
      toast.success(signup ? "Account created" : "Welcome back");
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from?.startsWith("/") && !from.startsWith("//") ? from : signup ? "/setup" : "/dashboard", { replace: true });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Authentication failed"),
  });
  return <main className="auth-page editorial-grid relative isolate grid min-h-screen overflow-hidden bg-[#0c0a09] text-foreground lg:grid-cols-2" data-testid={signup ? "signup-page" : "login-page"}>
    <HeroAtmosphere />
    <section className="auth-art-panel glass-surface relative m-5 hidden overflow-hidden rounded-[2.5rem] lg:block" data-testid="login-texture-panel">
      <img src="https://static.prod-images.emergentagent.com/jobs/998467b0-e0cb-41de-9528-3854c8262275/images/86651936e90994e3fab1ceb2e1097038611957257229a46dca61f4133da8715e.jpeg" alt="" className="animate-hero-drift absolute inset-0 h-full w-full object-cover opacity-55" data-testid="login-custom-artwork" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#100c0f] via-[#130d12]/45 to-[#201018]/20" />
      <div className="absolute left-8 right-8 top-8 flex items-center justify-between"><span className="glass-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-[10px] text-[#e2bdc9]"><ShieldCheck className="size-3.5" /> Your private workspace</span><span className="font-mono text-[9px] uppercase tracking-[.2em] text-[#cfb1ba]">Skipti / 01</span></div>
      <div className="auth-orbit context-orbit absolute left-1/2 top-[32%] grid size-40 -translate-x-1/2 place-items-center" aria-hidden="true"><span className="context-orbit-ring" /><img src="/skipti-mark.svg" alt="" className="context-core size-20 rounded-3xl" /><span className="context-orbit-dot" /></div>
      <motion.div initial={reducedMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.15 }} className="absolute inset-x-8 bottom-8 z-10 xl:inset-x-12 xl:bottom-12">
        <div className="glass-surface rounded-[2rem] p-7 xl:p-8"><p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.26em] text-[#e0a7ba]" data-testid="login-quote-label"><Sparkles className="size-3.5" /> Private by design</p><blockquote className="mt-5 max-w-xl font-heading text-[clamp(2.5rem,4vw,4rem)] font-light leading-[1.04] tracking-[-.025em]" data-testid="login-quote">“Your context should travel with you — and remain yours.”</blockquote><div className="mt-7 flex flex-wrap gap-2"><span className="glass-chip rounded-full px-3 py-1.5 text-[10px] text-[#c9bbc0]">One evolving Persona</span><span className="glass-chip rounded-full px-3 py-1.5 text-[10px] text-[#c9bbc0]">Every conversation, connected</span></div></div>
      </motion.div>
    </section>
    <section className="relative z-10 flex items-center justify-center px-5 py-10 md:px-10 lg:py-12" data-testid="login-form-section">
      <motion.div initial={reducedMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75 }} className="w-full max-w-[460px]">
        <Link to="/" className="mb-8 flex items-center gap-3 font-heading text-3xl" data-testid="login-product-name"><img src="/skipti-mark.svg" alt="" className="brand-mark size-10 rounded-2xl" /> Skipti AI</Link>
        <form className="auth-glass panel relative p-7 md:p-9" onSubmit={(event) => { event.preventDefault(); auth.mutate(); }} data-testid={signup ? "signup-form" : "login-form"}>
          <div className="flex items-center justify-between"><span className="glass-icon grid size-12 place-items-center rounded-2xl text-[#e4b3c2]"><LockKeyhole className="size-4" /></span><span className="text-[9px] uppercase tracking-[.18em] text-[#a78c97]">{signup ? "A fresh beginning" : "Welcome back"}</span></div>
          <h1 className="mt-7 font-heading text-[2.8rem] font-light leading-[1.02] md:text-5xl" data-testid="login-title">{signup ? "Create your context room." : "Enter your context room."}</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground" data-testid="login-description">{signup ? "One private account for your Persona, projects, files, and temporary AI connections." : "Sign in to your private Persona and canonical project memory."}</p>
          <div className="mt-7 space-y-4">
            {signup ? <div><label htmlFor="display-name" className="mb-2 block text-xs text-muted-foreground">Display name</label><Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" minLength={2} maxLength={80} required data-testid="signup-display-name-input" /></div> : null}
            <div><label htmlFor="email" className="mb-2 block text-xs text-muted-foreground">Email address</label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required data-testid="auth-email-input" /></div>
            <div><label htmlFor="password" className="mb-2 block text-xs text-muted-foreground">Password</label><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={signup ? "new-password" : "current-password"} minLength={8} maxLength={128} required data-testid="auth-password-input" /></div>
          </div>
          {!signup ? <Link to="/forgot-password" className="mt-4 block text-right text-xs text-[#d7a0b1]">Forgot password?</Link> : null}
          <Button className="hero-primary mt-7 h-12 w-full rounded-full" size="lg" type="submit" disabled={auth.isPending} data-testid="auth-submit-button">{auth.isPending ? "Securing account…" : signup ? "Create account" : "Sign in"}<ArrowRight className="size-4" /></Button>
          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">{signup ? "Already have an account?" : "New to Skipti?"} <Link to={signup ? "/login" : "/signup"} className="font-medium text-[#d7a0b1] underline-offset-4 hover:underline" data-testid="auth-mode-switch-link">{signup ? "Sign in" : "Create an account"}</Link></p>
        </form>
        <p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-[#ac9aa2]"><ShieldCheck className="size-3.5" /> Your context. Your permission. Always.</p>
      </motion.div>
    </section>
  </main>;
}
