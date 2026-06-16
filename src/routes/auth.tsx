import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — WIW" },
      { name: "description", content: "Entra o crea tu cuenta en WIW." },
    ],
  }),
  component: Auth,
});

function Auth() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-background px-8 py-14">
      <Link to="/" className="eyebrow">← WIW</Link>
      <h1 className="mt-12 text-4xl leading-tight text-foreground">Entrar</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Email, contraseña y proveedores sociales se conectan en la Fase 1 con Lovable Cloud.
      </p>

      <div className="mt-auto">
        <Link
          to="/wardrobe"
          className="block w-full rounded-md bg-primary px-6 py-4 text-center text-sm uppercase tracking-[0.18em] text-primary-foreground transition-opacity hover:opacity-90"
        >
          Entrar a la demo
        </Link>
      </div>
    </div>
  );
}
