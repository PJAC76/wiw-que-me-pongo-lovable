import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export const Route = createFileRoute("/outfits")({
  head: () => ({
    meta: [
      { title: "Outfits — WIW" },
      { name: "description", content: "Tus outfits y registro diario." },
    ],
  }),
  component: () => (
    <PlaceholderScreen
      eyebrow="Outfits"
      title="Tus looks"
      description="Crea outfits, registra qué te pones cada día y revisa tu historial. Se construye en la Fase 4."
    />
  ),
});
