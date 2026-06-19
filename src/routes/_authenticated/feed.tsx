import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({
    meta: [
      { title: "Feed — WIW" },
      { name: "description", content: "Descubre outfits de la comunidad WIW." },
    ],
  }),
  component: () => (
    <PlaceholderScreen
      eyebrow="Feed"
      title="Descubre"
      description="Feed público global con outfits votados del 0 al 10 y favoritos. Se construye en la Fase 5."
    />
  ),
});
