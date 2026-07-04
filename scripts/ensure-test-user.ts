/**
 * Ensures the E2E test user exists and has the expected password.
 *
 * Uses the Supabase Admin API (service role) to:
 *   1. Look up the user by TEST_EMAIL.
 *   2. Create it (email_confirm=true) if missing.
 *   3. Update its password to TEST_PASSWORD if it already exists.
 *
 * Required env vars:
 *   - SUPABASE_URL (o VITE_SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - TEST_EMAIL
 *   - TEST_PASSWORD
 *
 * Usage (local o CI):
 *   bun run scripts/ensure-test-user.ts
 */
import { createClient } from "@supabase/supabase-js";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request
        ? input.headers
        : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // Las claves nuevas de Supabase (`sb_secret_*`) son opacas, no JWT.
    // supabase-js añade `Authorization: Bearer <key>` por defecto, pero Auth
    // Admin debe recibir la clave nueva como `apikey` para evitar "Invalid API key".
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  if (!v) {
    console.error(`::error::Falta la variable de entorno ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const url = req("SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceKey = req("SUPABASE_SERVICE_ROLE_KEY");
  const email = req("TEST_EMAIL");
  const password = req("TEST_PASSWORD");

  if (serviceKey.startsWith("sb_publishable_")) {
    console.error(
      "::error::SUPABASE_SERVICE_ROLE_KEY contiene una publishable/anon key. Debe ser la clave privada service_role o secret key del mismo proyecto.",
    );
    process.exit(1);
  }

  let projectHost: string;
  try {
    projectHost = new URL(url).host;
  } catch {
    console.error("::error::SUPABASE_URL no es una URL válida.");
    process.exit(1);
  }

  console.log(`Verificando usuario E2E contra ${projectHost}`);

  const admin = createClient(url, serviceKey, {
    global: { fetch: createSupabaseFetch(serviceKey) },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Buscar el usuario paginando (no hay getUserByEmail estable en todas las versiones).
  let existingId: string | null = null;
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      const keyHint = serviceKey.startsWith("sb_secret_")
        ? "Se ha detectado una secret key nueva (sb_secret_*). Si sigue fallando, crea o copia la service_role legacy JWT (empieza por eyJ...) del mismo proyecto."
        : "Comprueba que SUPABASE_SERVICE_ROLE_KEY sea la service_role key del mismo proyecto que SUPABASE_URL.";
      console.error(`::error::listUsers falló: ${error.message}. ${keyHint}`);
      process.exit(1);
    }
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (match) {
      existingId = match.id;
      break;
    }
    if (data.users.length < perPage) break;
  }

  if (existingId) {
    const { error } = await admin.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.error("::error::updateUserById falló:", error.message);
      process.exit(1);
    }
    console.log(`✓ Usuario de test actualizado (${email}) id=${existingId}`);
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: "playwright-e2e" },
  });
  if (error) {
    console.error("::error::createUser falló:", error.message);
    process.exit(1);
  }
  console.log(`✓ Usuario de test creado (${email}) id=${data.user?.id}`);
}

main().catch((e) => {
  console.error("::error::ensure-test-user crash:", e);
  process.exit(1);
});
