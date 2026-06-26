import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Shirt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  SEASON_LABELS,
  deleteClothingItem,
  getClothingItem,
} from "@/lib/wardrobe";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/wardrobe/$itemId")({
  head: () => ({ meta: [{ title: "Prenda — WIW" }] }),
  component: ItemDetail,
});

function ItemDetail() {
  const { itemId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: item, isLoading } = useQuery({
    queryKey: ["clothing_item", itemId],
    queryFn: () => getClothingItem(itemId),
  });

  const del = useMutation({
    mutationFn: () => deleteClothingItem(itemId, item?.storage_path ?? null),
    onSuccess: () => {
      toast.success("Prenda eliminada");
      qc.invalidateQueries({ queryKey: ["clothing_items", user?.id] });
      navigate({ to: "/wardrobe" });
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
          <button
            onClick={() => {
              if (confirm("¿Eliminar esta prenda?")) del.mutate();
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-destructive"
            aria-label="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      <main className="flex-1 px-6 pb-24">
        {isLoading ? (
          <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-muted" />
        ) : !item ? (
          <p className="mt-10 text-center text-muted-foreground">Prenda no encontrada</p>
        ) : (
          <>
            <div className="aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name ?? ""} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Shirt className="h-12 w-12" strokeWidth={1.25} />
                </div>
              )}
            </div>

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
