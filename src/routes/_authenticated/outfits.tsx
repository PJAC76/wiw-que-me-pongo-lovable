import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon,
  Shirt,
  Trash2,
  X,
  Filter,
  Pencil,
  Check,
  Download,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import {
  OCCASIONS,
  deleteOutfitLog,
  formatDayLabel,
  groupLogsByWeek,
  listOutfitLogs,
  logOutfit,
  updateOutfitLog,
  type OutfitLog,
} from "@/lib/outfit-logs";
import {
  CATEGORY_LABELS,
  listClothingItems,
  type ClothingItem,
} from "@/lib/wardrobe";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  exportOutfitLogsCSV,
  exportOutfitLogsPDF,
} from "@/lib/export-outfit-logs";

export const Route = createFileRoute("/_authenticated/outfits")({
  head: () => ({
    meta: [
      { title: "Historial de outfits — WIW" },
      {
        name: "description",
        content:
          "Qué te pusiste cada semana. Filtra por fecha y por etiquetas de ocasión.",
      },
    ],
  }),
  component: OutfitsHistoryScreen,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function OutfitsHistoryScreen() {
  const { user } = useAuth();
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([]);
  const [occasionQuery, setOccasionQuery] = useState("");

  const filters = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      occasions: selectedOccasions.length ? selectedOccasions : undefined,
    }),
    [from, to, selectedOccasions],
  );

  const { data: logs, isLoading } = useQuery({
    queryKey: ["outfit_logs", user?.id, filters],
    queryFn: () => listOutfitLogs(user!.id, filters),
    enabled: !!user,
  });

  const { data: items } = useQuery({
    queryKey: ["clothing_items", user?.id],
    queryFn: () => listClothingItems(user!.id),
    enabled: !!user,
  });

  const itemsById = useMemo(() => {
    const map = new Map<string, ClothingItem>();
    (items ?? []).forEach((i) => map.set(i.id, i));
    return map;
  }, [items]);

  const weeks = useMemo(() => groupLogsByWeek(logs ?? []), [logs]);

  const filteredOccasions = OCCASIONS.filter((o) =>
    o.toLowerCase().includes(occasionQuery.toLowerCase()),
  );

  const activeFilters =
    (from ? 1 : 0) + (to ? 1 : 0) + selectedOccasions.length;

  return (
    <AppShell
      eyebrow="Historial"
      title="¿Qué me puse?"
      rightSlot={
        <Link
          to="/stats"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          Estadísticas
        </Link>
      }
    >
      {/* Filtros de fecha rápidos */}
      <div className="mb-3 flex flex-wrap gap-2">
        <QuickChip
          label="Esta semana"
          onClick={() => {
            setFrom(daysAgoISO(6));
            setTo(todayISO());
          }}
        />
        <QuickChip
          label="Últimos 30 días"
          onClick={() => {
            setFrom(daysAgoISO(29));
            setTo(todayISO());
          }}
        />
        <QuickChip
          label="Este año"
          onClick={() => {
            const y = new Date().getFullYear();
            setFrom(`${y}-01-01`);
            setTo(todayISO());
          }}
        />
        {activeFilters > 0 && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setSelectedOccasions([]);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-3 w-3" /> Limpiar ({activeFilters})
          </button>
        )}
        <ExportMenu
          logs={logs ?? []}
          itemsById={itemsById}
          filters={filters}
          disabled={isLoading || (logs?.length ?? 0) === 0}
        />

      </div>

      {/* Rango de fechas manual */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Desde
          </Label>
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Hasta
          </Label>
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {/* Filtro por ocasiones (combinables) */}
      <div className="mb-6">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition hover:bg-secondary"
            >
              <span className="inline-flex items-center gap-2">
                <Filter className="h-4 w-4" strokeWidth={1.5} />
                Ocasiones
                {selectedOccasions.length > 0 && (
                  <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] text-background">
                    {selectedOccasions.length}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {selectedOccasions.length
                  ? "combinar (AND)"
                  : "todas"}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[92vw] max-w-[420px] p-3"
          >
            <Input
              placeholder="Buscar ocasión…"
              value={occasionQuery}
              onChange={(e) => setOccasionQuery(e.target.value)}
              className="mb-3"
            />
            <div className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
              {filteredOccasions.map((o) => {
                const active = selectedOccasions.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() =>
                      setSelectedOccasions((prev) =>
                        prev.includes(o)
                          ? prev.filter((x) => x !== o)
                          : [...prev, o],
                      )
                    }
                    className={
                      "rounded-full border px-3 py-1 text-xs capitalize transition " +
                      (active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-muted-foreground hover:text-foreground")
                    }
                  >
                    {o}
                  </button>
                );
              })}
            </div>
            {selectedOccasions.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedOccasions([])}
                className="mt-3 text-xs text-muted-foreground underline"
              >
                Quitar todas
              </button>
            )}
          </PopoverContent>
        </Popover>

        {selectedOccasions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectedOccasions.map((o) => (
              <span
                key={o}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] capitalize text-foreground"
              >
                {o}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedOccasions((prev) => prev.filter((x) => x !== o))
                  }
                  aria-label={`Quitar ${o}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Contenido */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : weeks.length === 0 ? (
        <EmptyHistory hasFilters={activeFilters > 0} />
      ) : (
        <ul className="space-y-8">
          {weeks.map((w) => (
            <li key={w.key}>
              <div className="mb-3 flex items-center gap-2">
                <CalendarIcon
                  className="h-4 w-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <h2 className="font-display text-lg leading-none">
                  {w.label}
                </h2>
                <span className="ml-auto text-[11px] uppercase tracking-wider text-muted-foreground">
                  {w.logs.length}{" "}
                  {w.logs.length === 1 ? "outfit" : "outfits"}
                </span>
              </div>
              <ul className="space-y-3">
                {w.logs.map((log) => (
                  <LogCard key={log.id} log={log} itemsById={itemsById} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function QuickChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
    >
      {label}
    </button>
  );
}

function LogCard({
  log,
  itemsById,
}: {
  log: OutfitLog;
  itemsById: Map<string, ClothingItem>;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["outfit_logs", user?.id] });

  const restore = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sesión no disponible");
      return logOutfit({
        user_id: user.id,
        worn_on: log.worn_on,
        occasions: log.occasions,
        item_ids: log.item_ids,
        note: log.note,
      });
    },
    onSuccess: () => {
      toast.success("Registro restaurado");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message ?? "No se pudo restaurar"),
  });

  const del = useMutation({
    mutationFn: () => deleteOutfitLog(log.id),
    onSuccess: () => {
      invalidate();
      toast.success("Registro eliminado", {
        action: {
          label: "Deshacer",
          onClick: () => restore.mutate(),
        },
      });
    },
    onError: (e) => toast.error((e as Error).message ?? "No se pudo eliminar"),
  });

  const items = log.item_ids
    .map((id) => itemsById.get(id))
    .filter((x): x is ClothingItem => !!x);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-[10px]">
            {formatDayLabel(log.worn_on)}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {log.occasions.length > 0 ? (
              log.occasions.map((o) => (
                <span
                  key={o}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[10px] capitalize text-foreground"
                >
                  {o}
                </span>
              ))
            ) : (
              <span className="text-[10px] italic text-muted-foreground">
                Sin ocasiones
              </span>
            )}
            <EditOccasionsPopover log={log} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => del.mutate()}
          disabled={del.isPending}
          className="text-muted-foreground transition hover:text-destructive disabled:opacity-50"
          aria-label="Eliminar registro"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
      {items.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {items.map((it) => (
            <ItemThumb key={it.id} item={it} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Las prendas de este outfit ya no están en tu armario.
        </p>
      )}
      {log.note && (
        <p className="mt-3 text-xs text-muted-foreground">{log.note}</p>
      )}
    </div>
  );
}

function EditOccasionsPopover({ log }: { log: OutfitLog }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(log.occasions);
  const [query, setQuery] = useState("");

  const filtered = OCCASIONS.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase()),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["outfit_logs", user?.id] });

  const revert = useMutation({
    mutationFn: (previous: string[]) =>
      updateOutfitLog(log.id, { occasions: previous }),
    onSuccess: () => {
      toast.success("Cambios revertidos");
      invalidate();
    },
    onError: (e) =>
      toast.error((e as Error).message ?? "No se pudo deshacer"),
  });

  const save = useMutation({
    mutationFn: () => updateOutfitLog(log.id, { occasions: selected }),
    onSuccess: () => {
      const previous = log.occasions;
      invalidate();
      setOpen(false);
      toast.success("Ocasiones actualizadas", {
        action: {
          label: "Deshacer",
          onClick: () => revert.mutate(previous),
        },
      });
    },
    onError: (e) =>
      toast.error((e as Error).message ?? "No se pudo actualizar"),
  });

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setSelected(log.occasions);
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground transition hover:border-foreground hover:text-foreground"
          aria-label="Editar ocasiones"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.5} />
          {log.occasions.length === 0 ? "Añadir" : "Editar"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[92vw] max-w-[380px] p-3">
        <Input
          placeholder="Buscar ocasión…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-3"
        />
        <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
          {filtered.map((o) => {
            const active = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(o)
                      ? prev.filter((x) => x !== o)
                      : [...prev, o],
                  )
                }
                className={
                  "rounded-full border px-3 py-1 text-xs capitalize transition " +
                  (active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:text-foreground")
                }
              >
                {o}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-xs text-muted-foreground underline disabled:opacity-50"
            disabled={selected.length === 0}
          >
            Quitar todas
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs text-background transition hover:bg-foreground/90 disabled:opacity-50"
          >
            <Check className="h-3 w-3" strokeWidth={2} />
            {save.isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ItemThumb({ item }: { item: ClothingItem }) {
  const src = item.background_removed_image_url ?? item.image_url;
  return (
    <Link
      to="/wardrobe/$itemId"
      params={{ itemId: item.id }}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-muted transition hover:shadow-soft"
    >
      <div className="relative aspect-square w-full bg-muted">
        {src ? (
          <img
            src={src}
            alt={item.name ?? CATEGORY_LABELS[item.category]}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Shirt className="h-5 w-5" strokeWidth={1.25} />
          </div>
        )}
      </div>
      <div className="px-1.5 py-1">
        <div className="truncate text-[10px] text-muted-foreground">
          {CATEGORY_LABELS[item.category]}
        </div>
      </div>
    </Link>
  );
}

function EmptyHistory({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="mt-10 flex flex-col items-center text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary">
        <CalendarIcon
          className="h-8 w-8 text-muted-foreground"
          strokeWidth={1.25}
        />
      </div>
      <h2 className="mt-6 font-display text-2xl">
        {hasFilters ? "Sin coincidencias" : "Aún no hay registros"}
      </h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        {hasFilters
          ? "Prueba a ampliar el rango de fechas o quitar alguna ocasión."
          : "Cuando marques un outfit como usado, aparecerá aquí ordenado por semana."}
      </p>
      {!hasFilters && (
        <Link
          to="/recommendations"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          Ver sugerencias
        </Link>
      )}
    </div>
  );
}

function ExportMenu({
  logs,
  itemsById,
  filters,
  disabled,
}: {
  logs: OutfitLog[];
  itemsById: Map<string, ClothingItem>;
  filters: { from?: string; to?: string; occasions?: string[] };
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const handle = (type: "csv" | "pdf") => {
    try {
      if (type === "csv") exportOutfitLogsCSV(logs, itemsById, filters);
      else exportOutfitLogsPDF(logs, itemsById, filters);
      toast.success(
        `Historial exportado (${logs.length} ${
          logs.length === 1 ? "registro" : "registros"
        })`,
      );
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message ?? "No se pudo exportar");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
        >
          <Download className="h-3 w-3" strokeWidth={1.75} /> Exportar
          <span className="text-[10px] text-muted-foreground">
            ({logs.length})
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <p className="mb-2 px-2 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Exportar con filtros actuales
        </p>
        <button
          type="button"
          onClick={() => handle("csv")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground transition hover:bg-secondary"
        >
          <FileSpreadsheet className="h-4 w-4" strokeWidth={1.5} />
          <span className="flex-1 text-left">CSV</span>
          <span className="text-[10px] text-muted-foreground">.csv</span>
        </button>
        <button
          type="button"
          onClick={() => handle("pdf")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground transition hover:bg-secondary"
        >
          <FileText className="h-4 w-4" strokeWidth={1.5} />
          <span className="flex-1 text-left">PDF</span>
          <span className="text-[10px] text-muted-foreground">.pdf</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

