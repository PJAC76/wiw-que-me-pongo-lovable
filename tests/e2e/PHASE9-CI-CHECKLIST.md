# Checklist Fase 9 — Preparar CI E2E antes de re-activar el workflow

> Archivo vinculado a `.github/workflows/e2e-wardrobe-ai.yml` (actualmente desactivado).
> Tarea: re-activar CI en Fase 9 · migrar a producción.

## 1. Secretos de GitHub Actions

Añadir en **Settings → Secrets and variables → Actions** del repo `PJAC76/wiw-que-me-pongo-lovable`. Todos son **Repository secrets** (no environment secrets) salvo que se documente lo contrario. Los nombres son case-sensitive y deben coincidir exactamente con los referenciados en `.github/workflows/e2e-wardrobe-ai.yml`.

### 1.1 Tabla completa de secretos

| # | Nombre exacto (GitHub) | Valor esperado | Dónde obtenerlo | Uso en el workflow | Obligatorio |
|---|---|---|---|---|---|
| 1 | `TEST_EMAIL` | Email del usuario Playwright, formato `algo@dominio.tld`. Recomendado: `e2e@wiw-e2e.lovable.app` | Lo eliges tú; será creado/actualizado por el script | `env.TEST_EMAIL` → consumido por `scripts/ensure-test-user.ts` (crear/actualizar user) y por `tests/e2e/*.spec.py` (login en Playwright) | Sí |
| 2 | `TEST_PASSWORD` | Password fuerte (≥12 chars, mayúsc + minúsc + número + símbolo). Ej: `E2e-Wiw-2026-Aa1!` | Lo eliges tú; se fuerza en cada run | `env.TEST_PASSWORD` → `ensure-test-user.ts` (upsert password) y specs de Playwright (login) | Sí |
| 3 | `VITE_SUPABASE_URL` | URL completa del backend Supabase, formato `https://<project-ref>.supabase.co`. Sin barra final. Valor actual: `https://gjtjejluwrjnntyzrsks.supabase.co` | Copiar de `.env` local (variable `VITE_SUPABASE_URL`) | `env.VITE_SUPABASE_URL` (dev server Vite) + alias `env.SUPABASE_URL` (leído por `ensure-test-user.ts`) | Sí |
| 4 | `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key. Formato nuevo: `sb_publishable_...` o JWT `eyJ...`. Valor actual: `sb_publishable_vIOR3LUJMfYCqd9o8NFiDA_6Yi7AYqp` | Copiar de `.env` local | `env.VITE_SUPABASE_PUBLISHABLE_KEY` (cliente Supabase del navegador durante Playwright) + alias `env.SUPABASE_PUBLISHABLE_KEY` | Sí |
| 5 | `VITE_SUPABASE_PROJECT_ID` | Project ref (subdominio sin `https://` ni `.supabase.co`). Valor actual: `gjtjejluwrjnntyzrsks` | Copiar de `.env` local | `env.VITE_SUPABASE_PROJECT_ID` + alias `env.SUPABASE_PROJECT_ID` (referencia informativa; usada por el cliente generado) | Sí |
| 6 | `SUPABASE_SERVICE_ROLE_KEY` | Service role key del backend. Formato JWT `eyJ...` o `sb_secret_...`. **Nunca** commitearla ni exponerla al cliente | Solicitar rotación al owner del proyecto (no disponible en el dashboard de Lovable Cloud); en proyectos Supabase directos, Settings → API → `service_role` | `env.SUPABASE_SERVICE_ROLE_KEY` — usado **solo** por el paso `Ensure test user` (Admin API). No se pasa al dev server ni al navegador | Sí |

> Total: **6 secretos**. Sin cualquiera de ellos, el paso `Guard — required secrets present` aborta el job con `::error::Missing required secrets: …` antes de gastar minutos de runner.

### 1.2 Mapping secreto → variable de entorno en el workflow

Extraído de `.github/workflows/e2e-wardrobe-ai.yml` (bloque `env:` del job `wardrobe-ai-flow`):

```yaml
env:
  AI_DETECTION_MOCK: "1"                                          # literal, no secreto
  TEST_EMAIL: ${{ secrets.TEST_EMAIL }}
  TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
  VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
  VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
  VITE_SUPABASE_PROJECT_ID: ${{ secrets.VITE_SUPABASE_PROJECT_ID }}
  SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}                  # alias server-side
  SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
  SUPABASE_PROJECT_ID: ${{ secrets.VITE_SUPABASE_PROJECT_ID }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

Los alias sin prefijo `VITE_` existen porque el runtime server (server functions + `scripts/ensure-test-user.ts`) lee `process.env.SUPABASE_*`, mientras que Vite sólo expone al navegador las que empiezan por `VITE_`.

### 1.3 Consumo por paso del workflow

| Paso del workflow | Secretos que lee | Motivo |
|---|---|---|
| `Guard — required secrets present` | `TEST_EMAIL`, `TEST_PASSWORD`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Aborta pronto si falta alguno |
| `Install JS deps` / `Install Playwright + Chromium` | — | Sólo instalación |
| `Ensure test user` (`bun run scripts/ensure-test-user.ts`) | `SUPABASE_URL` (alias de `VITE_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `TEST_EMAIL`, `TEST_PASSWORD` | Crea/actualiza el usuario de test vía Admin API |
| `Start dev server` (`bun run dev`) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (embebidas en el bundle cliente) | Vite necesita las `VITE_*` para inicializar el cliente del navegador |
| `Run E2E — wardrobe AI flow` (`python tests/e2e/wardrobe-ai-flow.spec.py`) | `TEST_EMAIL`, `TEST_PASSWORD` | Playwright los lee vía `os.environ[...]` para hacer login |
| `Upload screenshots + vite log on failure` | — | Sólo artefactos |

