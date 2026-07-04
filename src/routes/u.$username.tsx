import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCheck, UserPlus, User as UserIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { PublicOutfitCard } from "@/components/public-outfit-card";
import { Button } from "@/components/ui/button";
import {
  favoriteOutfit,
  followUser,
  getFollowCounts,
  getProfileByUsername,
  listUserPublicOutfits,
  removeVote,
  unfavoriteOutfit,
  unfollowUser,
  voteOutfit,
} from "@/lib/social";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/u/$username")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — WIW` },
      {
        name: "description",
        content: `Descubre los outfits de @${params.username} en WIW.`,
      },
      { property: "og:title", content: `@${params.username} — WIW` },
      {
        property: "og:description",
        content: `Descubre los outfits de @${params.username} en WIW.`,
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const { username } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const currentUserId = user?.id ?? null;

  const profileQ = useQuery({
    queryKey: ["public-profile", username],
    queryFn: async () => {
      const p = await getProfileByUsername(username);
      if (!p) throw notFound();
      return p;
    },
  });

  const outfitsQ = useQuery({
    queryKey: ["public-profile-outfits", profileQ.data?.id, currentUserId],
    queryFn: () =>
      profileQ.data
        ? listUserPublicOutfits(profileQ.data.id, { currentUserId, limit: 20 })
        : Promise.resolve({ items: [], nextCursor: null }),
    enabled: !!profileQ.data,
  });

  const followsQ = useQuery({
    queryKey: ["follows", profileQ.data?.id, currentUserId],
    queryFn: () =>
      profileQ.data
        ? getFollowCounts(profileQ.data.id, currentUserId)
        : Promise.resolve({ followers: 0, following: 0, isFollowing: false }),
    enabled: !!profileQ.data,
  });

  const followMut = useMutation({
    mutationFn: async ({ on }: { on: boolean }) => {
      if (!currentUserId || !profileQ.data) throw new Error("Sesión requerida");
      if (on) await followUser(currentUserId, profileQ.data.id);
      else await unfollowUser(currentUserId, profileQ.data.id);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["follows", profileQ.data?.id, currentUserId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const voteMut = useMutation({
    mutationFn: async ({ id, score }: { id: string; score: number | null }) => {
      if (!currentUserId) throw new Error("Sesión requerida");
      if (score === null) await removeVote(id, currentUserId);
      else await voteOutfit(id, currentUserId, score);
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["public-profile-outfits", profileQ.data?.id, currentUserId],
      }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const favMut = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      if (!currentUserId) throw new Error("Sesión requerida");
      if (on) await favoriteOutfit(id, currentUserId);
      else await unfavoriteOutfit(id, currentUserId);
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["public-profile-outfits", profileQ.data?.id, currentUserId],
      }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const requireAuth = () => {
    toast.info("Inicia sesión para interactuar");
    navigate({ to: "/auth" });
  };

  if (profileQ.isLoading) {
    return (
      <AppShell>
        <p className="mt-6 text-sm text-muted-foreground">Cargando perfil…</p>
      </AppShell>
    );
  }

  if (!profileQ.data) {
    return (
      <AppShell eyebrow="404" title="Perfil no encontrado">
        <Link to="/feed" className="text-sm underline">
          Ir al feed
        </Link>
      </AppShell>
    );
  }

  const p = profileQ.data;
  const isSelf = currentUserId === p.id;
  const isFollowing = !!followsQ.data?.isFollowing;

  return (
    <AppShell>
      <div className="space-y-8 pt-6">
        <header className="flex items-start gap-4">
          {p.avatar_url ? (
            <img
              src={p.avatar_url}
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-full bg-muted">
              <UserIcon className="h-6 w-6 text-muted-foreground" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg text-foreground">
              {p.display_name ?? `@${p.username}`}
            </h1>
            <p className="text-sm text-muted-foreground">@{p.username}</p>
            {p.bio && <p className="mt-2 text-sm text-foreground">{p.bio}</p>}
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                <strong className="text-foreground">
                  {outfitsQ.data?.items.length ?? 0}
                </strong>{" "}
                outfits
              </span>
              <span>
                <strong className="text-foreground">
                  {followsQ.data?.followers ?? 0}
                </strong>{" "}
                seguidores
              </span>
              <span>
                <strong className="text-foreground">
                  {followsQ.data?.following ?? 0}
                </strong>{" "}
                siguiendo
              </span>
            </div>
          </div>
        </header>

        {!isSelf && (
          <Button
            size="sm"
            variant={isFollowing ? "secondary" : "default"}
            onClick={() => {
              if (!currentUserId) return requireAuth();
              followMut.mutate({ on: !isFollowing });
            }}
            disabled={followMut.isPending}
          >
            {isFollowing ? (
              <>
                <UserCheck className="mr-1.5 h-4 w-4" /> Siguiendo
              </>
            ) : (
              <>
                <UserPlus className="mr-1.5 h-4 w-4" /> Seguir
              </>
            )}
          </Button>
        )}

        <section className="space-y-6">
          {outfitsQ.isLoading && (
            <p className="text-sm text-muted-foreground">Cargando outfits…</p>
          )}
          {!outfitsQ.isLoading && (outfitsQ.data?.items.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">
              @{p.username} aún no ha publicado outfits.
            </p>
          )}
          {outfitsQ.data?.items.map((it) => (
            <PublicOutfitCard
              key={it.outfit.id}
              item={it}
              currentUserId={currentUserId}
              onRequireAuth={requireAuth}
              onVote={(score) => voteMut.mutateAsync({ id: it.outfit.id, score })}
              onToggleFavorite={() =>
                favMut.mutateAsync({ id: it.outfit.id, on: !it.is_favorited })
              }
            />
          ))}
        </section>
      </div>
    </AppShell>
  );
}
