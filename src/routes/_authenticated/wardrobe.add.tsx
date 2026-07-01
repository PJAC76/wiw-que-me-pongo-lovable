import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Camera, Loader2, X } from "lucide-react";
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
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-secondary/50 text-muted-foreground transition hover:bg-secondary"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Camera className="h-8 w-8" strokeWidth={1.25} />
              <span className="text-sm">Toca para añadir foto</span>
            </div>
          )}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />

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
          disabled={mutation.isPending || !user}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar prenda
        </Button>
      </form>
    </div>
  );
}
