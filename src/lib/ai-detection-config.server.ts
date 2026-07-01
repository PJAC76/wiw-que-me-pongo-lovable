/**
 * Lectura runtime de la configuración de detección IA desde Supabase.
 *
 * - Usa el service role key (server-only) para leer `public.app_settings`.
 * - Cachea el resultado en memoria con un TTL corto (60s por defecto) para
 *   evitar una llamada por request pero permitir ajustes casi inmediatos
 *   sin redeploy.
 * - Si Supabase no responde o la fila no existe, cae a los defaults.
 *
 * Variables de entorno leídas dentro del handler (nunca en top-level):
 *   - SUPABASE_URL
 *   - WIW_SERVICE_ROLE_KEY  (service role del proyecto Supabase externo)
 *   - AI_DETECTION_CACHE_TTL_MS (opcional, por defecto 60000)
 */

import { createClient } from "@supabase/supabase-js";

import {
  AI_DETECTION_DEFAULTS,
  AI_DETECTION_SETTINGS_KEY,
  mergeAiDetectionConfig,
  type AiDetectionConfig,
} from "./ai-detection-config";

type CacheEntry = { value: AiDetectionConfig; expiresAt: number };
let cache: CacheEntry | null = null;

function getTtlMs(): number {
  const raw = process.env.AI_DETECTION_CACHE_TTL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

/**
 * Devuelve la config activa (Supabase con fallback a defaults).
 * Uso: dentro de server functions o server routes que llamen al modelo.
 */
export async function getAiDetectionConfig(options?: {
  forceRefresh?: boolean;
}): Promise<AiDetectionConfig> {
  const now = Date.now();
  if (!options?.forceRefresh && cache && cache.expiresAt > now) {
    return cache.value;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.WIW_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    // Sin backend disponible: servir defaults sin cachear indefinidamente.
    cache = { value: AI_DETECTION_DEFAULTS, expiresAt: now + 5_000 };
    return AI_DETECTION_DEFAULTS;
  }

  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", AI_DETECTION_SETTINGS_KEY)
      .maybeSingle();

    if (error) throw error;

    const merged = mergeAiDetectionConfig(
      (data?.value ?? null) as Partial<AiDetectionConfig> | null,
    );
    cache = { value: merged, expiresAt: now + getTtlMs() };
    return merged;
  } catch (err) {
    console.warn("[ai-detection-config] falling back to defaults:", err);
    cache = { value: AI_DETECTION_DEFAULTS, expiresAt: now + 5_000 };
    return AI_DETECTION_DEFAULTS;
  }
}

/** Invalida la caché en memoria (por ejemplo tras un update desde admin). */
export function invalidateAiDetectionConfigCache(): void {
  cache = null;
}
