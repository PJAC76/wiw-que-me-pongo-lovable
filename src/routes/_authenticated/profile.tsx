import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Perfil — WIW" },
      { name: "description", content: "Tu perfil WIW." },
    ],
  }),
  component: () => (
    <PlaceholderScreen
      eyebrow="Perfil"
      title="Tú en WIW"
      description="Tu perfil, ajustes, plan y analíticas de armario. Se construye en las Fases 1, 7 y 8."
    />
  ),
});
