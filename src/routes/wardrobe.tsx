import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export const Route = createFileRoute("/wardrobe")({
  head: () => ({
    meta: [
      { title: "Mi Armario — WIW" },
      { name: "description", content: "Explora tu armario virtual." },
    ],
  }),
  component: () => (
    <PlaceholderScreen
      eyebrow="Mi Armario"
      title="Tu armario"
      description="Aquí verás todas tus prendas con filtros por categoría, color, temporada, ocasión, marca y uso. Se construye en la Fase 2."
    />
  ),
});
