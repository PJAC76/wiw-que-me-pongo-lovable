import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Camera, CloudOff, Database, HardDrive, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { AiDetectionStatus } from "@/components/ai-detection-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAiDetection } from "@/hooks/use-ai-detection";
import { OccasionsPicker } from "@/components/occasions-picker";
import { useAuth } from "@/hooks/use-auth";
import {
  CATEGORY_LABELS,
  SEASON_LABELS,
  createClothingItem,
  getDefaultWardrobe,
  uploadItemImage,
  type ClothingCategory,
  type ClothingSeason,
} from "@/lib/wardrobe";

const KNOWN_CATEGORIES = Object.keys(CATEGORY_LABELS) as ClothingCategory[];
const KNOWN_SEASONS = Object.keys(SEASON_LABELS) as ClothingSeason[];

const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ACCEPT_ATTR = ACCEPTED_MIME.join(",");
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

type SubmitErrorKind = "validation" | "network" | "storage" | "database" | "unknown";

interface SubmitError {
  kind: SubmitErrorKind;
  title: string;
  message: string;
  hint?: string;
}

class StageError extends Error {
  constructor(public info: SubmitError, cause?: unknown) {
    super(info.message);
    this.name = "StageError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) return true;
  const msg = (e as { message?: string })?.message ?? "";
  return /Failed to fetch|NetworkError|ERR_NETWORK|ENOTFOUND|timeout/i.test(msg);
}

function classifyStorage(e: unknown): SubmitError {
  if (isNetworkError(e)) {
    return {
      kind: "network",
      title: "Sin conexión al subir",
      message: "No pudimos contactar con el servidor de imágenes.",
      hint: "Revisa tu conexión y vuelve a intentarlo.",
    };
  }
  const raw = (e as { message?: string })?.message ?? String(e);
  const status = (e as { statusCode?: string | number })?.statusCode;
  if (/Bucket not found/i.test(raw)) {
    return {
      kind: "storage",
      title: "Almacenamiento no disponible",
      message: "El contenedor de imágenes no existe todavía.",
      hint: "Contacta con el administrador para completar la configuración.",
    };
  }
  if (String(status) === "413" || /Payload too large|exceeded/i.test(raw)) {
    return {
      kind: "storage",
      title: "Imagen demasiado grande",
      message: "El servidor rechazó la imagen por tamaño.",
      hint: "Prueba con una foto de menos de 8 MB.",
    };
  }
  if (String(status) === "403" || /not authorized|permission|RLS/i.test(raw)) {
    return {
      kind: "storage",
      title: "Sin permisos para subir",
      message: "Tu sesión no tiene permiso para guardar imágenes.",
      hint: "Cierra sesión y vuelve a entrar.",
    };
  }
  return {
    kind: "storage",
    title: "Error al subir la imagen",
    message: raw || "Ocurrió un problema al guardar la foto.",
    hint: "Inténtalo de nuevo en unos segundos.",
  };
}

function classifyDatabase(e: unknown): SubmitError {
  if (isNetworkError(e)) {
    return {
      kind: "network",
      title: "Sin conexión al guardar",
      message: "No pudimos contactar con la base de datos.",
      hint: "Revisa tu conexión y vuelve a intentarlo.",
    };
  }
  const raw = (e as { message?: string })?.message ?? String(e);
  const code = (e as { code?: string })?.code;
  if (code === "23505" || /duplicate key/i.test(raw)) {
    return {
      kind: "database",
      title: "Prenda duplicada",
      message: "Ya existe una prenda con esos datos.",
    };
  }
  if (code === "42501" || /permission|RLS|policy/i.test(raw)) {
    return {
      kind: "database",
      title: "Sin permisos para guardar",
      message: "Tu sesión no tiene permiso para escribir esta prenda.",
      hint: "Cierra sesión y vuelve a entrar.",
    };
  }
  return {
    kind: "database",
    title: "Error al guardar la prenda",
    message: raw || "La base de datos rechazó la operación.",
    hint: "Revisa los campos e inténtalo de nuevo.",
  };
}

function validateImage(file: File): string | null {
  if (!ACCEPTED_MIME.includes(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    return "Formato no soportado. Usa JPG, PNG, WEBP o HEIC.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `La imagen pesa ${mb} MB. El máximo permitido es 8 MB.`;
  }
  if (file.size === 0) return "El archivo está vacío.";
  return null;
}

export const Route = createFileRoute("/_authenticated/wardrobe/add")({
  head: () => ({
    meta: [{ title: "Añadir prenda — WIW" }],
  }),
  component: AddItemPage,
});

type Stage = "idle" | "uploading" | "saving";

function AddItemPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ClothingCategory>("tops");
  const [subcategory, setSubcategory] = useState("");
  const [color, setColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [material, setMaterial] = useState("");
  const [season, setSeason] = useState<ClothingSeason>("all");
  const [occasions, setOccasions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [aiSnapshot, setAiSnapshot] = useState<{
    category: ClothingCategory;
    subcategory: string;
    color: string;
    secondaryColor: string;
    brand: string;
    material: string;
    season: ClothingSeason;
    occasions: string[];
    fields: string[];
  } | null>(null);

  const aiDetection = useAiDetection();

  function markAi(fields: string[]) {
    setAiFields((prev) => {
      const next = new Set(prev);
      for (const f of fields) next.add(f);
      return next;
    });
  }

  function unmarkAi(field: string) {
    setAiFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  function applyAiResult(res: {
    category: string | null;
    subcategory: string | null;
    primary_color: string | null;
    secondary_colors: string[];
    season: string | null;
    occasions: string[];
    material: string | null;
    brand_guess: string | null;
  }) {
    const filled: string[] = [];
    if (res.category && KNOWN_CATEGORIES.includes(res.category as ClothingCategory)) {
      setCategory(res.category as ClothingCategory);
      filled.push("category");
    }
    if (res.season && KNOWN_SEASONS.includes(res.season as ClothingSeason)) {
      setSeason(res.season as ClothingSeason);
      filled.push("season");
    }
    if (res.subcategory) {
      setSubcategory(res.subcategory);
      filled.push("subcategory");
    }
    if (res.primary_color) {
      setColor(res.primary_color);
      filled.push("color");
    }
    if (res.secondary_colors?.length) {
      setSecondaryColor(res.secondary_colors.join(", "));
      filled.push("secondaryColor");
    }
    if (res.material) {
      setMaterial(res.material);
      filled.push("material");
    }
    if (res.brand_guess) {
      setBrand(res.brand_guess);
      filled.push("brand");
    }
    if (res.occasions?.length) {
      setOccasions(res.occasions);
      filled.push("occasions");
    }
    markAi(filled);
    setAiSnapshot({
      category: (res.category && KNOWN_CATEGORIES.includes(res.category as ClothingCategory)
        ? (res.category as ClothingCategory)
        : category),
      subcategory: res.subcategory ?? "",
      color: res.primary_color ?? "",
      secondaryColor: res.secondary_colors?.length ? res.secondary_colors.join(", ") : "",
      brand: res.brand_guess ?? "",
      material: res.material ?? "",
      season: (res.season && KNOWN_SEASONS.includes(res.season as ClothingSeason)
        ? (res.season as ClothingSeason)
        : season),
      occasions: res.occasions ?? [],
      fields: filled,
    });
  }

  function restoreAiSnapshot() {
    if (!aiSnapshot) return;
    setCategory(aiSnapshot.category);
    setSubcategory(aiSnapshot.subcategory);
    setColor(aiSnapshot.color);
    setSecondaryColor(aiSnapshot.secondaryColor);
    setBrand(aiSnapshot.brand);
    setMaterial(aiSnapshot.material);
    setSeason(aiSnapshot.season);
    setOccasions(aiSnapshot.occasions);
    setAiFields(new Set(aiSnapshot.fields));
    toast.success("Se restauraron los valores detectados por IA");
  }


  async function runDetection() {
    if (!file) return;
    const res = await aiDetection.detect(file);
    if (res) {
      applyAiResult(res);
      toast.success("Detección aplicada — revisa y edita antes de guardar", {
        description: `Confianza ${(res.confidence * 100).toFixed(0)}% · ${res.model}`,
      });
    }
  }


  const wardrobeQuery = useQuery({
    queryKey: ["default-wardrobe", user?.id],
    queryFn: () => getDefaultWardrobe(user!.id),
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new StageError({
          kind: "validation",
          title: "Sesión expirada",
          message: "Vuelve a iniciar sesión para añadir prendas.",
        });
      }
      if (imageError) {
        throw new StageError({
          kind: "validation",
          title: "Imagen no válida",
          message: imageError,
        });
      }
      let wardrobe;
      try {
        wardrobe = wardrobeQuery.data ?? (await getDefaultWardrobe(user.id));
      } catch (err) {
        throw new StageError(classifyDatabase(err), err);
      }
      let image_url: string | null = null;
      let storage_path: string | null = null;
      if (file) {
        setStage("uploading");
        try {
          const up = await uploadItemImage(user.id, wardrobe.id, file);
          image_url = up.signedUrl;
          storage_path = up.path;
        } catch (err) {
          throw new StageError(classifyStorage(err), err);
        }
      }
      setStage("saving");
      try {
        return await createClothingItem({
          user_id: user.id,
          wardrobe_id: wardrobe.id,
          name: name.trim() || null,
          category,
          subcategory: subcategory.trim() || null,
          color: color.trim() || null,
          secondary_color: secondaryColor.trim() || null,
          brand: brand.trim() || null,
          size: size.trim() || null,
          material: material.trim() || null,
          seasons: [season],
          occasions,
          notes: notes.trim() || null,
          image_url,
          storage_path,
        });
      } catch (err) {
        throw new StageError(classifyDatabase(err), err);
      }
    },
    onMutate: () => {
      setSubmitError(null);
    },
    onSuccess: () => {
      toast.success("Prenda añadida");
      qc.invalidateQueries({ queryKey: ["clothing_items", user?.id] });
      navigate({ to: "/wardrobe" });
    },
    onError: (e: Error) => {
      setStage("idle");
      const info: SubmitError =
        e instanceof StageError
          ? e.info
          : {
              kind: "unknown",
              title: "No se pudo guardar",
              message: e.message || "Ocurrió un error inesperado.",
              hint: "Inténtalo de nuevo.",
            };
      setSubmitError(info);
      toast.error(info.title, { description: info.message });
    },
  });

  function pickFile(f: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    aiDetection.reset();
    setAiSnapshot(null);
    setAiFields(new Set());
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      setImageError(null);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    const err = validateImage(f);
    if (err) {
      setImageError(err);
      setFile(null);
      setPreviewUrl(null);
      if (fileInput.current) fileInput.current.value = "";
      toast.error(err);
      return;
    }
    setImageError(null);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }


  const stageLabel =
    stage === "uploading"
      ? "Subiendo imagen…"
      : stage === "saving"
        ? "Guardando prenda…"
        : "Guardar prenda";


  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-background">
      <header className="flex items-center gap-3 px-6 pt-10 pb-4">
        <Link
          to="/wardrobe"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="eyebrow">Mi Armario</div>
          <h1 className="font-display text-2xl">Añadir prenda</h1>
        </div>
      </header>

      <form
        className="flex-1 space-y-5 px-6 pb-32"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={mutation.isPending}
            aria-invalid={imageError ? true : undefined}
            className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed bg-secondary/50 text-muted-foreground transition hover:bg-secondary disabled:opacity-60 ${
              imageError ? "border-destructive" : "border-border"
            }`}
          >
            {previewUrl ? (
              <>
                <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                {stage === "uploading" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-xs">Subiendo imagen…</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 text-center">
                <Camera className="h-8 w-8" strokeWidth={1.25} />
                <span className="text-sm">Toca para añadir foto</span>
                <span className="text-[11px] text-muted-foreground/80">
                  JPG, PNG, WEBP o HEIC · máx. 8 MB
                </span>
              </div>
            )}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {imageError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{imageError}</span>
            </div>
          )}
          {file && !imageError && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">
                {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB
              </span>
              <button
                type="button"
                onClick={() => pickFile(null)}
                disabled={mutation.isPending}
                className="inline-flex items-center gap-1 text-foreground/70 underline-offset-2 hover:underline disabled:opacity-50"
              >
                <X className="h-3 w-3" /> Quitar
              </button>
            </div>
          )}
        </div>

        {file && !imageError && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={runDetection}
              disabled={aiDetection.isRunning || mutation.isPending}
            >
              {aiDetection.isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {aiDetection.isRunning ? "Analizando…" : "Detectar con IA"}
            </Button>
            <AiDetectionStatus
              stage={aiDetection.stage}
              progress={aiDetection.progress}
              label={aiDetection.label}
              error={aiDetection.error}
              onRetry={runDetection}
              onDismiss={aiDetection.reset}
            />
          </div>
        )}




        {aiFields.size > 0 && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
            <span className="font-medium">Detección IA aplicada.</span>{" "}
            <span className="text-muted-foreground">
              Los campos marcados con
              <span className="mx-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                <Sparkles className="h-2.5 w-2.5" /> IA
              </span>
              se rellenaron automáticamente. Puedes editarlos antes de guardar.
            </span>
          </div>
        )}

        <div className="space-y-2">
          <FieldLabel htmlFor="name" fromAi={aiFields.has("name")}>Nombre</FieldLabel>
          <Input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              unmarkAi("name");
            }}
            placeholder="Camisa lino blanca"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <FieldLabel fromAi={aiFields.has("category")}>Categoría</FieldLabel>
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v as ClothingCategory);
                unmarkAi("category");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as ClothingCategory[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {CATEGORY_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="subcategory" fromAi={aiFields.has("subcategory")}>
              Subcategoría
            </FieldLabel>
            <Input
              id="subcategory"
              value={subcategory}
              onChange={(e) => {
                setSubcategory(e.target.value);
                unmarkAi("subcategory");
              }}
              placeholder="Camisa, vaquero…"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <FieldLabel htmlFor="color" fromAi={aiFields.has("color")}>Color</FieldLabel>
            <Input
              id="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                unmarkAi("color");
              }}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel
              htmlFor="secondaryColor"
              fromAi={aiFields.has("secondaryColor")}
            >
              Color secundario
            </FieldLabel>
            <Input
              id="secondaryColor"
              value={secondaryColor}
              onChange={(e) => {
                setSecondaryColor(e.target.value);
                unmarkAi("secondaryColor");
              }}
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <FieldLabel htmlFor="brand" fromAi={aiFields.has("brand")}>Marca</FieldLabel>
            <Input
              id="brand"
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                unmarkAi("brand");
              }}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="material" fromAi={aiFields.has("material")}>
              Material
            </FieldLabel>
            <Input
              id="material"
              value={material}
              onChange={(e) => {
                setMaterial(e.target.value);
                unmarkAi("material");
              }}
              placeholder="Algodón, lino…"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="size">Talla</Label>
            <Input id="size" value={size} onChange={(e) => setSize(e.target.value)} />
          </div>
          <div className="space-y-2">
            <FieldLabel fromAi={aiFields.has("season")}>Temporada</FieldLabel>
            <Select
              value={season}
              onValueChange={(v) => {
                setSeason(v as ClothingSeason);
                unmarkAi("season");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SEASON_LABELS) as ClothingSeason[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SEASON_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel fromAi={aiFields.has("occasions")}>Ocasiones</FieldLabel>
          <OccasionsPicker
            value={occasions}
            onChange={(next) => {
              setOccasions(next);
              unmarkAi("occasions");
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>


        {submitError && (
          <div
            role="alert"
            aria-live="assertive"
            data-error-kind={submitError.kind}
            className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive"
          >
            <ErrorIcon kind={submitError.kind} />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium leading-tight">{submitError.title}</p>
                <span className="rounded-full border border-destructive/30 px-1.5 py-0 text-[10px] uppercase tracking-wide text-destructive/80">
                  {kindLabel(submitError.kind)}
                </span>
              </div>
              <p className="text-xs leading-snug text-destructive/85">{submitError.message}</p>
              {submitError.hint && (
                <p className="text-xs leading-snug text-muted-foreground">{submitError.hint}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              aria-label="Cerrar error"
              className="text-destructive/70 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={mutation.isPending || !user || !!imageError}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {stageLabel}
        </Button>
        {submitError && submitError.kind !== "validation" && (
          <p className="text-center text-xs text-muted-foreground">
            {submitError.kind === "network"
              ? "Se reintentará cuando pulses “Guardar prenda” de nuevo."
              : "Puedes reintentar sin perder los datos del formulario."}
          </p>
        )}

      </form>
    </div>
  );
}

function kindLabel(k: SubmitErrorKind): string {
  switch (k) {
    case "validation":
      return "Validación";
    case "network":
      return "Red";
    case "storage":
      return "Almacenamiento";
    case "database":
      return "Base de datos";
    default:
      return "Error";
  }
}

function ErrorIcon({ kind }: { kind: SubmitErrorKind }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0";
  if (kind === "network") return <CloudOff className={cls} />;
  if (kind === "storage") return <HardDrive className={cls} />;
  if (kind === "database") return <Database className={cls} />;
  return <AlertCircle className={cls} />;
}

function FieldLabel({
  htmlFor,
  fromAi,
  children,
}: {
  htmlFor?: string;
  fromAi?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={htmlFor}>{children}</Label>
      {fromAi && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-primary">
          <Sparkles className="h-2.5 w-2.5" strokeWidth={1.75} /> IA
        </span>
      )}
    </div>
  );
}
