import { Link } from "@tanstack/react-router";
import { Shirt, Sparkles, Compass, User, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const tabs = [
  { to: "/wardrobe", label: "Armario", icon: Shirt, auth: true },
  { to: "/outfits", label: "Outfits", icon: Layers, auth: true },
  { to: "/recommendations", label: "Para hoy", icon: Sparkles, auth: true },
  { to: "/feed", label: "Feed", icon: Compass, auth: true },
  { to: "/profile", label: "Perfil", icon: User, auth: true },
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
  const { user } = useAuth();
  const visibleTabs = user ? tabs : [];

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

      {visibleTabs.length > 0 && (
        <nav
          aria-label="Navegación principal"
          className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] border-t border-border bg-background/95 backdrop-blur"
        >
          <ul
            className={cn(
              "grid",
              visibleTabs.length === 5 && "grid-cols-5",
              visibleTabs.length === 4 && "grid-cols-4",
              visibleTabs.length === 3 && "grid-cols-3",
              visibleTabs.length === 2 && "grid-cols-2",
              visibleTabs.length === 1 && "grid-cols-1"
            )}
          >
            {visibleTabs.map((tab) => (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  activeOptions={{ exact: false }}
                  className="flex flex-col items-center gap-1 py-3 text-[10px] tracking-wider uppercase transition-colors text-muted-foreground"
                  activeProps={{
                    className:
                      "flex flex-col items-center gap-1 py-3 text-[10px] tracking-wider uppercase transition-colors text-foreground",
                  }}
                >
                  {({ isActive }: { isActive: boolean }) => (
                    <>
                      <tab.icon
                        className={cn(
                          "h-5 w-5",
                          isActive ? "stroke-[1.5]" : "stroke-[1.25]"
                        )}
                      />
                      <span>{tab.label}</span>
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
