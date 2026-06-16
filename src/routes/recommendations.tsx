import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export const Route = createFileRoute("/recommendations")({
  head: () => ({
    meta: [
      { title: "Recomendaciones IA — WIW" },
      { name: "description", content: "Qué ponerte hoy según clima, evento y tus gustos." },
    ],
  }),
  component: () => (
    <PlaceholderScreen
      eyebrow="Para hoy"
      title="¿Qué me pongo?"
      description="Recomendaciones con IA según clima, evento y tus gustos. Se construye en la Fase 6."
    />
  ),
});
