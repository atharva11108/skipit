/** Decorative layers stay behind content and never capture input. */
export function HeroAtmosphere({ className = "" }: { className?: string }) {
  return <div className={`hero-atmosphere ${className}`} aria-hidden="true">
    <span className="hero-orb hero-orb-rose" />
    <span className="hero-orb hero-orb-warm" />
    <span className="hero-orbit hero-orbit-outer" />
    <span className="hero-orbit hero-orbit-inner" />
    <span className="hero-star hero-star-one" />
    <span className="hero-star hero-star-two" />
  </div>;
}
