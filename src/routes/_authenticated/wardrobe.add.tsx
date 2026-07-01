import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Camera, CloudOff, Database, HardDrive, Loader2, X } from "lucide-react";
import { toast } from "sonner";
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
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ClothingCategory>("tops");
  const [color, setColor] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [season, setSeason] = useState<ClothingSeason>("all");
  const [notes, setNotes] = useState("");

  const wardrobeQuery = useQuery({
    queryKey: ["default-wardrobe", user?.id],
    queryFn: () => getDefaultWardrobe(user!.id),
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("No autenticado");
      if (imageError) throw new Error(imageError);
      const wardrobe = wardrobeQuery.data ?? (await getDefaultWardrobe(user.id));
      let image_url: string | null = null;
      let storage_path: string | null = null;
      if (file) {
        setStage("uploading");
        const up = await uploadItemImage(user.id, wardrobe.id, file);
        image_url = up.signedUrl;
        storage_path = up.path;
      }
      setStage("saving");
      return createClothingItem({
        user_id: user.id,
        wardrobe_id: wardrobe.id,
        name: name.trim() || null,
        category,
        color: color.trim() || null,
        brand: brand.trim() || null,
        size: size.trim() || null,
        seasons: [season],
        notes: notes.trim() || null,
        image_url,
        storage_path,
      });
    },
    onSuccess: () => {
      toast.success("Prenda añadida");
      qc.invalidateQueries({ queryKey: ["clothing_items", user?.id] });
      navigate({ to: "/wardrobe" });
    },
    onError: (e: Error) => {
      setStage("idle");
      toast.error(e.message);
    },
  });

  function pickFile(f: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
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


        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Camisa lino blanca"
          />
        </div>

        <div className="space-y-2">
          <Label>Categoría</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ClothingCategory)}>
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand">Marca</Label>
            <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="size">Talla</Label>
            <Input id="size" value={size} onChange={(e) => setSize(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Temporada</Label>
            <Select value={season} onValueChange={(v) => setSeason(v as ClothingSeason)}>
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
          <Label htmlFor="notes">Notas</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={mutation.isPending || !user || !!imageError}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {stageLabel}
        </Button>

      </form>
    </div>
  );
}
