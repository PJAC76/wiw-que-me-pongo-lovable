/**
 * Server function stub para la detección IA de prendas.
 *
 * Estado actual (fase 3, primer paso):
 *   - Lee la configuración runtime (`ai_detection_config`) para respetar
 *     modelo/temperatura/vocabularios sin redeploy.
 *   - Devuelve un resultado simulado para poder validar el flujo de UI
 *     (estado + barra de progreso + errores) sin depender aún del
 *     proveedor real (Ollama / gateway).
 *   - Lanza errores tipados que la UI puede clasificar y mostrar en
 *     mensajes claros al usuario.
 *
 * Próximo paso (siguiente tarea): sustituir el bloque "MOCK" por la
 * llamada real al modelo con la imagen subida temporalmente.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { AI_DETECTION_DEFAULTS } from "./ai-detection-config";

const InputSchema = z.object({
  /** Data URL o base64 puro. Máx ~8MB en base64. */
  image_base64: z.string().min(64),
  mime_type: z
    .enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
    .default("image/jpeg"),
  hint: z.string().max(200).optional(),
});

export type AiDetectionErrorCode =
  | "invalid_input"
  | "image_too_large"
  | "not_configured"
  | "rate_limited"
  | "insufficient_credits"
  | "model_error"
  | "timeout"
  | "unknown";

export interface AiDetectionErrorPayload {
  code: AiDetectionErrorCode;
  message: string;
  hint?: string;
}

export class AiDetectionError extends Error {
  code: AiDetectionErrorCode;
  hint?: string;
  constructor(payload: AiDetectionErrorPayload) {
    super(payload.message);
    this.name = "AiDetectionError";
    this.code = payload.code;
    this.hint = payload.hint;
  }
  toJSON(): AiDetectionErrorPayload {
    return { code: this.code, message: this.message, hint: this.hint };
  }
}

export interface AiDetectionResult {
  category: string | null;
  subcategory: string | null;
  primary_color: string | null;
  secondary_colors: string[];
  season: string | null;
  occasions: string[];
  material: string | null;
  pattern: string | null;
  brand_guess: string | null;
  confidence: number;
  model: string;
  latency_ms: number;
}

const MAX_BASE64_BYTES = 12 * 1024 * 1024; // ~9MB binario

export const detectClothingFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<AiDetectionResult> => {
    const started = Date.now();
    if (data.image_base64.length > MAX_BASE64_BYTES) {
      throw new AiDetectionError({
        code: "image_too_large",
        message: "La imagen supera el tamaño máximo (8 MB).",
        hint: "Prueba con una foto más ligera.",
      });
    }

    const { getAiDetectionConfig } = await import("./ai-detection-config.server");
    const config = await getAiDetectionConfig().catch(() => AI_DETECTION_DEFAULTS);

    const apiKey = process.env.LOVABLE_API_KEY;
    const useMock = !apiKey || process.env.AI_DETECTION_MOCK === "1";

    if (useMock) {
      // Simulación: latencia realista para validar el UI de progreso.
      const delay = 700 + Math.random() * 800;
      await new Promise((r) => setTimeout(r, delay));
      return {
        category: config.allowed_categories[0] ?? "tops",
        subcategory: null,
        primary_color: config.allowed_colors[0] ?? "negro",
        secondary_colors: [],
        season: "all",
        occasions: ["casual"],
        material: null,
        pattern: null,
        brand_guess: null,
        confidence: 0.42,
        model: `${config.model} (mock)`,
        latency_ms: Date.now() - started,
      };
    }

    // TODO: siguiente tarea — llamar al gateway con la imagen + prompts
    // renderizados desde `config`. Aquí solo dejamos el esqueleto de
    // errores tipados para que la UI ya sepa qué mostrar.
    throw new AiDetectionError({
      code: "not_configured",
      message: "La detección IA todavía no está conectada al modelo.",
      hint: "Conecta LOVABLE_API_KEY o activa AI_DETECTION_MOCK=1 en el servidor.",
    });
  });
