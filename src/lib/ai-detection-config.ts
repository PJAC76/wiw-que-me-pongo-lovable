/**
 * Defaults + tipos compartidos para la configuración de detección IA.
 *
 * Este archivo es seguro para cliente y servidor: solo contiene tipos y
 * los valores por defecto que se usan si la fila `ai_detection` de
 * `public.app_settings` no está disponible.
 *
 * La configuración "viva" se lee en runtime desde Supabase en
 * `ai-detection-config.server.ts`, con caché TTL, para poder ajustar
 * modelo, temperatura y vocabularios sin redeploy.
 */

export const AI_DETECTION_SETTINGS_KEY = "ai_detection";

export interface AiDetectionConfig {
  model: string;
  temperature: number;
  max_output_tokens: number;
  background_removal_enabled: boolean;
  background_removal_provider: "none" | "removebg" | "photoroom" | string;
  similarity_hash_enabled: boolean;
  allowed_categories: string[];
  allowed_seasons: string[];
  allowed_occasions: string[];
  allowed_colors: string[];
  system_prompt: string;
  /** Plantilla con {{categories}} {{colors}} {{seasons}} {{occasions}}. */
  user_prompt_template: string;
}

export const AI_DETECTION_DEFAULTS: AiDetectionConfig = {
  model: "google/gemini-3-flash-preview",
  temperature: 0.2,
  max_output_tokens: 800,
  background_removal_enabled: true,
  background_removal_provider: "none",
  similarity_hash_enabled: true,
  allowed_categories: [
    "tops",
    "bottoms",
    "dresses",
    "outerwear",
    "shoes",
    "accessories",
    "bags",
    "underwear",
    "sportswear",
    "other",
  ],
  allowed_seasons: ["spring", "summer", "fall", "winter", "all"],
  allowed_occasions: [
    "casual",
    "trabajo",
    "formal",
    "deporte",
    "fiesta",
    "playa",
    "viaje",
    "hogar",
  ],
  allowed_colors: [
    "negro",
    "blanco",
    "gris",
    "beige",
    "marrón",
    "azul",
    "azul marino",
    "verde",
    "oliva",
    "rojo",
    "burdeos",
    "rosa",
    "morado",
    "amarillo",
    "naranja",
    "crema",
    "camel",
    "multicolor",
  ],
  system_prompt:
    "Eres un asistente experto en moda. Analiza la imagen de una prenda y devuelve SOLO JSON válido con los campos: category, subcategory, primary_color, secondary_colors[], season, occasions[], material, pattern, brand_guess, confidence (0-1). Usa únicamente valores de las listas permitidas que te doy. Si no puedes inferir un campo, usa null.",
  user_prompt_template:
    "Detecta la prenda en la imagen. Categorías permitidas: {{categories}}. Colores: {{colors}}. Temporadas: {{seasons}}. Ocasiones: {{occasions}}. Responde solo JSON.",
};

/**
 * Combina overrides parciales (por ejemplo, los devueltos por Supabase)
 * con los defaults, garantizando tipos válidos.
 */
export function mergeAiDetectionConfig(
  overrides: Partial<AiDetectionConfig> | null | undefined,
): AiDetectionConfig {
  if (!overrides) return AI_DETECTION_DEFAULTS;
  return {
    ...AI_DETECTION_DEFAULTS,
    ...overrides,
    allowed_categories:
      overrides.allowed_categories?.length
        ? overrides.allowed_categories
        : AI_DETECTION_DEFAULTS.allowed_categories,
    allowed_seasons:
      overrides.allowed_seasons?.length
        ? overrides.allowed_seasons
        : AI_DETECTION_DEFAULTS.allowed_seasons,
    allowed_occasions:
      overrides.allowed_occasions?.length
        ? overrides.allowed_occasions
        : AI_DETECTION_DEFAULTS.allowed_occasions,
    allowed_colors:
      overrides.allowed_colors?.length
        ? overrides.allowed_colors
        : AI_DETECTION_DEFAULTS.allowed_colors,
  };
}

/** Rellena la plantilla del prompt con los vocabularios activos. */
export function renderAiDetectionUserPrompt(config: AiDetectionConfig): string {
  return config.user_prompt_template
    .replaceAll("{{categories}}", config.allowed_categories.join(", "))
    .replaceAll("{{colors}}", config.allowed_colors.join(", "))
    .replaceAll("{{seasons}}", config.allowed_seasons.join(", "))
    .replaceAll("{{occasions}}", config.allowed_occasions.join(", "));
}
