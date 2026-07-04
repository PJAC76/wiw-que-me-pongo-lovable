import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, RefreshCw, Shirt, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import {
  CATEGORY_LABELS,
  listClothingItems,
  markItemsWornNow,
  type ClothingItem,
} from "@/lib/wardrobe";
import {
  suggestOutfits,
  currentSeason,
  type OutfitSuggestion,
} from "@/lib/outfit-suggestions";


const OCCASIONS = ["casual", "trabajo", "formal", "deporte", "fiesta"] as const;

export const Route = createFileRoute("/_authenticated/recommendations")({
  head: () => ({
    meta: [
      { title: "Recomendaciones — WIW" },
      {
        name: "description",
        content: "Qué ponerte hoy: combinaciones sugeridas a partir de tu armario.",
      },
    ],
  }),
  component: RecommendationsScreen,
});

function RecommendationsScreen() {
  const { user } = useAuth();
  const { data: items, isLoading } = useQuery({
    queryKey: ["clothing_items", user?.id],
    queryFn: () => listClothingItems(user!.id),
    enabled: !!user,
  });

  const [occasion, setOccasion] = useState<string | null>(null);
  const [seed, setSeed] = useState(0);

  const suggestions = useMemo<OutfitSuggestion[]>(() => {
    if (!items) return [];
    // seed sólo fuerza recomputación al pulsar "Barajar"
    void seed;
    return suggestOutfits(items, { occasion, max: 3 });
  }, [items, occasion, seed]);

  const season = currentSeason();
  const seasonLabel: Record<string, string> = {
    spring: "primavera",
    summer: "verano",
    fall: "otoño",
    winter: "invierno",
  };

  return (
    <AppShell
      eyebrow="Para hoy"
      title="¿Qué me pongo?"
      rightSlot={
        <button
          type="button"
          onClick={() => setSeed((s) => s + 1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-secondary"
          aria-label="Barajar sugerencias"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Combinaciones basadas en color, categoría y temporada ({seasonLabel[season]}).
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <OccasionChip
          label="Todas"
          active={occasion === null}
          onClick={() => setOccasion(null)}
        />
        {OCCASIONS.map((o) => (
          <OccasionChip
            key={o}
            label={o}
            active={occasion === o}
            onClick={() => setOccasion(o)}
          />
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : !items || items.length < 2 ? (
        <EmptyWardrobe />
      ) : suggestions.length === 0 ? (
        <NoMatches />
      ) : (
        <ul className="space-y-5">
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} />
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function OccasionChip({
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
      className={
        "rounded-full border px-3 py-1 text-xs capitalize transition " +
        (active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:text-foreground")
      }
    >
      {label}
    </button>
  );
}

function SuggestionCard({ suggestion }: { suggestion: OutfitSuggestion }) {
  return (
    <li className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <span className="eyebrow text-[10px]">Sugerencia</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {suggestion.items.map((it) => (
          <ItemThumb key={it.id} item={it} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{suggestion.rationale}</p>
    </li>
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

function EmptyWardrobe() {
  return (
    <div className="mt-10 flex flex-col items-center text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary">
        <Shirt className="h-8 w-8 text-muted-foreground" strokeWidth={1.25} />
      </div>
      <h2 className="mt-6 font-display text-2xl">Necesitas más prendas</h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Añade al menos un top y un pantalón (o un vestido y unos zapatos) para empezar
        a recibir sugerencias.
      </p>
      <Link
        to="/wardrobe/add"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm text-primary-foreground shadow-soft transition hover:bg-primary/90"
      >
        Añadir prenda
      </Link>
    </div>
  );
}

function NoMatches() {
  return (
    <div className="mt-10 text-center text-sm text-muted-foreground">
      No encontramos combinaciones para esta ocasión y temporada. Prueba otra ocasión
      o añade más prendas etiquetadas.
    </div>
  );
}
