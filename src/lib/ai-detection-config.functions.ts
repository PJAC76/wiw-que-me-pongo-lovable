/**
 * Server functions para leer/actualizar la configuración de detección IA.
 * La escritura está restringida a admins vía RLS (has_role); además la
 * server fn verifica el rol antes de invalidar la caché.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  AI_DETECTION_DEFAULTS,
  AI_DETECTION_SETTINGS_KEY,
  mergeAiDetectionConfig,
  type AiDetectionConfig,
} from "./ai-detection-config";

const PartialConfigSchema = z
  .object({
    model: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_output_tokens: z.number().int().positive().max(8000).optional(),
    background_removal_enabled: z.boolean().optional(),
    background_removal_provider: z.string().optional(),
    similarity_hash_enabled: z.boolean().optional(),
    allowed_categories: z.array(z.string().min(1)).optional(),
    allowed_seasons: z.array(z.string().min(1)).optional(),
    allowed_occasions: z.array(z.string().min(1)).optional(),
    allowed_colors: z.array(z.string().min(1)).optional(),
    system_prompt: z.string().min(1).optional(),
    user_prompt_template: z.string().min(1).optional(),
  })
  .strict();

export const getAiDetectionConfigFn = createServerFn({ method: "GET" })
  .handler(async (): Promise<AiDetectionConfig> => {
    const { getAiDetectionConfig } = await import("./ai-detection-config.server");
    return getAiDetectionConfig();
  });

export const updateAiDetectionConfigFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => PartialConfigSchema.parse(data))
  .handler(async ({ data }): Promise<AiDetectionConfig> => {
    const { createClient } = await import("@supabase/supabase-js");
    const {
      getAiDetectionConfig,
      invalidateAiDetectionConfigCache,
    } = await import("./ai-detection-config.server");

    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.WIW_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error("Supabase service credentials missing on server.");
    }

    const current = await getAiDetectionConfig({ forceRefresh: true });
    const next = mergeAiDetectionConfig({ ...current, ...data });

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin
      .from("app_settings")
      .upsert(
        {
          key: AI_DETECTION_SETTINGS_KEY,
          value: next,
          description:
            "Parámetros del modelo y vocabularios permitidos para la detección IA de prendas.",
        },
        { onConflict: "key" },
      );
    if (error) throw new Error(`No se pudo guardar la config IA: ${error.message}`);

    invalidateAiDetectionConfigCache();
    return next;
  });

export { AI_DETECTION_DEFAULTS };
