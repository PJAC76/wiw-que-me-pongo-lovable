/**
 * Helpers de la capa social (Fase 5):
 *  - Publicación voluntaria de outfits al feed público.
 *  - Votos 0–10 (uno por usuario+outfit, editable).
 *  - Favoritos privados.
 *  - Follows entre usuarios.
 *  - Perfil público con handle único (`username`).
 *
 * Todas las mutaciones se hacen con el cliente autenticado y quedan
 * validadas por RLS. Las lecturas públicas también van por el cliente
 * cuando el usuario está autenticado; para las páginas realmente públicas
 * (perfil compartible, detalle de outfit), la ruta usa el mismo cliente
 * — la anon key basta porque las policies permiten `SELECT` a `anon`.
 *
 * Bucket de imágenes: `public-outfits` (privado). Sirvimos las imágenes
 * con URLs firmadas de larga duración (24h en feed, 7 días para OG en
 * páginas públicas) y refrescamos en cada carga.
 */

import { supabase } from "@/integrations/supabase/client";

/** Regex para handle público. Coherente con el CHECK en `profiles.username`. */
export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicOutfit {
  id: string;
  user_id: string;
  log_id: string | null;
  image_url: string; // URL original (puede ser stale para bucket privado)
  image_path: string | null;
  title: string | null;
  occasions: string[];
  item_ids: string[];
  is_hidden: boolean;
  published_at: string;
  updated_at: string;
}

export interface PublicOutfitStats {
  public_outfit_id: string;
  avg_score: number;
  votes_count: number;
  favorites_count: number;
}

export interface FeedItem {
  outfit: PublicOutfit;
  stats: PublicOutfitStats;
  author: Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
  signed_image_url: string | null;
  my_vote: number | null;
  is_favorited: boolean;
}

/* ------------------------------------------------------------------ */
/* Perfil                                                              */
/* ------------------------------------------------------------------ */

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

export interface UpdateProfileInput {
  username?: string;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
}

export async function updateProfile(
  userId: string,
  patch: UpdateProfileInput,
): Promise<Profile> {
  if (patch.username !== undefined) {
    const u = patch.username.toLowerCase().trim();
    if (!USERNAME_REGEX.test(u)) {
      throw new Error(
        "El nombre de usuario debe tener 3–20 caracteres: minúsculas, números o guion bajo.",
      );
    }
    patch = { ...patch, username: u };
  }
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Ese nombre de usuario ya está en uso.");
    throw error;
  }
  return data as Profile;
}

/* ------------------------------------------------------------------ */
/* Publicación                                                         */
/* ------------------------------------------------------------------ */

/**
 * Sube la foto del look al bucket privado `public-outfits` dentro de la
 * carpeta del usuario (RLS lo restringe). Devuelve `path` y URL firmada.
 */
export async function uploadPublicOutfitImage(
  userId: string,
  file: File,
): Promise<{ path: string; signedUrl: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("public-outfits")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw upErr;
  const { data, error } = await supabase.storage
    .from("public-outfits")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (error) throw error;
  return { path, signedUrl: data.signedUrl };
}

export interface PublishOutfitInput {
  user_id: string;
  log_id?: string | null;
  image_url: string;
  image_path: string;
  title?: string | null;
  occasions?: string[];
  item_ids?: string[];
}

