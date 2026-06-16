import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Bienvenida — WIW" },
      { name: "description", content: "Configura WIW en unos pasos." },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-background px-8 py-14">
      <div className="eyebrow">Bienvenida</div>
      <h1 className="mt-6 text-4xl leading-tight text-foreground">
        Antes de empezar,
        <br />
        cuéntanos sobre ti.
      </h1>
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        Idioma, país, estilo preferido, tallas y tu primer armario. Este flujo se construye en
        la Fase 1.
      </p>

      <div className="mt-auto space-y-3">
        <Link
          to="/auth"
          className="block w-full rounded-md bg-primary px-6 py-4 text-center text-sm uppercase tracking-[0.18em] text-primary-foreground transition-opacity hover:opacity-90"
        >
          Continuar
        </Link>
        <Link
          to="/"
          className="block text-center text-xs uppercase tracking-[0.18em] text-muted-foreground"
        >
          Volver
        </Link>
      </div>
    </div>
  );
}
