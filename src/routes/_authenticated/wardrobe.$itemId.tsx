import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil, Shirt, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  SEASON_LABELS,
  deleteClothingItem,
  getClothingItem,
} from "@/lib/wardrobe";
import { processItemBackground } from "@/lib/process-background";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/wardrobe/$itemId")({
  head: () => ({ meta: [{ title: "Prenda — WIW" }] }),
  component: ItemDetail,
});

type View = "original" | "clean";

function ItemDetail() {
  const { itemId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: item, isLoading } = useQuery({
    queryKey: ["clothing_item", itemId],
    queryFn: () => getClothingItem(itemId),
  });

  const hasClean = !!item?.background_removed_image_url;
  const [view, setView] = useState<View>("clean");
  const activeUrl = useMemo(() => {
    if (!item) return null;
    if (view === "clean" && hasClean) return item.background_removed_image_url;
    return item.image_url;
  }, [item, view, hasClean]);

  const del = useMutation({
    mutationFn: () =>
      deleteClothingItem(
        itemId,
        item?.storage_path ?? null,
        item?.background_removed_storage_path ?? null,
      ),
    onSuccess: () => {
      toast.success("Prenda eliminada");
      qc.invalidateQueries({ queryKey: ["clothing_items", user?.id] });
      navigate({ to: "/wardrobe" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const processBg = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("Prenda no cargada");
      return processItemBackground(item);
    },
    onSuccess: (res) => {
      toast.success(
        res.passthrough
          ? "Procesado (modo passthrough — configura un proveedor real)"
          : `Fondo mejorado en ${(res.latency_ms / 1000).toFixed(1)}s`,
      );
      setView("clean");
      qc.invalidateQueries({ queryKey: ["clothing_item", itemId] });
      qc.invalidateQueries({ queryKey: ["clothing_items", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-background">
      <header className="flex items-center justify-between px-6 pt-10 pb-4">
        <Link
          to="/wardrobe"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {item && (
          <div className="flex items-center gap-2">
            <Link
              to="/wardrobe/$itemId/edit"
              params={{ itemId: item.id }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
              aria-label="Editar"
            >
              <Pencil className="h-4 w-4" />
            </Link>
            <button
              onClick={() => {
                if (confirm("¿Eliminar esta prenda?")) del.mutate();
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-destructive"
              aria-label="Eliminar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 px-6 pb-24">
        {isLoading ? (
          <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-muted" />
        ) : !item ? (
          <p className="mt-10 text-center text-muted-foreground">Prenda no encontrada</p>
        ) : (
          <>
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted">
              {activeUrl ? (
                <img
                  src={activeUrl}
                  alt={item.name ?? ""}
                  className="h-full w-full object-cover"
                  data-view={view === "clean" && hasClean ? "clean" : "original"}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Shirt className="h-12 w-12" strokeWidth={1.25} />
                </div>
              )}
              {processBg.isPending && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p className="text-sm text-muted-foreground">Procesando fondo…</p>
                </div>
              )}
            </div>

            {/* Toggle Original / Sin fondo */}
            {item.image_url && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <div
                  className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs"
                  role="tablist"
                  aria-label="Vista de imagen"
                >
                  <button
                    role="tab"
                    aria-selected={view === "original"}
                    onClick={() => setView("original")}
                    className={`rounded-full px-3 py-1.5 transition-colors ${
                      view === "original"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground"
                    }`}
                  >
                    Original
                  </button>
                  <button
                    role="tab"
                    aria-selected={view === "clean"}
                    onClick={() => hasClean && setView("clean")}
                    disabled={!hasClean}
                    className={`rounded-full px-3 py-1.5 transition-colors disabled:opacity-40 ${
                      view === "clean" && hasClean
                        ? "bg-foreground text-background"
                        : "text-muted-foreground"
                    }`}
                  >
                    Sin fondo
                  </button>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => processBg.mutate()}
                  disabled={processBg.isPending || !item.storage_path}
                  className="gap-1.5"
                >
                  {processBg.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {hasClean ? "Reprocesar" : "Mejorar fondo"}
                </Button>
              </div>
            )}

            <div className="mt-6">
              <div className="eyebrow">{CATEGORY_LABELS[item.category]}</div>
              <h1 className="mt-1 font-display text-3xl">
                {item.name ?? item.brand ?? "Sin nombre"}
              </h1>
            </div>

            <dl className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
              <Row label="Marca" value={item.brand} />
              <Row label="Color" value={item.color} />
              <Row label="Talla" value={item.size} />
              <Row
                label="Temporada"
                value={item.seasons.map((s) => SEASON_LABELS[s]).join(", ")}
              />
              <Row label="Veces usada" value={String(item.times_worn)} />
            </dl>

            {item.notes && (
              <div className="mt-6">
                <div className="eyebrow mb-2">Notas</div>
                <p className="text-sm text-foreground/80">{item.notes}</p>
              </div>
            )}

            <Button variant="outline" className="mt-8 w-full" asChild>
              <Link to="/wardrobe">Volver al armario</Link>
            </Button>
          </>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <dt className="eyebrow">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
