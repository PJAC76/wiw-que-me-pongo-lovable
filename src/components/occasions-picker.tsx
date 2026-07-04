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
  const norm = normalizeOccasions(occasions);
  if (norm.length === 0) return;
  const prev = loadRecent();
  const merged = normalizeOccasions([...norm, ...prev]);
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
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const normalizedValue = useMemo(() => normalizeOccasions(value), [value]);

  const emit = (next: string[]) => onChange(normalizeOccasions(next));

  const toggle = (o: string) => {
    const key = o.trim().toLowerCase();
    if (!key) return;
    if (normalizedValue.includes(key)) {
      emit(normalizedValue.filter((x) => x !== key));
    } else {
      emit([...normalizedValue, key]);
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

  // Reajusta el índice activo cuando cambia la lista visible (búsqueda).
  useEffect(() => {
    setActiveIndex((i) => {
      if (filteredAll.length === 0) return 0;
      return Math.min(i, filteredAll.length - 1);
    });
  }, [filteredAll]);

  const focusChip = (idx: number) => {
    const el = chipRefs.current[idx];
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    }
  };

  const moveActive = (delta: number) => {
    if (filteredAll.length === 0) return;
    const next = (activeIndex + delta + filteredAll.length) % filteredAll.length;
    setActiveIndex(next);
    focusChip(next);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      if (filteredAll.length === 0) return;
      e.preventDefault();
      setActiveIndex(0);
      focusChip(0);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      if (filteredAll.length === 0) return;
      e.preventDefault();
      const last = filteredAll.length - 1;
      setActiveIndex(last);
      focusChip(last);
    } else if (e.key === "Enter") {
      if (filteredAll.length === 0) return;
      e.preventDefault();
      toggle(filteredAll[activeIndex] ?? filteredAll[0]);
      setQuery("");
      inputRef.current?.focus();
    } else if (e.key === "Escape") {
      if (query) {
        e.preventDefault();
        setQuery("");
      }
    }
  };

  const handleChipKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
      focusChip(0);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = filteredAll.length - 1;
      setActiveIndex(last);
      focusChip(last);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(filteredAll[idx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
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
      {normalizedValue.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {normalizedValue.map((o) => (
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
          {normalizedValue.length > 1 && (
            <button
              type="button"
              onClick={() => emit([])}
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
              value={normalizedValue}
              onToggle={toggle}
            />
          )}
          <QuickRow
            label="Populares"
            icon={<Sparkles className="h-3 w-3" strokeWidth={1.5} />}
            options={quickPopular}
            value={normalizedValue}
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
              const active = normalizedValue.includes(o);
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
