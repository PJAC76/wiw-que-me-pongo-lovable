import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { PublicOutfitCard } from "@/components/public-outfit-card";
import {
  favoriteOutfit,
  listMyFavorites,
  removeVote,
  unfavoriteOutfit,
  voteOutfit,
} from "@/lib/social";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({
    meta: [
      { title: "Favoritos — WIW" },
      { name: "description", content: "Tus outfits guardados del feed WIW." },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["favorites", user?.id];

  const q = useQuery({
    queryKey: key,
    queryFn: () => (user ? listMyFavorites(user.id) : Promise.resolve([])),
    enabled: !!user,
  });

  const voteMut = useMutation({
    mutationFn: async ({ id, score }: { id: string; score: number | null }) => {
      if (!user) return;
      if (score === null) await removeVote(id, user.id);
      else await voteOutfit(id, user.id, score);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const favMut = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      if (!user) return;
      if (on) await favoriteOutfit(id, user.id);
      else await unfavoriteOutfit(id, user.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const items = q.data ?? [];

  return (
    <AppShell eyebrow="Guardados" title="Favoritos">
      <div className="space-y-6">
        {q.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!q.isLoading && items.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm">Aún no has guardado ningún outfit.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Pulsa el corazón en el feed para guardar los que te inspiren.
            </p>
          </div>
        )}
        {items.map((it) => (
          <PublicOutfitCard
            key={it.outfit.id}
            item={it}
            currentUserId={user?.id ?? null}
            onVote={(score) => voteMut.mutateAsync({ id: it.outfit.id, score })}
            onToggleFavorite={() =>
              favMut.mutateAsync({ id: it.outfit.id, on: !it.is_favorited })
            }
          />
        ))}
      </div>
    </AppShell>
  );
}
