import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { PublicOutfitCard } from "@/components/public-outfit-card";
import {
  favoriteOutfit,
  listFeed,
  removeVote,
  unfavoriteOutfit,
  voteOutfit,
  type FeedItem,
  type FeedPage,
} from "@/lib/social";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({
    meta: [
      { title: "Feed — WIW" },
      { name: "description", content: "Outfits publicados por la comunidad WIW." },
    ],
  }),
  component: FeedPage,
});

function FeedPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const currentUserId = user?.id ?? null;

  const query = useInfiniteQuery({
    queryKey: ["feed", currentUserId],
    queryFn: ({ pageParam }) => listFeed({ cursor: pageParam, currentUserId }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const patchItem = (id: string, patch: Partial<FeedItem>) => {
    qc.setQueryData<{ pages: FeedPage[]; pageParams: unknown[] }>(
      ["feed", currentUserId],
      (data) => {
        if (!data) return data;
        return {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            items: p.items.map((it) =>
              it.outfit.id === id ? { ...it, ...patch, stats: { ...it.stats, ...(patch.stats ?? {}) } } : it,
            ),
          })),
        };
      },
    );
  };

  const voteMut = useMutation({
    mutationFn: async ({ id, score }: { id: string; score: number | null }) => {
      if (!currentUserId) throw new Error("Sesión requerida");
      if (score === null) await removeVote(id, currentUserId);
      else await voteOutfit(id, currentUserId, score);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed", currentUserId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo votar"),
  });

  const favMut = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      if (!currentUserId) throw new Error("Sesión requerida");
      if (on) await favoriteOutfit(id, currentUserId);
      else await unfavoriteOutfit(id, currentUserId);
    },
    onError: (e, vars) => {
      patchItem(vars.id, { is_favorited: !vars.on });
      toast.error(e instanceof Error ? e.message : "Error");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed", currentUserId] }),
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <AppShell eyebrow="Comunidad" title="Feed">
      <div className="space-y-6">
        {query.isLoading && (
          <p className="text-sm text-muted-foreground">Cargando feed…</p>
        )}
        {!query.isLoading && items.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-foreground">Aún no hay outfits publicados.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Publica uno desde el historial de outfits para inaugurar el feed.
            </p>
          </div>
        )}
        {items.map((it) => (
          <PublicOutfitCard
            key={it.outfit.id}
            item={it}
            currentUserId={currentUserId}
            onVote={async (score) => {
              patchItem(it.outfit.id, { my_vote: score });
              await voteMut.mutateAsync({ id: it.outfit.id, score });
            }}
            onToggleFavorite={async () => {
              const next = !it.is_favorited;
              patchItem(it.outfit.id, {
                is_favorited: next,
                stats: {
                  ...it.stats,
                  favorites_count: it.stats.favorites_count + (next ? 1 : -1),
                },
              });
              await favMut.mutateAsync({ id: it.outfit.id, on: next });
            }}
          />
        ))}
        {query.hasNextPage && (
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="w-full rounded-lg border border-border py-3 text-sm"
          >
            {query.isFetchingNextPage ? "Cargando…" : "Ver más"}
          </button>
        )}
      </div>
    </AppShell>
  );
}
