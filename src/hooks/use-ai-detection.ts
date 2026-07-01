/**
 * Hook que orquesta el pipeline de detección IA con estados intermedios
 * para poder pintar una barra de progreso y mensajes claros.
 *
 * Etapas: idle → preparing (leer/base64) → analyzing (server + modelo)
 *         → success | error
 *
 * El progreso es determinista por etapa; mientras "analyzing" avanza,
 * usamos un tick suave para no dejar la barra parada.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AiDetectionError,
  detectClothingFn,
  type AiDetectionErrorCode,
  type AiDetectionResult,
} from "@/lib/detect-clothing.functions";

export type AiDetectionStage = "idle" | "preparing" | "analyzing" | "success" | "error";

export interface AiDetectionUiError {
  code: AiDetectionErrorCode;
  title: string;
  message: string;
  hint?: string;
  retryable: boolean;
}

const STAGE_LABEL: Record<AiDetectionStage, string> = {
  idle: "Listo para analizar",
  preparing: "Preparando imagen…",
  analyzing: "Analizando con IA…",
  success: "Análisis completado",
  error: "No se pudo analizar",
};

const STAGE_BASE_PROGRESS: Record<AiDetectionStage, number> = {
  idle: 0,
  preparing: 15,
  analyzing: 45,
  success: 100,
  error: 100,
};

function classifyError(err: unknown): AiDetectionUiError {
  // AiDetectionError puede llegar serializado desde la server fn.
  const raw = err as
    | AiDetectionError
    | { name?: string; code?: string; message?: string; hint?: string; status?: number };
  const code = (raw as { code?: AiDetectionErrorCode }).code;
  const message = raw?.message ?? "Ocurrió un error inesperado.";
  const hint = (raw as { hint?: string }).hint;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      code: "unknown",
      title: "Sin conexión",
      message: "No pudimos contactar con el servidor de IA.",
      hint: "Revisa tu conexión y reintenta.",
      retryable: true,
    };
  }

  switch (code) {
    case "invalid_input":
    case "image_too_large":
      return {
        code,
        title: "Imagen no válida",
        message,
        hint: hint ?? "Prueba con otra foto (JPG/PNG/WEBP, máx. 8 MB).",
        retryable: false,
      };
    case "not_configured":
      return {
        code,
        title: "IA no disponible",
        message,
        hint: hint ?? "Activa el proveedor de IA en el servidor para usar esta función.",
        retryable: false,
      };
    case "rate_limited":
      return {
        code,
        title: "Demasiadas peticiones",
        message: "Estás yendo demasiado rápido.",
        hint: "Espera unos segundos y reintenta.",
        retryable: true,
      };
    case "insufficient_credits":
      return {
        code,
        title: "Sin créditos de IA",
        message: "Tu cuenta no tiene créditos disponibles para analizar prendas.",
        hint: "Añade créditos en Ajustes → Plan.",
        retryable: false,
      };
    case "timeout":
      return {
        code,
        title: "El análisis tardó demasiado",
        message: "El modelo no respondió a tiempo.",
        hint: "Vuelve a intentarlo.",
        retryable: true,
      };
    case "model_error":
      return {
        code,
        title: "Error del modelo",
        message,
        hint: "Reintenta o prueba con otra imagen.",
        retryable: true,
      };
    default:
      return {
        code: "unknown",
        title: "No se pudo completar el análisis",
        message,
        hint: "Reintenta en unos segundos.",
        retryable: true,
      };
  }
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function useAiDetection() {
  const [stage, setStage] = useState<AiDetectionStage>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AiDetectionResult | null>(null);
  const [error, setError] = useState<AiDetectionUiError | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => stopTick, [stopTick]);

  const advanceTo = useCallback(
    (next: AiDetectionStage) => {
      setStage(next);
      setProgress(STAGE_BASE_PROGRESS[next]);
      stopTick();
      if (next === "analyzing") {
        // Progreso suave hasta 90% mientras esperamos al modelo.
        tickRef.current = setInterval(() => {
          setProgress((p) => (p < 90 ? p + Math.max(0.5, (90 - p) * 0.05) : p));
        }, 250);
      }
    },
    [stopTick],
  );

  const reset = useCallback(() => {
    cancelledRef.current = true;
    stopTick();
    setStage("idle");
    setProgress(0);
    setError(null);
    setResult(null);
  }, [stopTick]);

  const detect = useCallback(
    async (file: File): Promise<AiDetectionResult | null> => {
      cancelledRef.current = false;
      setError(null);
      setResult(null);
      try {
        advanceTo("preparing");
        const image_base64 = await fileToBase64(file);
        if (cancelledRef.current) return null;

        advanceTo("analyzing");
        const res = await detectClothingFn({
          data: {
            image_base64,
            mime_type: (file.type as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "image/heic"
              | "image/heif") || "image/jpeg",
          },
        });
        if (cancelledRef.current) return null;

        stopTick();
        setProgress(100);
        setStage("success");
        setResult(res);
        return res;
      } catch (err) {
        if (cancelledRef.current) return null;
        stopTick();
        setProgress(100);
        setStage("error");
        const ui = classifyError(err);
        setError(ui);
        return null;
      }
    },
    [advanceTo, stopTick],
  );

  return {
    stage,
    progress,
    result,
    error,
    label: STAGE_LABEL[stage],
    isRunning: stage === "preparing" || stage === "analyzing",
    detect,
    reset,
  };
}
