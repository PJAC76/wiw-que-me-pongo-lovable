import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Shirt } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import {
  CATEGORY_LABELS,
  listClothingItems,
  type ClothingItem,
} from "@/lib/wardrobe";

export const Route = createFileRoute("/_authenticated/wardrobe")({
  head: () => ({
    meta: [
      { title: "Mi Armario — WIW" },
      { name: "description", content: "Explora tu armario virtual." },
    ],
  }),
  component: WardrobeLayout,
});

function WardrobeLayout() {
  const matches = useMatches();
  const isChild = matches.some(
    (m) => m.routeId !== "/_authenticated/wardrobe" && m.routeId.startsWith("/_authenticated/wardrobe/"),
  );
  if (isChild) return <Outlet />;
  return <WardrobeIndex />;
}

function WardrobeIndex() {
  const { user } = useAuth();
  const { data: items, isLoading } = useQuery({
    queryKey: ["clothing_items", user?.id],
    queryFn: () => listClothingItems(user!.id),
    enabled: !!user,
  });

  return (
    <AppShell
      eyebrow="Mi Armario"
      title="Tu armario"
      rightSlot={
        <Link
          to="/wardrobe/add"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft transition hover:bg-primary/90"
          aria-label="Añadir prenda"
        >
          <Plus className="h-5 w-5" />
        </Link>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <EmptyState />
      ) : (
        <Grid items={items} />
      )}
    </AppShell>
  );
}

function Grid({ items }: { items: ClothingItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((it) => (
        <Link
          key={it.id}
          to="/wardrobe/$itemId"
          params={{ itemId: it.id }}
          className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft transition hover:shadow-lift"
        >
          <div className="relative aspect-[3/4] w-full bg-muted">
            {it.image_url ? (
              <img
                src={it.image_url}
                alt={it.name ?? CATEGORY_LABELS[it.category]}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Shirt className="h-8 w-8" strokeWidth={1.25} />
              </div>
            )}
          </div>
          <div className="px-3 py-2">
            <div className="eyebrow truncate text-[10px]">
              {CATEGORY_LABELS[it.category]}
            </div>
            <div className="truncate text-sm text-foreground">
              {it.name ?? it.brand ?? "Sin nombre"}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 flex flex-col items-center text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary">
        <Shirt className="h-8 w-8 text-muted-foreground" strokeWidth={1.25} />
      </div>
      <h2 className="mt-6 font-display text-2xl text-foreground">Tu armario está vacío</h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Empieza añadiendo tu primera prenda. Subes una foto y rellenas los detalles.
      </p>
      <Link
        to="/wardrobe/add"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm text-primary-foreground shadow-soft transition hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" /> Añadir prenda
      </Link>
    </div>
  );
}
