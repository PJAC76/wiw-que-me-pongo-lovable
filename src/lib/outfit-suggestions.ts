import type { ClothingItem, ClothingCategory, ClothingSeason } from "@/lib/wardrobe";

/**
 * Motor básico de sugerencia de outfits.
 *
 * Combina prendas ya etiquetadas del armario en conjuntos coherentes:
 * - Estructura: (top + bottom) o (dress), + shoes, + opcional outerwear, + opcional bag/accessory.
 * - Armonía de color: los neutros combinan con todo; en caso contrario se exige
 *   que compartan un neutro o que uno de los dos sea neutro.
 * - Temporada: filtra por la temporada actual (o prendas marcadas "all").
 * - Ocasión (opcional): filtra por ocasión si se indica.
 *
 * Es puramente cliente, determinista salvo por el barajado semilla-libre,
 * y no llama a IA. Sirve como baseline para "¿qué me pongo?" antes de
 * introducir el proveedor IA de la Fase 6.
 */

const NEUTRALS = new Set([
  "negro",
  "blanco",
  "gris",
  "beige",
  "crema",
  "camel",
  "marrón",
  "marron",
  "azul marino",
  "navy",
]);

function normalizeColor(c: string | null | undefined): string {
  return (c ?? "").trim().toLowerCase();
}

function isNeutral(c: string | null | undefined): boolean {
  const n = normalizeColor(c);
  if (!n) return true; // sin color declarado → tratamos como comodín
  return NEUTRALS.has(n);
}

/** Dos prendas combinan si al menos una es neutra o comparten color. */
export function colorsMatch(a: string | null, b: string | null): boolean {
  if (isNeutral(a) || isNeutral(b)) return true;
  return normalizeColor(a) === normalizeColor(b);
}

export function currentSeason(date = new Date()): ClothingSeason {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "fall";
  return "winter";
}

function matchesSeason(item: ClothingItem, season: ClothingSeason): boolean {
  if (!item.seasons || item.seasons.length === 0) return true;
  return item.seasons.includes(season) || item.seasons.includes("all");
}

function matchesOccasion(item: ClothingItem, occasion?: string | null): boolean {
  if (!occasion) return true;
  if (!item.occasions || item.occasions.length === 0) return true;
  return item.occasions.map((o) => o.toLowerCase()).includes(occasion.toLowerCase());
}

function byCategory(items: ClothingItem[], cat: ClothingCategory): ClothingItem[] {
  return items.filter((i) => i.category === cat);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Menos usada primero → recompensa prendas olvidadas. */
function leastWornFirst(items: ClothingItem[]): ClothingItem[] {
  return [...items].sort((a, b) => (a.times_worn ?? 0) - (b.times_worn ?? 0));
}

export interface OutfitSuggestion {
  id: string;
  items: ClothingItem[];
  rationale: string;
}

export interface SuggestOptions {
  season?: ClothingSeason;
  occasion?: string | null;
  max?: number;
}

/**
 * Genera hasta `max` sugerencias distintas para el armario dado.
 * Devuelve [] si no hay prendas suficientes.
 */
export function suggestOutfits(
  wardrobe: ClothingItem[],
  opts: SuggestOptions = {},
): OutfitSuggestion[] {
  const season = opts.season ?? currentSeason();
  const max = opts.max ?? 3;

  const pool = wardrobe.filter(
    (i) => matchesSeason(i, season) && matchesOccasion(i, opts.occasion),
  );

  const tops = shuffle(leastWornFirst(byCategory(pool, "tops")));
  const bottoms = shuffle(leastWornFirst(byCategory(pool, "bottoms")));
  const dresses = shuffle(leastWornFirst(byCategory(pool, "dresses")));
  const shoes = shuffle(leastWornFirst(byCategory(pool, "shoes")));
  const outerwear = shuffle(leastWornFirst(byCategory(pool, "outerwear")));
  const bags = shuffle(leastWornFirst(byCategory(pool, "bags")));
  const accessories = shuffle(leastWornFirst(byCategory(pool, "accessories")));

  const needsOuter = season === "fall" || season === "winter";
  const results: OutfitSuggestion[] = [];
  const usedSignatures = new Set<string>();

  const pushIfNew = (items: ClothingItem[], rationale: string) => {
    const sig = items
      .map((i) => i.id)
      .sort()
      .join("|");
    if (usedSignatures.has(sig)) return;
    usedSignatures.add(sig);
    results.push({ id: sig, items, rationale });
  };

  // Combinaciones vestido + zapatos
  for (const d of dresses) {
    if (results.length >= max) break;
    const shoe = shoes.find((s) => colorsMatch(d.color, s.color));
    if (!shoe) continue;
    const combo: ClothingItem[] = [d, shoe];
    if (needsOuter) {
      const outer = outerwear.find(
        (o) => colorsMatch(o.color, d.color) && colorsMatch(o.color, shoe.color),
      );
      if (outer) combo.push(outer);
    }
    const bag = bags.find((b) => colorsMatch(b.color, d.color));
    if (bag) combo.push(bag);
    pushIfNew(combo, buildRationale(combo, season, opts.occasion));
  }

  // Combinaciones top + bottom + zapatos
  for (const top of tops) {
    if (results.length >= max) break;
    for (const bottom of bottoms) {
      if (results.length >= max) break;
      if (!colorsMatch(top.color, bottom.color)) continue;
      const shoe = shoes.find(
        (s) => colorsMatch(s.color, top.color) || colorsMatch(s.color, bottom.color),
      );
      if (!shoe) continue;
      const combo: ClothingItem[] = [top, bottom, shoe];
      if (needsOuter) {
        const outer = outerwear.find(
          (o) => colorsMatch(o.color, top.color) || colorsMatch(o.color, bottom.color),
        );
        if (outer) combo.push(outer);
      }
      const bag = bags.find(
        (b) => colorsMatch(b.color, top.color) || colorsMatch(b.color, bottom.color),
      );
      if (bag) combo.push(bag);
      const acc = accessories.find((a) => colorsMatch(a.color, top.color));
      if (acc && combo.length < 5) combo.push(acc);
      pushIfNew(combo, buildRationale(combo, season, opts.occasion));
    }
  }

  return results.slice(0, max);
}

function buildRationale(
  items: ClothingItem[],
  season: ClothingSeason,
  occasion?: string | null,
): string {
  const colors = Array.from(
    new Set(items.map((i) => normalizeColor(i.color)).filter(Boolean)),
  );
  const seasonLabel: Record<ClothingSeason, string> = {
    spring: "primavera",
    summer: "verano",
    fall: "otoño",
    winter: "invierno",
    all: "todo el año",
  };
  const parts: string[] = [];
  parts.push(`Paleta ${colors.length ? colors.join(" + ") : "neutra"}`);
  parts.push(`apta para ${seasonLabel[season]}`);
  if (occasion) parts.push(`orientado a ${occasion}`);
  const forgotten = items.filter((i) => (i.times_worn ?? 0) === 0);
  if (forgotten.length) parts.push(`rescata ${forgotten.length} prenda(s) sin estrenar`);
  return parts.join(" · ");
}
