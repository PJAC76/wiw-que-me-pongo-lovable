import { Link, useRouterState } from "@tanstack/react-router";
import { Shirt, Sparkles, Compass, User, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/wardrobe", label: "Armario", icon: Shirt },
  { to: "/outfits", label: "Outfits", icon: Layers },
  { to: "/recommendations", label: "Para hoy", icon: Sparkles },
  { to: "/feed", label: "Feed", icon: Compass },
  { to: "/profile", label: "Perfil", icon: User },
] as const;

export function AppShell({
  children,
  title,
  eyebrow,
  rightSlot,
}: {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  rightSlot?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-background">
      {(title || eyebrow || rightSlot) && (
        <header className="flex items-end justify-between px-6 pt-10 pb-6">
          <div>
            {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
            {title && (
              <h1 className="text-3xl leading-none text-foreground">{title}</h1>
            )}
          </div>
          {rightSlot}
        </header>
      )}

      <main className="flex-1 px-6 pb-32">{children}</main>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] border-t border-border bg-background/95 backdrop-blur"
      >
        <ul className="grid grid-cols-5">
          {tabs.map(({ to, label, icon: Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={cn(
                    "flex flex-col items-center gap-1 py-3 text-[10px] tracking-wider uppercase transition-colors",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      active ? "stroke-[1.5]" : "stroke-[1.25]"
                    )}
                  />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
