import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Sparkles, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OCCASIONS, normalizeOccasions } from "@/lib/outfit-logs";
import { cn } from "@/lib/utils";

const RECENT_KEY = "wiw:recent-occasions";
const MAX_RECENT = 8;

const POPULAR: string[] = [
  "casual",
  "trabajo",
  "comida",
  "cena",
  "cita",
  "evento",
  "boda",
  "fiesta",
  "gimnasio",
  "viaje",
];

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((x) => typeof x === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

function saveRecent(next: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(next.slice(0, MAX_RECENT)),
    );
  } catch {
    /* noop */
  }
}

export function pushRecentOccasions(occasions: string[]) {
  if (occasions.length === 0) return;
  const prev = loadRecent();
  const merged = [...occasions, ...prev.filter((o) => !occasions.includes(o))];
  saveRecent(merged.slice(0, MAX_RECENT));
}

export function OccasionsPicker({
  value,
  onChange,
  autoFocus = false,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const toggle = (o: string) => {
    if (value.includes(o)) {
      onChange(value.filter((x) => x !== o));
    } else {
      onChange([...value, o]);
    }
  };

  const q = query.trim().toLowerCase();

  const filteredAll = useMemo(() => {
    if (!q) return OCCASIONS as readonly string[];
    return (OCCASIONS as readonly string[]).filter((o) =>
      o.toLowerCase().includes(q),
    );
  }, [q]);

  const quickRecent = useMemo(
    () => recent.filter((o) => (OCCASIONS as readonly string[]).includes(o)),
    [recent],
  );

  const quickPopular = useMemo(
    () => POPULAR.filter((o) => !quickRecent.includes(o)),
    [quickRecent],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && filteredAll.length > 0) {
      e.preventDefault();
      toggle(filteredAll[0]);
      setQuery("");
      inputRef.current?.focus();
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Búsqueda */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.5}
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar ocasión…"
          className="pl-8 pr-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Seleccionadas dentro del picker */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((o) => (
            <button
              key={`sel-${o}`}
              type="button"
              onClick={() => toggle(o)}
              className="inline-flex items-center gap-1 rounded-full border border-foreground bg-foreground px-2.5 py-0.5 text-[11px] capitalize text-background transition hover:opacity-80"
            >
              {o}
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          ))}
          {value.length > 1 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] text-muted-foreground underline"
            >
              Quitar todas
            </button>
          )}
        </div>
      )}

      {/* Chips rápidos */}
      {!q && (
        <div className="space-y-2">
          {quickRecent.length > 0 && (
            <QuickRow
              label="Recientes"
              icon={<Clock className="h-3 w-3" strokeWidth={1.5} />}
              options={quickRecent}
              value={value}
              onToggle={toggle}
            />
          )}
          <QuickRow
            label="Populares"
            icon={<Sparkles className="h-3 w-3" strokeWidth={1.5} />}
            options={quickPopular}
            value={value}
            onToggle={toggle}
          />
        </div>
      )}

      {/* Todas */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {q ? `${filteredAll.length} resultado${filteredAll.length === 1 ? "" : "s"}` : "Todas"}
          </span>
        </div>
        <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto pr-1">
          {filteredAll.length === 0 ? (
            <p className="w-full py-3 text-center text-xs text-muted-foreground">
              Sin coincidencias.
            </p>
          ) : (
            filteredAll.map((o) => {
              const active = value.includes(o);
              return (
                <Chip
                  key={o}
                  label={o}
                  active={active}
                  onClick={() => toggle(o)}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function QuickRow({
  label,
  icon,
  options,
  value,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  options: string[];
  value: string[];
  onToggle: (o: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip
            key={`${label}-${o}`}
            label={o}
            active={value.includes(o)}
            onClick={() => onToggle(o)}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs capitalize transition",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
