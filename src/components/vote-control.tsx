import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number | null;
  onChange: (score: number | null) => Promise<void> | void;
}

/**
 * Control de voto 0–10. 11 chips en fila. Tap para votar; volver a
 * tocar el mismo valor retira el voto.
 */
export function VoteControl({ value, onChange }: Props) {
  const [pending, setPending] = useState(false);

  const handle = async (n: number) => {
    if (pending) return;
    const next = value === n ? null : n;
    setPending(true);
    try {
      await onChange(next);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Tu voto</span>
        <span>{value === null ? "Sin votar" : `${value}/10`}</span>
      </div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            disabled={pending}
            onClick={() => handle(n)}
            aria-label={`Votar ${n}`}
            aria-pressed={value === n}
            className={cn(
              "h-8 rounded-md border text-xs transition-colors",
              value === n
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
