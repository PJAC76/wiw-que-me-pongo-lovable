import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WIW — Qué Me Pongo" },
      { name: "description", content: "Tu armario virtual inteligente. Decide qué ponerte cada día con menos fricción." },
      { property: "og:title", content: "WIW — What I Wear" },
      { property: "og:description", content: "Tu armario virtual inteligente." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-background">
      <div className="flex flex-1 flex-col justify-between px-8 py-14">
        <div>
          <div className="eyebrow">What I Wear</div>
          <h1 className="mt-6 text-[44px] leading-[1.05] text-foreground">
            Tu armario,
            <br />
            pensado como
            <br />
            <em className="not-italic text-stone">una estilista.</em>
          </h1>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Digitaliza tu armario, recibe ideas según el clima y la ocasión, y aprende qué te
            sienta mejor — sin fricción.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            to="/onboarding"
            className="block w-full rounded-md bg-primary px-6 py-4 text-center text-sm uppercase tracking-[0.18em] text-primary-foreground transition-opacity hover:opacity-90"
          >
            Empezar
          </Link>
          <Link
            to="/auth"
            className="block w-full rounded-md border border-border bg-card px-6 py-4 text-center text-sm uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-secondary"
          >
            Ya tengo cuenta
          </Link>
          <p className="pt-4 text-center text-[11px] tracking-wider text-muted-foreground">
            Aura of silence · Quiet Luxury
          </p>
        </div>
      </div>
    </div>
  );
}