### 1.4 Reglas de higiene

- **Nunca** hacer `echo`, `env` o `printenv` de estos valores en el workflow.
- El script `ensure-test-user.ts` sólo imprime el `user.id`, nunca el password.
- Si algún secreto se rota (típicamente `SUPABASE_SERVICE_ROLE_KEY` tras publicación), actualizarlo en GitHub **antes** del siguiente run.
- Rotar `TEST_PASSWORD` no requiere cambiar nada más: el próximo run reescribe el password del usuario.



## 2. Provisión automática del usuario de test

El workflow ejecuta `bun run scripts/ensure-test-user.ts` como paso previo a Playwright. El script:

1. Busca el usuario por `TEST_EMAIL` vía Admin API (paginado).
2. Si existe → actualiza su password a `TEST_PASSWORD` y fuerza `email_confirm=true`.
3. Si no existe → lo crea confirmado, con `user_metadata.purpose = "playwright-e2e"`.

Por tanto **no hace falta crear el usuario a mano** una vez configurados los secretos. El trigger `handle_new_user` genera el `profile` y el `wardrobe` por defecto en el primer alta.

Para ejecutarlo en local:

```bash
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TEST_EMAIL=... TEST_PASSWORD=...
bun run scripts/ensure-test-user.ts
```

> El endpoint legacy `/api/public/seed-e2e` queda obsoleto para CI; considerar eliminarlo o rotar el token hardcodeado antes de publicar.



## 3. Aplicar migraciones requeridas en el backend

Antes de ejecutar el E2E, el esquema debe incluir:

- `migrations/phase2_storage.sql`
- `migrations/phase2_wardrobe.sql`
- `migrations/phase3_ai_config.sql`
- `migrations/phase3_background_processed_at.sql`
- `migrations/phase3_background_removal.sql`
- `migrations/phase5_social.sql` (si Fase 9 incluye funcionalidades sociales en el E2E)

**Verificación mínima:** la tabla `public.clothing_items` debe tener la columna `background_removed_storage_path`. El test `wardrobe-ai-flow.spec.py` falla explícitamente si falta.

## 4. Verificar que el dev server arranca en el runner

El workflow hace:

```bash
bun install --frozen-lockfile
python -m pip install --no-cache-dir playwright
python -m playwright install --with-deps chromium
bun run dev
```

Validar manualmente una vez en un entorno limpio:

```bash
bun install --frozen-lockfile
python -m pip install --no-cache-dir playwright
python -m playwright install --with-deps chromium
export AI_DETECTION_MOCK=1
export TEST_EMAIL=tu-test@example.com
export TEST_PASSWORD=...
export VITE_SUPABASE_URL=...
export VITE_SUPABASE_PUBLISHABLE_KEY=...
export VITE_SUPABASE_PROJECT_ID=...
bun run dev &
python tests/e2e/wardrobe-ai-flow.spec.py
```

## 5. Re-activar el workflow

Editar `.github/workflows/e2e-wardrobe-ai.yml` y restaurar el bloque `on`:

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:
```

Eliminar o actualizar el comentario de desactivación temporal.

## 6. Ajustes adicionales recomendados en Fase 9

- **Actualizar `actions/upload-artifact@v4`:** GitHub ya alerta de que Node 20 está deprecado. Si aún hay aviso, actualizar a la versión recomendada por GitHub.
- **Revisar `AI_DETECTION_MOCK`:** el workflow fuerza `AI_DETECTION_MOCK=1` para no gastar créditos. Si se quiere un E2E real del AI Gateway, crear un workflow separado que se ejecute manualmente.
- **Revisar usuario de test:** si la contraseña del usuario de test expira o cambia, actualizar el secreto `TEST_PASSWORD` en GitHub.
- **Eliminar `src/routes/api/public/seed-e2e.ts`:** si no se usa la opción B, borrar este endpoint de utilidad para no dejar un token hardcodeado en el repo.

## 7. Validación final antes de merge

- [ ] Los 5 secretos de GitHub Actions están configurados.
- [ ] El usuario de test existe, está confirmado y tiene `profile` + `wardrobe` por defecto.
- [ ] Las migraciones requeridas están aplicadas en el backend de producción/preview.
- [ ] El workflow se ejecuta manualmente (`workflow_dispatch`) una vez sin errores.
- [ ] Se restauran los triggers `push` y `pull_request` del workflow.
- [ ] Se borra o securiza `src/routes/api/public/seed-e2e.ts` si ya no se necesita.
- [ ] No quedan referencias a `TEST_EMAIL` / `TEST_PASSWORD` en logs ni screenshots.

---

**Contexto:** este workflow fue desactivado durante la Fase 5 porque faltaban los secretos en GitHub y enviaba notificaciones de fallo en cada push/PR. Ver `mem://features/e2e-ci-phase9` para el histórico completo.
