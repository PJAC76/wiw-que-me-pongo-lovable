import { supabase } from "@/integrations/supabase/client";

export type ClothingCategory =
  | "tops"
  | "bottoms"
  | "dresses"
  | "outerwear"
  | "shoes"
  | "accessories"
  | "bags"
  | "underwear"
  | "sportswear"
  | "other";

export type ClothingSeason = "spring" | "summer" | "fall" | "winter" | "all";

export const CATEGORY_LABELS: Record<ClothingCategory, string> = {
  tops: "Tops",
  bottoms: "Pantalones",
  dresses: "Vestidos",
  outerwear: "Abrigos",
  shoes: "Zapatos",
  accessories: "Accesorios",
  bags: "Bolsos",
  underwear: "Ropa interior",
  sportswear: "Deporte",
  other: "Otro",
};

export const SEASON_LABELS: Record<ClothingSeason, string> = {
  spring: "Primavera",
  summer: "Verano",
  fall: "Otoño",
  winter: "Invierno",
  all: "Todo el año",
};

export interface Wardrobe {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
}

export interface ClothingItem {
  id: string;
  user_id: string;
  wardrobe_id: string;
  name: string | null;
  category: ClothingCategory;
  subcategory: string | null;
  color: string | null;
  brand: string | null;
  size: string | null;
  material: string | null;
  price_cents: number | null;
  currency: string | null;
  purchase_date: string | null;
  seasons: ClothingSeason[];
  occasions: string[];
  tags: string[];
  notes: string | null;
  image_url: string | null;
  storage_path: string | null;
  background_removed_image_url: string | null;
  background_removed_storage_path: string | null;
  times_worn: number;
  last_worn_at: string | null;
  created_at: string;
}

export async function getDefaultWardrobe(userId: string): Promise<Wardrobe> {
  const { data, error } = await supabase
    .from("wardrobes")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as Wardrobe;

  const { data: created, error: insErr } = await supabase
    .from("wardrobes")
    .insert({ user_id: userId, name: "Mi Armario", is_default: true })
    .select("*")
    .single();
  if (insErr) throw insErr;
  return created as Wardrobe;
}

export async function listClothingItems(userId: string): Promise<ClothingItem[]> {
  const { data, error } = await supabase
    .from("clothing_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClothingItem[];
}

export async function getClothingItem(id: string): Promise<ClothingItem | null> {
  const { data, error } = await supabase
    .from("clothing_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as ClothingItem) ?? null;
}

export async function uploadItemImage(
  userId: string,
  wardrobeId: string,
  file: File,
): Promise<{ path: string; signedUrl: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId}/${wardrobeId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("wardrobe-images")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw upErr;
  const { data, error } = await supabase.storage
    .from("wardrobe-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (error) throw error;
  return { path, signedUrl: data.signedUrl };
}

export async function signImageUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("wardrobe-images")
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export interface NewClothingItemInput {
  user_id: string;
  wardrobe_id: string;
  name?: string | null;
  category: ClothingCategory;
  color?: string | null;
  brand?: string | null;
  size?: string | null;
  price_cents?: number | null;
  seasons?: ClothingSeason[];
  occasions?: string[];
  tags?: string[];
  notes?: string | null;
  image_url?: string | null;
  storage_path?: string | null;
}

export async function createClothingItem(input: NewClothingItemInput): Promise<ClothingItem> {
  const { data, error } = await supabase
    .from("clothing_items")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data as ClothingItem;
}

export interface UpdateClothingItemInput {
  name?: string | null;
  category?: ClothingCategory;
  color?: string | null;
  brand?: string | null;
  size?: string | null;
  seasons?: ClothingSeason[];
  notes?: string | null;
  image_url?: string | null;
  storage_path?: string | null;
}

export async function updateClothingItem(
  id: string,
  patch: UpdateClothingItemInput,
): Promise<ClothingItem> {
  const { data, error } = await supabase
    .from("clothing_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ClothingItem;
}

export async function removeStorageObject(path: string) {
  await supabase.storage.from("wardrobe-images").remove([path]);
}

export async function deleteClothingItem(id: string, storagePath: string | null) {
  if (storagePath) {
    await supabase.storage.from("wardrobe-images").remove([storagePath]);
  }
  const { error } = await supabase.from("clothing_items").delete().eq("id", id);
  if (error) throw error;
}
