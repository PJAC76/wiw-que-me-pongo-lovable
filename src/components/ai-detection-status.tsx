/**
 * Panel visual del estado de la detección IA.
 * Barra de progreso + etiqueta de etapa + card de error clara con reintento.
 */

import { AlertCircle, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import type { AiDetectionStage, AiDetectionUiError } from "@/hooks/use-ai-detection";

interface Props {
  stage: AiDetectionStage;
  progress: number;
  label: string;
  error: AiDetectionUiError | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function AiDetectionStatus({
  stage,
  progress,
  label,
  error,
  onRetry,
  onDismiss,
  className,
}: Props) {
  if (stage === "idle" && !error) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-stage={stage}
      className={`space-y-2 rounded-lg border border-border bg-card px-3 py-3 ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 text-sm">
        <StageIcon stage={stage} />
        <span className="flex-1 leading-tight">{label}</span>
        {stage !== "error" && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {Math.round(progress)}%
          </span>
        )}
        {onDismiss && (stage === "success" || stage === "error") && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {stage !== "error" && (
        <Progress
          value={progress}
          className={stage === "success" ? "[&>div]:bg-emerald-500" : undefined}
        />
      )}

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          data-error-code={error.code}
          className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-medium leading-tight">{error.title}</p>
            <p className="leading-snug text-destructive/85">{error.message}</p>
            {error.hint && (
              <p className="leading-snug text-muted-foreground">{error.hint}</p>
            )}
            {error.retryable && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-1 inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
              >
                Reintentar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StageIcon({ stage }: { stage: AiDetectionStage }) {
  switch (stage) {
    case "preparing":
    case "analyzing":
      return <Loader2 className="h-4 w-4 animate-spin text-foreground/70" />;
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Sparkles className="h-4 w-4 text-foreground/70" />;
  }
}
