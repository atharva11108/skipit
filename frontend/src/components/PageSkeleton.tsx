export function PageSkeleton({ cards = 3, testId = "page-loading-skeleton" }: { cards?: number; testId?: string }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading content" aria-busy="true" data-testid={testId}>
      {Array.from({ length: cards }, (_, index) => (
        <div className="panel min-h-52 p-6" key={index} data-testid={`${testId}-card-${index}`}>
          <div className="skeleton h-3 w-24 rounded-full" />
          <div className="skeleton mt-10 h-8 w-3/5 rounded-lg" />
          <div className="skeleton mt-4 h-3 w-full rounded-full" />
          <div className="skeleton mt-2 h-3 w-4/5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function InlineSkeleton({ className = "h-5 w-28" }: { className?: string }) {
  return <span className={`skeleton inline-block rounded-md ${className}`} aria-label="Loading" />;
}