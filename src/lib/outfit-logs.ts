import { supabase } from "@/integrations/supabase/client";

/**
 * Catálogo de etiquetas de ocasión. Todas en minúscula, sin acentos donde el
 * uso lo permite, para que sean fáciles de escribir y comparar. La UI las
 * muestra con capitalización mediante CSS.
 */
export const OCCASIONS = [
  "casual",
  "trabajo",
  "reunión",
  "entrevista",
  "conferencia",
  "presentación",
  "formal",
  "cita",
  "desayuno",
  "brunch",
  "comida",
  "merienda",
  "café",
  "cena",
  "copas",
  "fiesta",
  "cumpleaños",
  "aniversario",
  "evento",
  "boda",
  "comunión",
  "bautizo",
  "ceremonia",
  "funeral",
  "iglesia",
  "teatro",
  "concierto",
  "cine",
  "museo",
  "exposición",
  "festival",
  "compras",
  "paseo",
  "viaje",
  "playa",
  "piscina",
  "montaña",
  "senderismo",
  "nieve",
  "deporte",
  "gimnasio",
  "universidad",
  "escuela",
  "hogar",
] as const;

export type Occasion = (typeof OCCASIONS)[number];

/**
 * Normaliza una lista de ocasiones: recorta espacios, pasa a minúsculas y
 * elimina duplicados preservando el orden de aparición. Se usa tanto en el
 * filtro del historial como en el editor de cada entrada para que ambas
 * superficies compartan exactamente la misma representación.
 */
export function normalizeOccasions(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const o = raw.trim().toLowerCase();
    if (!o || seen.has(o)) continue;
    seen.add(o);
    out.push(o);
  }
  return out;
}

/** Comparación estable e independiente del orden entre dos listas de ocasiones. */
export function sameOccasions(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

export interface OutfitLog {
  id: string;
  user_id: string;
  worn_on: string; // YYYY-MM-DD
  occasions: string[];
  item_ids: string[];
  note: string | null;
  created_at: string;
}

export interface LogOutfitInput {
  user_id: string;
  worn_on?: string; // defecto: hoy
  occasions?: string[];
  item_ids: string[];
  note?: string | null;
}

export async function logOutfit(input: LogOutfitInput): Promise<OutfitLog> {
  const { data, error } = await supabase
    .from("outfit_logs")
    .insert({
      user_id: input.user_id,
      worn_on: input.worn_on ?? new Date().toISOString().slice(0, 10),
      occasions: input.occasions ?? [],
      item_ids: input.item_ids,
      note: input.note ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as OutfitLog;
}

export interface UpdateOutfitLogInput {
  occasions?: string[];
  worn_on?: string;
  note?: string | null;
}

export async function updateOutfitLog(
  id: string,
  patch: UpdateOutfitLogInput,
): Promise<OutfitLog> {
  const { data, error } = await supabase
    .from("outfit_logs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as OutfitLog;
}

export interface ListLogsOptions {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  occasions?: string[]; // outfit debe contener TODAS estas ocasiones (AND)
}

export async function listOutfitLogs(
  userId: string,
  opts: ListLogsOptions = {},
): Promise<OutfitLog[]> {
  let q = supabase
    .from("outfit_logs")
    .select("*")
    .eq("user_id", userId)
    .order("worn_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts.from) q = q.gte("worn_on", opts.from);
  if (opts.to) q = q.lte("worn_on", opts.to);
  if (opts.occasions && opts.occasions.length > 0) {
    // contains: el array de la fila debe contener todas las ocasiones dadas.
    q = q.contains("occasions", opts.occasions);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OutfitLog[];
}

export async function deleteOutfitLog(id: string) {
  const { error } = await supabase.from("outfit_logs").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Devuelve la clave ISO de la semana lunes-domingo a la que pertenece la fecha.
 * Formato: `YYYY-Www` (ej. 2026-W27). Lunes = inicio de semana (Europa).
 */
export function weekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  // ISO week: jueves de esa semana determina el año/semana.
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7; // lunes=0
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.valueOf() - firstThursday.valueOf();
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Devuelve el lunes (YYYY-MM-DD) de la semana de una fecha. */
export function weekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dayNr = (d.getDay() + 6) % 7; // lunes=0
  d.setDate(d.getDate() - dayNr);
  return d.toISOString().slice(0, 10);
}

/** Devuelve el domingo (YYYY-MM-DD) de la semana de una fecha. */
export function weekEnd(dateStr: string): string {
  const d = new Date(weekStart(dateStr) + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function formatWeekRange(dateStr: string, locale = "es-ES"): string {
  const start = new Date(weekStart(dateStr) + "T00:00:00");
  const end = new Date(weekEnd(dateStr) + "T00:00:00");
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const yearFmt = new Intl.DateTimeFormat(locale, { year: "numeric" });
  return `${fmt.format(start)} – ${fmt.format(end)} ${yearFmt.format(end)}`;
}

export function formatDayLabel(dateStr: string, locale = "es-ES"): string {
  const d = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

export interface WeekGroup {
  key: string;
  start: string;
  end: string;
  label: string;
  logs: OutfitLog[];
}

export function groupLogsByWeek(logs: OutfitLog[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>();
  for (const l of logs) {
    const key = weekKey(l.worn_on);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        start: weekStart(l.worn_on),
        end: weekEnd(l.worn_on),
        label: formatWeekRange(l.worn_on),
        logs: [],
      };
      map.set(key, g);
    }
    g.logs.push(l);
  }
  return Array.from(map.values()).sort((a, b) => (a.start < b.start ? 1 : -1));
}
