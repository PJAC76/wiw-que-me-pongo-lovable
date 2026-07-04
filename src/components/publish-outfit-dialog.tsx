import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  publishOutfit,
  uploadPublicOutfitImage,
  type PublicOutfit,
} from "@/lib/social";
import type { OutfitLog } from "@/lib/outfit-logs";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  log: OutfitLog | null;
  onPublished: (outfit: PublicOutfit) => void;
}

export function PublishOutfitDialog({
  open,
  onOpenChange,
  userId,
  log,
  onPublished,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
    setTitle("");
  };

  const handleFile = (f: File | null) => {
    setFile(f);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return f ? URL.createObjectURL(f) : null;
    });
  };

  const handlePublish = async () => {
    if (!log || !file) return;
    setSaving(true);
    try {
      const { path, signedUrl } = await uploadPublicOutfitImage(userId, file);
      const outfit = await publishOutfit({
        user_id: userId,
        log_id: log.id,
        image_url: signedUrl,
        image_path: path,
        title: title.trim() || null,
        occasions: log.occasions,
        item_ids: log.item_ids,
      });
      toast.success("Publicado en el feed");
      onPublished(outfit);
      reset();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al publicar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publicar en el feed</DialogTitle>
          <DialogDescription>
            Este outfit será <strong>visible públicamente</strong> en el feed y podrá ser
            votado del 0 al 10 por otras personas. Podrás quitarlo en cualquier momento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Foto del look</Label>
            {preview ? (
              <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
                <img src={preview} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleFile(null)}
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-background/90"
                  aria-label="Quitar foto"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground"
              >
                <Upload className="h-6 w-6" />
                <span>Sube una foto del look completo</span>
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pub-title">Título (opcional)</Label>
            <Input
              id="pub-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Un jueves en Madrid"
              maxLength={80}
            />
          </div>

          {log && log.occasions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {log.occasions.map((o) => (
                <span
                  key={o}
                  className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  {o}
                </span>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handlePublish} disabled={!file || saving}>
            {saving ? "Publicando…" : "Publicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
