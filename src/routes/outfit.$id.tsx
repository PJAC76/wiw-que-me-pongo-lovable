import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { PublicOutfitCard } from "@/components/public-outfit-card";
import {
  favoriteOutfit,
  getPublicOutfitById,
  removeVote,
  unfavoriteOutfit,
  voteOutfit,
} from "@/lib/social";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/outfit/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Outfit — WIW" },
      { name: "description", content: "Un outfit publicado en la comunidad WIW." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicOutfitPage,
});

function PublicOutfitPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const currentUserId = user?.id ?? null;
  const key = ["public-outfit", id, currentUserId];

  const q = useQuery({
    queryKey: key,
    queryFn: () => getPublicOutfitById(id, currentUserId),
  });

  const voteMut = useMutation({
    mutationFn: async ({ score }: { score: number | null }) => {
      if (!currentUserId) throw new Error("Sesión requerida");
      if (score === null) await removeVote(id, currentUserId);
      else await voteOutfit(id, currentUserId, score);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const favMut = useMutation({
    mutationFn: async ({ on }: { on: boolean }) => {
      if (!currentUserId) throw new Error("Sesión requerida");
      if (on) await favoriteOutfit(id, currentUserId);
      else await unfavoriteOutfit(id, currentUserId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const requireAuth = () => {
    toast.info("Inicia sesión para interactuar");
    navigate({ to: "/auth" });
  };

  if (q.isLoading) {
    return (
      <AppShell>
        <p className="mt-6 text-sm text-muted-foreground">Cargando outfit…</p>
      </AppShell>
    );
  }
  if (!q.data) {
    return (
      <AppShell eyebrow="404" title="Outfit no disponible">
        <Link to="/feed" className="text-sm underline">
          Volver al feed
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="pt-4">
        <PublicOutfitCard
          item={q.data}
          currentUserId={currentUserId}
          onRequireAuth={requireAuth}
          onVote={(score) => voteMut.mutateAsync({ score })}
          onToggleFavorite={() => favMut.mutateAsync({ on: !q.data!.is_favorited })}
        />
      </div>
    </AppShell>
  );
}
