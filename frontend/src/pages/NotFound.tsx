import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="editorial-grid grid min-h-screen place-items-center bg-background px-6 text-foreground" data-testid="not-found-page">
      <section className="panel relative w-full max-w-3xl overflow-hidden p-8 md:p-14" data-testid="not-found-card">
        <div className="absolute -right-12 -top-16 font-heading text-[16rem] leading-none text-[#2a1b20]" aria-hidden="true">4</div>
        <Compass className="size-6 text-[#c47a91]" />
        <p className="mt-10 font-mono text-[10px] uppercase tracking-[.28em] text-[#c47a91]" data-testid="not-found-code">Error 404</p>
        <h1 className="mt-4 max-w-xl font-heading text-6xl font-light leading-[.9] tracking-[-.035em] md:text-8xl" data-testid="not-found-title">This context path doesn't exist.</h1>
        <p className="mt-6 max-w-lg text-sm leading-7 text-muted-foreground" data-testid="not-found-description">Return to the workspace. Your approved Persona and Project Holders are still exactly where you left them.</p>
        <Link to="/dashboard" className={`${buttonVariants({ size: "lg" })} mt-9`} data-testid="not-found-return-link"><ArrowLeft className="size-4" /> Return to Skipti</Link>
      </section>
    </main>
  );
}