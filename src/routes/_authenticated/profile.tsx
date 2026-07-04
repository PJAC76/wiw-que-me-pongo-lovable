import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart, LogOut, User as UserIcon, Share2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth, signOut } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getMyProfile,
  updateProfile,
  USERNAME_REGEX,
  type Profile,
} from "@/lib/social";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Perfil — WIW" },
      { name: "description", content: "Tu perfil WIW y tu enlace público." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => (user ? getMyProfile(user.id) : Promise.resolve(null)),
    enabled: !!user,
  });

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (profileQ.data) {
      setUsername(profileQ.data.username);
      setDisplayName(profileQ.data.display_name ?? "");
      setBio(profileQ.data.bio ?? "");
    }
  }, [profileQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sesión requerida");
      return updateProfile(user.id, {
        username,
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
      });
    },
    onSuccess: (p: Profile) => {
      qc.setQueryData(["profile", user?.id], p);
      toast.success("Perfil actualizado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const usernameValid = USERNAME_REGEX.test(username);

  return (
    <AppShell eyebrow="Tú" title="Perfil">
      <div className="space-y-8">
        {profileQ.isLoading && (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        )}

        {profileQ.data && (
          <>
            <section className="flex items-center gap-4">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-muted">
                {profileQ.data.avatar_url ? (
                  <img
                    src={profileQ.data.avatar_url}
                    alt=""
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <UserIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-lg text-foreground">
                  {profileQ.data.display_name ?? `@${profileQ.data.username}`}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  @{profileQ.data.username}
                </p>
              </div>
            </section>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link to="/u/$username" params={{ username: profileQ.data.username }}>
                  <Share2 className="mr-1.5 h-4 w-4" /> Ver mi perfil público
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link to="/favorites">
                  <Heart className="mr-1.5 h-4 w-4" /> Favoritos
                </Link>
              </Button>
            </div>

            <section className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Nombre de usuario</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">@</span>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                    }
                    maxLength={20}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  3–20 caracteres: minúsculas, números o guion bajo.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Nombre visible</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={60}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={200}
                />
              </div>

              <Button
                onClick={() => saveMut.mutate()}
                disabled={!usernameValid || saveMut.isPending}
              >
                {saveMut.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </section>

            <section className="border-t border-border pt-6">
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="mr-1.5 h-4 w-4" /> Cerrar sesión
              </Button>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
