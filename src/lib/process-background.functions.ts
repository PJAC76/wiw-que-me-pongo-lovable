/**
 * Procesamiento de fondo para prendas del armario.
 *
 * Recibe una imagen en base64 y devuelve una versión con el fondo
 * limpio/mejorado. La estrategia depende de `background_removal_provider`
 * en `public.app_settings`:
 *
 *   - `none` (o falta de credenciales): passthrough — devuelve la misma
 *     imagen. Útil para desarrollo y para no bloquear el UI cuando aún no
 *     se ha configurado un proveedor real.
 *   - `lovable_ai`: usa el AI Gateway con un modelo de imagen de Gemini
 *     para reencuadrar la prenda sobre un fondo neutro tipo estudio.
 *
 * Errores tipados (`BackgroundProcessError`) para que la UI pueda mostrar
 * mensajes claros: not_configured, rate_limited, insufficient_credits,
 * model_error, image_too_large, invalid_input, timeout.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  image_base64: z.string().min(64),
  mime_type: z
    .enum(["image/jpeg", "image/png", "image/webp"])
    .default("image/jpeg"),
});

export type BackgroundProcessErrorCode =
  | "invalid_input"
  | "image_too_large"
  | "not_configured"
  | "rate_limited"
  | "insufficient_credits"
  | "model_error"
  | "timeout"
  | "unknown";

export interface BackgroundProcessErrorPayload {
  code: BackgroundProcessErrorCode;
  message: string;
  hint?: string;
}

export class BackgroundProcessError extends Error {
  code: BackgroundProcessErrorCode;
  hint?: string;
  constructor(payload: BackgroundProcessErrorPayload) {
    super(payload.message);
    this.name = "BackgroundProcessError";
    this.code = payload.code;
    this.hint = payload.hint;
  }
  toJSON(): BackgroundProcessErrorPayload {
    return { code: this.code, message: this.message, hint: this.hint };
  }
}

export interface BackgroundProcessResult {
  image_base64: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  model: string;
  provider: string;
  latency_ms: number;
  passthrough: boolean;
}

const MAX_BASE64_BYTES = 12 * 1024 * 1024; // ~9MB binario
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const IMAGE_MODEL = "google/gemini-3.1-flash-image";
const BG_PROMPT =
  "Aísla la prenda que aparece en la imagen y colócala centrada sobre un fondo estudio neutro y uniforme (#f5f2ec, blanco cálido). Conserva íntegramente la forma, color y textura originales de la prenda. No añadas maniquíes, sombras artificiales, texto ni marcos. Devuelve solo la imagen resultante.";

export const processBackgroundFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<BackgroundProcessResult> => {
    const started = Date.now();
    if (data.image_base64.length > MAX_BASE64_BYTES) {
      throw new BackgroundProcessError({
        code: "image_too_large",
        message: "La imagen supera el tamaño máximo (8 MB).",
        hint: "Prueba con una foto más ligera.",
      });
    }

    const { AI_DETECTION_DEFAULTS } = await import("./ai-detection-config");
    const { getAiDetectionConfig } = await import("./ai-detection-config.server");
    const config = await getAiDetectionConfig().catch(() => AI_DETECTION_DEFAULTS);

    const apiKey = process.env.LOVABLE_API_KEY;
    const provider = config.background_removal_enabled
      ? config.background_removal_provider
      : "none";

    // Passthrough: sin proveedor configurado o sin API key.
    if (!apiKey || provider === "none") {
      return {
        image_base64: data.image_base64,
        mime_type: data.mime_type,
        model: "passthrough",
        provider: provider ?? "none",
        latency_ms: Date.now() - started,
        passthrough: true,
      };
    }

    if (provider !== "lovable_ai") {
      throw new BackgroundProcessError({
        code: "not_configured",
        message: `Proveedor "${provider}" aún no está implementado.`,
        hint: 'Pon background_removal_provider en "lovable_ai" o "none".',
      });
    }

    const dataUrl = `data:${data.mime_type};base64,${data.image_base64}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45_000);

    let res: Response;
    try {
      res = await fetch(GATEWAY_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          modalities: ["image", "text"],
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: BG_PROMPT },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if ((err as Error).name === "AbortError") {
        throw new BackgroundProcessError({
          code: "timeout",
          message: "El procesamiento tardó demasiado.",
          hint: "Reintenta con una imagen más pequeña.",
        });
      }
      throw new BackgroundProcessError({
        code: "unknown",
        message: "No se pudo contactar con el servicio de imagen.",
      });
    }
    clearTimeout(timeoutId);

    if (res.status === 429) {
      throw new BackgroundProcessError({
        code: "rate_limited",
        message: "Demasiadas peticiones. Vuelve a intentarlo en unos segundos.",
      });
    }
    if (res.status === 402) {
      throw new BackgroundProcessError({
        code: "insufficient_credits",
        message: "No quedan créditos para procesar la imagen.",
        hint: "Añade créditos en Ajustes → Planes.",
      });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BackgroundProcessError({
        code: "model_error",
        message: `Error del modelo (${res.status}).`,
        hint: text.slice(0, 200) || undefined,
      });
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          images?: Array<{ image_url?: { url?: string } }>;
          content?: unknown;
        };
      }>;
    };
    const imageUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl || !imageUrl.startsWith("data:")) {
      throw new BackgroundProcessError({
        code: "model_error",
        message: "El modelo no devolvió una imagen válida.",
      });
    }
    const [meta, b64] = imageUrl.split(",", 2);
    const mimeMatch = /data:([^;]+);base64/.exec(meta ?? "");
    const mime = (mimeMatch?.[1] ?? "image/png") as BackgroundProcessResult["mime_type"];
    if (!b64) {
      throw new BackgroundProcessError({
        code: "model_error",
        message: "Respuesta del modelo sin datos de imagen.",
      });
    }

    return {
      image_base64: b64,
      mime_type: mime,
      model: IMAGE_MODEL,
      provider,
      latency_ms: Date.now() - started,
      passthrough: false,
    };
  });
