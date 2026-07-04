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

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Buscar el usuario paginando (no hay getUserByEmail estable en todas las versiones).
  let existingId: string | null = null;
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("::error::listUsers falló:", error.message);
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