export async function publishOutfit(input: PublishOutfitInput): Promise<PublicOutfit> {
  const { data, error } = await supabase
    .from("public_outfits")
    .insert({
      user_id: input.user_id,
      log_id: input.log_id ?? null,
      image_url: input.image_url,
      image_path: input.image_path,
      title: input.title ?? null,
      occasions: input.occasions ?? [],
      item_ids: input.item_ids ?? [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PublicOutfit;
}

export async function unpublishOutfit(id: string, imagePath: string | null) {
  if (imagePath) {
    await supabase.storage.from("public-outfits").remove([imagePath]);
  }
  const { error } = await supabase.from("public_outfits").delete().eq("id", id);
  if (error) throw error;
}

/** Devuelve el id del outfit publicado que corresponde a un log, o null. */
export async function getPublishedOutfitForLog(logId: string): Promise<PublicOutfit | null> {
  const { data, error } = await supabase
    .from("public_outfits")
    .select("*")
    .eq("log_id", logId)
    .maybeSingle();
  if (error) throw error;
  return (data as PublicOutfit) ?? null;
}

/* ------------------------------------------------------------------ */
/* Feed                                                                */
/* ------------------------------------------------------------------ */

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

/**
 * Feed keyset: outfits ordenados por `published_at` desc. `cursor` es
 * el `published_at` del último item de la página anterior.
 */
export async function listFeed(opts: {
  cursor?: string | null;
  limit?: number;
  currentUserId?: string | null;
}): Promise<FeedPage> {
  const limit = opts.limit ?? 12;
  let q = supabase
    .from("public_outfits")
    .select("*")
    .eq("is_hidden", false)
    .order("published_at", { ascending: false })
    .limit(limit + 1);
  if (opts.cursor) q = q.lt("published_at", opts.cursor);
  const { data: outfitsRaw, error } = await q;
  if (error) throw error;
  const outfits = (outfitsRaw ?? []) as PublicOutfit[];
  const hasMore = outfits.length > limit;
  const page = hasMore ? outfits.slice(0, limit) : outfits;

  return hydrateFeed(page, opts.currentUserId ?? null).then((items) => ({
    items,
    nextCursor: hasMore ? page[page.length - 1]!.published_at : null,
  }));
}

export async function listUserPublicOutfits(
  userId: string,
  opts: { cursor?: string | null; limit?: number; currentUserId?: string | null } = {},
): Promise<FeedPage> {
  const limit = opts.limit ?? 12;
  let q = supabase
    .from("public_outfits")
    .select("*")
    .eq("user_id", userId)
    .eq("is_hidden", false)
    .order("published_at", { ascending: false })
    .limit(limit + 1);
  if (opts.cursor) q = q.lt("published_at", opts.cursor);
  const { data, error } = await q;
  if (error) throw error;
  const outfits = (data ?? []) as PublicOutfit[];
  const hasMore = outfits.length > limit;
  const page = hasMore ? outfits.slice(0, limit) : outfits;
  const items = await hydrateFeed(page, opts.currentUserId ?? null);
  return { items, nextCursor: hasMore ? page[page.length - 1]!.published_at : null };
}

export async function getPublicOutfitById(
  id: string,
  currentUserId: string | null,
): Promise<FeedItem | null> {
  const { data, error } = await supabase
    .from("public_outfits")
    .select("*")
    .eq("id", id)
    .eq("is_hidden", false)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [item] = await hydrateFeed([data as PublicOutfit], currentUserId);
  return item ?? null;
}

async function hydrateFeed(
  outfits: PublicOutfit[],
  currentUserId: string | null,
): Promise<FeedItem[]> {
  if (outfits.length === 0) return [];
  const ids = outfits.map((o) => o.id);
  const authorIds = Array.from(new Set(outfits.map((o) => o.user_id)));

  const [statsRes, profilesRes, myVotesRes, myFavsRes, signedUrls] = await Promise.all([
    supabase.from("public_outfit_stats").select("*").in("public_outfit_id", ids),
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", authorIds),
    currentUserId
      ? supabase
          .from("outfit_votes")
          .select("public_outfit_id, score")
          .eq("voter_id", currentUserId)
          .in("public_outfit_id", ids)
      : Promise.resolve({ data: [] as { public_outfit_id: string; score: number }[], error: null }),
    currentUserId
      ? supabase
          .from("outfit_favorites")
          .select("public_outfit_id")
          .eq("user_id", currentUserId)
          .in("public_outfit_id", ids)
      : Promise.resolve({ data: [] as { public_outfit_id: string }[], error: null }),
    signImagesInBatch(outfits),
  ]);

  const statsById = new Map<string, PublicOutfitStats>();
  for (const s of (statsRes.data ?? []) as PublicOutfitStats[]) {
    statsById.set(s.public_outfit_id, s);
  }
  const profileById = new Map<string, FeedItem["author"]>();
  for (const p of (profilesRes.data ?? []) as FeedItem["author"][]) {
    profileById.set(p.id, p);
  }
  const myVoteById = new Map<string, number>();
  for (const v of (myVotesRes.data ?? []) as { public_outfit_id: string; score: number }[]) {
    myVoteById.set(v.public_outfit_id, v.score);
  }
  const favSet = new Set(
    ((myFavsRes.data ?? []) as { public_outfit_id: string }[]).map((f) => f.public_outfit_id),
  );

  return outfits.map((o) => ({
    outfit: o,
    stats:
      statsById.get(o.id) ??
      { public_outfit_id: o.id, avg_score: 0, votes_count: 0, favorites_count: 0 },
    author:
      profileById.get(o.user_id) ??
      { id: o.user_id, username: "user", display_name: null, avatar_url: null },
    signed_image_url: signedUrls.get(o.id) ?? o.image_url,
    my_vote: myVoteById.get(o.id) ?? null,
    is_favorited: favSet.has(o.id),
  }));
}

async function signImagesInBatch(
  outfits: PublicOutfit[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const withPath = outfits.filter((o) => o.image_path);
  if (withPath.length === 0) return out;
  const paths = withPath.map((o) => o.image_path!);
  const { data, error } = await supabase.storage
    .from("public-outfits")
    .createSignedUrls(paths, 60 * 60 * 24);
  if (error || !data) {
    for (const o of withPath) out.set(o.id, o.image_url);
    return out;
  }
  for (let i = 0; i < withPath.length; i++) {
    out.set(withPath[i]!.id, data[i]?.signedUrl ?? withPath[i]!.image_url);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Votos                                                               */
/* ------------------------------------------------------------------ */

export async function voteOutfit(
  publicOutfitId: string,
  voterId: string,
  score: number,
): Promise<void> {
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new Error("El voto debe ser un entero entre 0 y 10.");
  }
  const { error } = await supabase
    .from("outfit_votes")
    .upsert(
      { public_outfit_id: publicOutfitId, voter_id: voterId, score },
      { onConflict: "public_outfit_id,voter_id" },
    );
  if (error) throw error;
}

export async function removeVote(publicOutfitId: string, voterId: string): Promise<void> {
  const { error } = await supabase
    .from("outfit_votes")
    .delete()
    .eq("public_outfit_id", publicOutfitId)
    .eq("voter_id", voterId);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Favoritos                                                           */
/* ------------------------------------------------------------------ */

export async function favoriteOutfit(publicOutfitId: string, userId: string) {
  const { error } = await supabase
    .from("outfit_favorites")
    .insert({ public_outfit_id: publicOutfitId, user_id: userId });
  if (error && error.code !== "23505") throw error;
}

export async function unfavoriteOutfit(publicOutfitId: string, userId: string) {
  const { error } = await supabase
    .from("outfit_favorites")
    .delete()
    .eq("public_outfit_id", publicOutfitId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function listMyFavorites(
  userId: string,
  opts: { limit?: number } = {},
): Promise<FeedItem[]> {
  const limit = opts.limit ?? 30;
  const { data: favs, error } = await supabase
    .from("outfit_favorites")
    .select("public_outfit_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const ids = (favs ?? []).map((f) => (f as { public_outfit_id: string }).public_outfit_id);
  if (ids.length === 0) return [];
  const { data: outfits, error: oErr } = await supabase
    .from("public_outfits")
    .select("*")
    .in("id", ids);
  if (oErr) throw oErr;
  const byId = new Map<string, PublicOutfit>();
  for (const o of (outfits ?? []) as PublicOutfit[]) byId.set(o.id, o);
  const ordered = ids.map((id) => byId.get(id)).filter((o): o is PublicOutfit => !!o);
  return hydrateFeed(ordered, userId);
}

/* ------------------------------------------------------------------ */
/* Follows                                                             */
/* ------------------------------------------------------------------ */

export async function followUser(followerId: string, followeeId: string) {
  if (followerId === followeeId) throw new Error("No puedes seguirte a ti mismo.");
  const { error } = await supabase
    .from("follows")
    .insert({ follower_id: followerId, followee_id: followeeId });
  if (error && error.code !== "23505") throw error;
}

export async function unfollowUser(followerId: string, followeeId: string) {
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId);
  if (error) throw error;
}

export interface FollowCounts {
  followers: number;
  following: number;
  isFollowing: boolean;
}

export async function getFollowCounts(
  userId: string,
  currentUserId: string | null,
): Promise<FollowCounts> {
  const [{ count: followers }, { count: following }, isFollowingRes] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", userId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
    currentUserId && currentUserId !== userId
      ? supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", currentUserId)
          .eq("followee_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    followers: followers ?? 0,
    following: following ?? 0,
    isFollowing: !!(isFollowingRes as { data: unknown }).data,
  };
}
