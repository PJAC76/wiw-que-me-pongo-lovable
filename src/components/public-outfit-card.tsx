import { useState } from "react";
import { Heart, User as UserIcon, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { FeedItem } from "@/lib/social";
import { VoteControl } from "./vote-control";

interface Props {
  item: FeedItem;
  currentUserId: string | null;
  onVote: (score: number | null) => Promise<void> | void;
  onToggleFavorite: () => Promise<void> | void;
  onRequireAuth?: () => void;
  compact?: boolean;
}

export function PublicOutfitCard({
  item,
  currentUserId,
  onVote,
  onToggleFavorite,
  onRequireAuth,
  compact,
}: Props) {
  const { outfit, stats, author, signed_image_url, my_vote, is_favorited } = item;
  const isOwn = currentUserId === outfit.user_id;
  const [pendingFav, setPendingFav] = useState(false);

  const handleFav = async () => {
    if (!currentUserId) {
      onRequireAuth?.();
      return;
    }
    setPendingFav(true);
    try {
      await onToggleFavorite();
    } finally {
      setPendingFav(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <Link
          to="/u/$username"
          params={{ username: author.username }}
          className="flex items-center gap-2 text-sm"
        >
          {author.avatar_url ? (
            <img
              src={author.avatar_url}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-muted">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
            </span>
          )}
          <span className="font-medium">@{author.username}</span>
        </Link>
        <span className="text-xs text-muted-foreground">
          {new Date(outfit.published_at).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>

      <Link to="/outfit/$id" params={{ id: outfit.id }} className="block">
        <div className={cn("relative w-full bg-muted", compact ? "aspect-square" : "aspect-[4/5]")}>
          {signed_image_url ? (
            <img
              src={signed_image_url}
              alt={outfit.title ?? `Outfit de @${author.username}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : null}
        </div>
      </Link>

      <div className="space-y-3 px-4 py-3">
        {outfit.title && <p className="text-sm text-foreground">{outfit.title}</p>}
        {outfit.occasions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {outfit.occasions.slice(0, 5).map((o) => (
              <span
                key={o}
                className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                {o}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-current" />
              {stats.avg_score > 0 ? stats.avg_score.toFixed(1) : "—"}
              <span className="opacity-60">({stats.votes_count})</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" />
              {stats.favorites_count}
            </span>
          </div>
          <button
            type="button"
            onClick={handleFav}
            disabled={pendingFav || isOwn}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-full border border-border transition-colors",
              is_favorited ? "bg-foreground text-background" : "bg-background text-foreground",
              isOwn && "opacity-30",
            )}
            aria-label={is_favorited ? "Quitar de favoritos" : "Añadir a favoritos"}
          >
            <Heart className={cn("h-4 w-4", is_favorited && "fill-current")} />
          </button>
        </div>

        {isOwn ? (
          <p className="text-xs text-muted-foreground">
            Este es tu outfit. Solo la comunidad puede votarlo.
          </p>
        ) : (
          <VoteControl
            value={my_vote}
            onChange={async (v) => {
              if (!currentUserId) {
                onRequireAuth?.();
                return;
              }
              await onVote(v);
            }}
          />
        )}
      </div>
    </article>
  );
}
