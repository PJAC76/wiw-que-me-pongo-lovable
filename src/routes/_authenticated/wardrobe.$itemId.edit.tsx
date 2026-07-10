import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
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
import { OccasionsPicker } from "@/components/occasions-picker";
import { useAuth } from "@/hooks/use-auth";
import {
  CATEGORY_LABELS,
  SEASON_LABELS,
  getClothingItem,
  removeStorageObject,
  updateClothingItem,
  uploadItemImage,
  type ClothingCategory,
  type ClothingSeason,
} from "@/lib/wardrobe";

export const Route = createFileRoute("/_authenticated/wardrobe/$itemId/edit")({
  head: () => ({ meta: [{ title: "Editar prenda — WIW" }] }),
  component: EditItemPage,
});

function EditItemPage() {
  const { itemId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: item, isLoading } = useQuery({
    queryKey: ["clothing_item", itemId],
    queryFn: () => getClothingItem(itemId),
  });

  const [ready, setReady] = useState(false);
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
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removedImage, setRemovedImage] = useState(false);

  useEffect(() => {
    if (!item || ready) return;
    setName(item.name ?? "");
    setCategory(item.category);
    setSubcategory(item.subcategory ?? "");
    setColor(item.color ?? "");
    setSecondaryColor(item.secondary_color ?? "");
    setBrand(item.brand ?? "");
    setSize(item.size ?? "");
    setMaterial(item.material ?? "");
    setSeason(item.seasons?.[0] ?? "all");
    setOccasions(item.occasions ?? []);
    setNotes(item.notes ?? "");
    setReady(true);
  }, [item, ready]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pickFile(f: File | null) {
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
    if (f) setRemovedImage(false);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user || !item) throw new Error("No autenticado");
      let image_url = item.image_url;
      let storage_path = item.storage_path;

      if (file) {
        const up = await uploadItemImage(user.id, item.wardrobe_id, file);
        if (item.storage_path) {
          await removeStorageObject(item.storage_path).catch(() => {});
        }
        image_url = up.signedUrl;
        storage_path = up.path;
      } else if (removedImage && item.storage_path) {
        await removeStorageObject(item.storage_path).catch(() => {});
        image_url = null;
        storage_path = null;
      }

      return updateClothingItem(item.id, {
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
    },
    onSuccess: () => {
      toast.success("Prenda actualizada");
      qc.invalidateQueries({ queryKey: ["clothing_items", user?.id] });
      qc.invalidateQueries({ queryKey: ["clothing_item", itemId] });
      navigate({ to: "/wardrobe/$itemId", params: { itemId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentImage = previewUrl ?? (removedImage ? null : item?.image_url ?? null);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-background">
      <header className="flex items-center gap-3 px-6 pt-10 pb-4">
        <Link
          to="/wardrobe/$itemId"
          params={{ itemId }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="eyebrow">Mi Armario</div>
          <h1 className="font-display text-2xl">Editar prenda</h1>
        </div>
      </header>

      {isLoading || !item ? (
        <div className="px-6">
          <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-muted" />
        </div>
      ) : (
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
            {currentImage ? (
              <img src={currentImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Camera className="h-8 w-8" strokeWidth={1.25} />
                <span className="text-sm">Toca para cambiar la foto</span>
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
          {currentImage && (
            <button
              type="button"
              onClick={() => {
                pickFile(null);
                setRemovedImage(true);
              }}
              className="text-xs text-muted-foreground underline"
            >
              Quitar foto
            </button>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-2">
              <Label htmlFor="subcategory">Subcategoría</Label>
              <Input
                id="subcategory"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="Camisa, vaquero…"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondaryColor">Color secundario</Label>
              <Input
                id="secondaryColor"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="brand">Marca</Label>
              <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="material">Material</Label>
              <Input
                id="material"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
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
            <Label>Ocasiones</Label>
            <OccasionsPicker value={occasions} onChange={setOccasions} />
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

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              size="lg"
              onClick={() => navigate({ to: "/wardrobe/$itemId", params: { itemId } })}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              size="lg"
              disabled={mutation.isPending || !user}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
