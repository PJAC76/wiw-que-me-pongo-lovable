/**
 * Ensures the E2E test user exists and has the expected password.
 *
 * Uses the Supabase Auth Admin REST API (service role) to:
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
type AdminUser = {
  id: string;
  email?: string | null;
};

type AdminUsersResponse = {
  users?: AdminUser[];
};

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function req(name: string, fallback?: string): string {
  const raw = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  const v = normalizeEnvValue(raw);
  if (!v) {
    console.error(`::error::Falta la variable de entorno ${name}`);
    process.exit(1);
  }
  return v;
}

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function describeKey(serviceKey: string): string {
  if (serviceKey.startsWith("sb_secret_")) return "secret key nueva (sb_secret_*)";
  if (serviceKey.startsWith("sb_publishable_")) return "publishable/anon key nueva";

  const payload = decodeJwtPayload(serviceKey);
  if (!payload) return "formato no reconocido";

  const role = typeof payload.role === "string" ? payload.role : "sin role";
  const issuer = typeof payload.iss === "string" ? payload.iss : "sin issuer";
  return `JWT con role=${role}, iss=${issuer}`;
}

function authHeaders(serviceKey: string): HeadersInit {
  const headers: Record<string, string> = {
    apikey: serviceKey,
    "content-type": "application/json",
  };

  // Las claves JWT legacy de Auth Admin necesitan Authorization Bearer.
  // Las claves nuevas sb_secret_* son opacas; se envían solo como apikey.
  if (!isNewSupabaseApiKey(serviceKey)) {
    headers.Authorization = `Bearer ${serviceKey}`;
  }

  return headers;
}

async function adminRequest<T>(
  url: string,
  serviceKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1${path}`, {
    ...init,
    headers: {
      ...authHeaders(serviceKey),
      ...init.headers,
    },
  });

  const bodyText = await response.text();
  const body = bodyText ? safeJsonParse(bodyText) : null;

  if (!response.ok) {
    const message = extractErrorMessage(body) ?? bodyText ?? response.statusText;
    throw new Error(`${response.status} ${message}`);
  }

  return body as T;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  for (const key of ["msg", "message", "error_description", "error"]) {
    if (typeof record[key] === "string") return record[key];
  }
  return null;
}

function keyFailureHint(serviceKey: string): string {
  if (serviceKey.startsWith("sb_secret_")) {
    return "Se ha detectado una secret key nueva (sb_secret_*). Si falla aquí, esa key no pertenece al proyecto indicado por SUPABASE_URL o no es una secret key válida.";
  }

  const payload = decodeJwtPayload(serviceKey);
  const role = typeof payload?.role === "string" ? payload.role : null;
  if (role && role !== "service_role") {
    return `La key pegada es un JWT con role=${role}; para este paso debe ser role=service_role del mismo proyecto.`;
  }

  if (role === "service_role") {
    return "La key parece service_role por formato, pero Auth la rechaza: normalmente es de otro proyecto, está truncada, tiene comillas/espacios internos o ha sido rotada.";
  }

  return "Comprueba que SUPABASE_SERVICE_ROLE_KEY sea la service_role key del mismo proyecto que SUPABASE_URL.";
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

  const decodedRole = decodeJwtPayload(serviceKey)?.role;
  if (decodedRole && decodedRole !== "service_role") {
    console.error(
      `::error::SUPABASE_SERVICE_ROLE_KEY no es service_role: contiene role=${decodedRole}. Copia la service_role key, no la anon/publishable key.`,
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
  console.log(`Tipo de SUPABASE_SERVICE_ROLE_KEY detectado: ${describeKey(serviceKey)}`);

  // Buscar el usuario paginando (no hay getUserByEmail estable en todas las versiones).
  let existingId: string | null = null;
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    let data: AdminUsersResponse;
    try {
      data = await adminRequest<AdminUsersResponse>(
        url,
        serviceKey,
        `/admin/users?page=${page}&per_page=${perPage}`,
      );
    } catch (error) {
      console.error(
        `::error::listUsers falló: ${error instanceof Error ? error.message : String(error)}. ${keyFailureHint(serviceKey)}`,
      );
      process.exit(1);
    }

    const users = data.users ?? [];
    const match = users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (match) {
      existingId = match.id;
      break;
    }
    if (users.length < perPage) break;
  }

  if (existingId) {
    try {
      await adminRequest(url, serviceKey, `/admin/users/${existingId}`, {
        method: "PUT",
        body: JSON.stringify({ password, email_confirm: true }),
      });
    } catch (error) {
      console.error(
        "::error::updateUserById falló:",
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
    console.log(`✓ Usuario de test actualizado (${email}) id=${existingId}`);
    return;
  }

  let data: { user?: AdminUser };
  try {
    data = await adminRequest<{ user?: AdminUser }>(url, serviceKey, "/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { purpose: "playwright-e2e" },
      }),
    });
  } catch (error) {
    console.error(
      "::error::createUser falló:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
  console.log(`✓ Usuario de test creado (${email}) id=${data.user?.id}`);
}

main().catch((e) => {
  console.error("::error::ensure-test-user crash:", e);
  process.exit(1);
});
