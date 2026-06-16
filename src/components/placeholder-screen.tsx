import { AppShell } from "./app-shell";

export function PlaceholderScreen({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <AppShell eyebrow={eyebrow} title={title}>
      <div className="mt-12 flex flex-col items-center text-center">
        <div className="h-px w-12 bg-stone/60" />
        <p className="mt-8 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <p className="eyebrow mt-10">Próximamente</p>
      </div>
    </AppShell>
  );
}
