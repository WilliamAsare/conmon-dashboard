"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
      <h2 className="text-xl font-semibold">Could not load dashboard</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        {error.message}
        {error.digest && (
          <span className="block mt-1 font-mono text-xs">
            Reference: {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={reset}
        className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
