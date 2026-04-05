import { ErrorBoundary } from "react-error-boundary";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--status-critical)/0.12)] flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-[hsl(var(--status-critical))]" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-1">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mb-1 max-w-sm">
        An unexpected error occurred in this view. Your data is safe.
      </p>
      {error?.message && (
        <code className="text-xs text-muted-foreground bg-[hsl(var(--surface-1))] border border-border rounded px-3 py-1.5 mb-4 max-w-sm block truncate">
          {error.message}
        </code>
      )}
      <Button size="sm" onClick={resetErrorBoundary} className="gap-2">
        <RefreshCw className="w-3.5 h-3.5" />
        Try again
      </Button>
    </div>
  );
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
      {children}
    </ErrorBoundary>
  );
}
