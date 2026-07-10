/**
 * Verifica que las claves Supabase disponibles pertenecen al proyecto esperado
 * (`gjtjejluwrjnntyzrsks` por defecto) antes de lanzar los tests E2E.
 *
 * Comprueba:
 *   1. `VITE_SUPABASE_URL` / `SUPABASE_URL` apuntan al project ref esperado.
 *   2. `VITE_SUPABASE_PROJECT_ID` coincide.
 *   3. `VITE_SUPABASE_PUBLISHABLE_KEY` es válida contra el endpoint REST
 *      del propio proyecto (GET /rest/v1/ → 200) — así descartamos que sea
 *      una publishable key de otro proyecto.
 *   4. (Opcional) Si hay `SUPABASE_SERVICE_ROLE_KEY`, valida que:
 *        - Tenga forma JWT de 3 partes o `sb_secret_*`.
 *        - Si es JWT: el claim `ref` en el payload coincide con el project ref.
 *        - Auth Admin API responde 200 a `GET /auth/v1/admin/users?per_page=1`.
 *
 * Uso local:
 *   bun run scripts/verify-supabase-project.ts
 *
 * Uso en CI: paso previo a Playwright en `.github/workflows/e2e-wardrobe-ai.yml`.
 *
 * Sale con código 1 y un `::error::` legible si alguna comprobación falla.
 */

const EXPECTED_REF = process.env.EXPECTED_PROJECT_REF ?? "gjtjejluwrjnntyzrsks";
const EXPECTED_URL = `https://${EXPECTED_REF}.supabase.co`;

const url =
  process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const projectId =
  process.env.VITE_SUPABASE_PROJECT_ID ?? process.env.SUPABASE_PROJECT_ID ?? "";
const publishable =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const errors: string[] = [];
const info: string[] = [];

function err(msg: string) {
  errors.push(msg);
  console.error(`::error::${msg}`);
}
function ok(msg: string) {
  info.push(msg);
  console.log(`✓ ${msg}`);
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? b64 : b64 + "=".repeat(4 - (b64.length % 4));
    const json = Buffer.from(pad, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// 1) URL + project id -------------------------------------------------------
if (!url) err("Falta VITE_SUPABASE_URL / SUPABASE_URL");
else if (url !== EXPECTED_URL)
  err(`VITE_SUPABASE_URL="${url}" no coincide con ${EXPECTED_URL}`);
else ok(`URL apunta al proyecto ${EXPECTED_REF}`);

if (!projectId) err("Falta VITE_SUPABASE_PROJECT_ID");
else if (projectId !== EXPECTED_REF)
  err(`VITE_SUPABASE_PROJECT_ID="${projectId}" ≠ ${EXPECTED_REF}`);
else ok(`Project ID coincide (${EXPECTED_REF})`);

// 2) Publishable key: forma + prueba contra REST ---------------------------
async function checkPublishable() {
  if (!publishable) {
    err("Falta VITE_SUPABASE_PUBLISHABLE_KEY");
    return;
  }
  if (!/^sb_publishable_/.test(publishable) && !publishable.startsWith("eyJ")) {
    err(
      `VITE_SUPABASE_PUBLISHABLE_KEY con formato inesperado (esperado 'sb_publishable_...' o JWT 'eyJ...')`,
    );
    return;
  }
  // Si es JWT, valida el claim `ref`.
  if (publishable.startsWith("eyJ")) {
    const payload = decodeJwtPayload(publishable);
    const ref = payload?.["ref"];
    if (typeof ref === "string" && ref !== EXPECTED_REF) {
      err(
        `Publishable key es un JWT del proyecto '${ref}', no de '${EXPECTED_REF}'`,
      );
      return;
    }
  }
  // Prueba real: la key debe autenticar contra el REST del proyecto esperado.
  try {
    const res = await fetch(`${EXPECTED_URL}/rest/v1/?select=1`, {
      headers: { apikey: publishable, Authorization: `Bearer ${publishable}` },
    });
    if (res.status === 401 || res.status === 403) {
      const body = await res.text();
      err(
        `Publishable key rechazada por ${EXPECTED_URL} (HTTP ${res.status}). ` +
          `Probablemente pertenece a otro proyecto o está truncada. Body: ${body.slice(0, 200)}`,
      );
      return;
    }
    if (!res.ok && res.status !== 404) {
      err(`REST devolvió HTTP ${res.status} al validar la publishable key`);
      return;
    }
    ok(`Publishable key acepta contra ${EXPECTED_URL} (HTTP ${res.status})`);
  } catch (e) {
    err(`No se pudo contactar ${EXPECTED_URL}: ${(e as Error).message}`);
  }
}

// 3) Service role (opcional) -----------------------------------------------
async function checkServiceRole() {
  if (!serviceRole) {
    console.log(
      "· SUPABASE_SERVICE_ROLE_KEY no está definida — se omite la verificación (esperado hasta Fase 9).",
    );
    return;
  }
  if (/[\s"']/.test(serviceRole)) {
    err("SUPABASE_SERVICE_ROLE_KEY contiene espacios o comillas");
    return;
  }
  const isJwt = serviceRole.split(".").length === 3;
  const isSbSecret = serviceRole.startsWith("sb_secret_");
  if (!isJwt && !isSbSecret) {
    err(
      `SUPABASE_SERVICE_ROLE_KEY no es JWT de 3 partes ni 'sb_secret_*' (len=${serviceRole.length})`,
    );
    return;
  }
  if (isJwt) {
    const payload = decodeJwtPayload(serviceRole);
    const ref = payload?.["ref"];
    const role = payload?.["role"];
    if (typeof ref === "string" && ref !== EXPECTED_REF) {
      err(
        `SUPABASE_SERVICE_ROLE_KEY es un JWT del proyecto '${ref}', no de '${EXPECTED_REF}'`,
      );
      return;
    }
    if (role && role !== "service_role") {
      err(`SUPABASE_SERVICE_ROLE_KEY tiene role='${role}', esperado 'service_role'`);
      return;
    }
  }
  try {
    const res = await fetch(`${EXPECTED_URL}/auth/v1/admin/users?per_page=1`, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    });
    if (res.status !== 200) {
      const body = await res.text();
      err(
        `Auth Admin API rechazó la service role (HTTP ${res.status}). ` +
          `Body: ${body.slice(0, 200)}`,
      );
      return;
    }
    ok("Service role autentica contra Auth Admin API del proyecto esperado");
  } catch (e) {
    err(`No se pudo contactar Auth Admin API: ${(e as Error).message}`);
  }
}

await checkPublishable();
await checkServiceRole();

if (errors.length > 0) {
  console.error(
    `\n::error::verify-supabase-project: ${errors.length} problema(s) — abortando antes de Playwright.`,
  );
  process.exit(1);
}
console.log(
  `\nOK — todas las claves disponibles pertenecen al proyecto ${EXPECTED_REF}.`,
);
