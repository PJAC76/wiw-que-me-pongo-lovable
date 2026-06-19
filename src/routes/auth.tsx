import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — WIW" },
      { name: "description", content: "Entra o crea tu cuenta en WIW." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  // Si ya hay sesión, redirige.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) navigate({ to: "/profile" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/profile" });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function handleEmail(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bienvenido de vuelta");
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/profile`,
            data: { full_name: fullName || undefined },
          },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Revisa tu email si requiere confirmación.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Te enviamos un enlace para restablecer la contraseña.");
        setMode("signin");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de autenticación";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/profile` },
      });
      if (error) throw error;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error con el proveedor";
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-background px-8 py-14">
      <Link to="/" className="eyebrow">← WIW</Link>
      <h1 className="mt-12 text-4xl leading-tight text-foreground">
        {mode === "signin" && "Entrar"}
        {mode === "signup" && "Crear cuenta"}
        {mode === "forgot" && "Recuperar acceso"}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {mode === "signin" && "Accede a tu armario."}
        {mode === "signup" && "Empieza tu armario virtual."}
        {mode === "forgot" && "Te enviamos un enlace por email."}
      </p>

      <form onSubmit={handleEmail} className="mt-8 space-y-4">
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {mode !== "forgot" && (
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {busy
            ? "..."
            : mode === "signin"
            ? "Entrar"
            : mode === "signup"
            ? "Crear cuenta"
            : "Enviar enlace"}
        </Button>
      </form>

      {mode !== "forgot" && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => handleOAuth("google")}
              className="w-full"
            >
              Continuar con Google
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => handleOAuth("apple")}
              className="w-full"
            >
              Continuar con Apple
            </Button>
          </div>
        </>
      )}

      <div className="mt-8 space-y-2 text-center text-sm text-muted-foreground">
        {mode === "signin" && (
          <>
            <button type="button" onClick={() => setMode("forgot")} className="underline">
              ¿Olvidaste la contraseña?
            </button>
            <p>
              ¿Nueva por aquí?{" "}
              <button type="button" onClick={() => setMode("signup")} className="underline">
                Crear cuenta
              </button>
            </p>
          </>
        )}
        {mode === "signup" && (
          <p>
            ¿Ya tienes cuenta?{" "}
            <button type="button" onClick={() => setMode("signin")} className="underline">
              Entrar
            </button>
          </p>
        )}
        {mode === "forgot" && (
          <button type="button" onClick={() => setMode("signin")} className="underline">
            Volver a entrar
          </button>
        )}
      </div>
    </div>
  );
}
