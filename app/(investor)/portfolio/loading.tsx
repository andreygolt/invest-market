export default function PortfolioLoading() {
  return (
    <main className="container mx-auto px-4 py-8 space-y-6">
      <div className="h-8 w-56 bg-muted rounded animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-lg border p-4 animate-pulse">
            <div className="h-4 w-3/4 bg-muted rounded" />
          </div>
        ))}
      </div>
    </main>
  );
}
