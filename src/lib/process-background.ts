/**
 * Cliente: orquesta el procesamiento de fondo de una prenda.
 *
 * Flujo:
 *   1. Descarga la imagen original desde la signed URL guardada.
 *   2. La convierte a base64 y llama a `processBackgroundFn`.
 *   3. Sube el resultado a Storage bajo `<user>/<wardrobe>/bg/<item>.png`.
 *   4. Actualiza la fila con `background_removed_storage_path` +
 *      signed URL cacheada en `background_removed_image_url`.
 *
 * Se apoya en el bucket `wardrobe-images` (mismas RLS que la original).
 */

import { supabase } from "@/integrations/supabase/client";
import { processBackgroundFn } from "@/lib/process-background.functions";
import type { ClothingItem } from "@/lib/wardrobe";

const BUCKET = "wardrobe-images";
const SIGNED_TTL_S = 60 * 60 * 24 * 365;

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export interface ProcessBackgroundOutcome {
  storage_path: string;
  signed_url: string;
  model: string;
  passthrough: boolean;
  latency_ms: number;
}

export async function processItemBackground(
  item: ClothingItem,
): Promise<ProcessBackgroundOutcome> {
  if (!item.storage_path) {
    throw new Error("La prenda no tiene imagen original en Storage.");
  }

  // 1. Descargar original (usamos la API de Storage directamente para
  // evitar depender de la caducidad de la signed URL cacheada).
  const { data: original, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(item.storage_path);
  if (dlErr || !original) {
    throw new Error(dlErr?.message ?? "No se pudo descargar la imagen original.");
  }

  const mimeRaw = original.type || "image/jpeg";
  const mime = (
    ["image/jpeg", "image/png", "image/webp"].includes(mimeRaw) ? mimeRaw : "image/jpeg"
  ) as "image/jpeg" | "image/png" | "image/webp";
  const image_base64 = await blobToBase64(original);

  // 2. Llamada al server fn.
  const result = await processBackgroundFn({
    data: { image_base64, mime_type: mime },
  });

  // 3. Subir el resultado.
  const outMime = result.mime_type;
  const ext = outMime === "image/jpeg" ? "jpg" : outMime === "image/webp" ? "webp" : "png";
  const path = `${item.user_id}/${item.wardrobe_id}/bg/${item.id}.${ext}`;
  const blob = base64ToBlob(result.image_base64, outMime);
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: outMime });
  if (upErr) throw new Error(upErr.message);

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL_S);
  if (signErr || !signed) {
    throw new Error(signErr?.message ?? "No se pudo firmar la URL.");
  }

  // 4. Actualizar la fila.
  const { error: updErr } = await supabase
    .from("clothing_items")
    .update({
      background_removed_storage_path: path,
      background_removed_image_url: signed.signedUrl,
    })
    .eq("id", item.id);
  if (updErr) throw new Error(updErr.message);

  return {
    storage_path: path,
    signed_url: signed.signedUrl,
    model: result.model,
    passthrough: result.passthrough,
    latency_ms: result.latency_ms,
  };
}
