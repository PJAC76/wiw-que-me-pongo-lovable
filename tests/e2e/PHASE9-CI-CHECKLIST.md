# Checklist Fase 9 — Preparar CI E2E antes de re-activar el workflow

> Archivo vinculado a `.github/workflows/e2e-wardrobe-ai.yml` (actualmente desactivado).
> Tarea: re-activar CI en Fase 9 · migrar a producción.

## 1. Secretos de GitHub Actions

Añadir en **Settings → Secrets and variables → Actions** del repo `PJAC76/wiw-que-me-pongo-lovable`:

| Secreto | Origen / Valor esperado | Obligatorio |
|---|---|---|
| `TEST_EMAIL` | Email del usuario de test en Supabase Auth | Sí |
| `TEST_PASSWORD` | Contraseña del usuario de test | Sí |
| `VITE_SUPABASE_URL` | Misma URL que en `.env` (`https://…supabase.co`) | Sí |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Misma `anon` / `publishable` key que en `.env` | Sí |
| `VITE_SUPABASE_PROJECT_ID` | ID del proyecto (ej. `gjtjejluwrjnntyzrsks`) | Sí |

> **Nota:** `WIW_SERVICE_ROLE_KEY` ya existe como runtime secret en Lovable Cloud. Si el workflow necesitara crear/eliminar el usuario de test automáticamente, se debería añadir también como `SUPABASE_SERVICE_ROLE_KEY` en GitHub Actions (ver paso 3).

## 2. Crear el usuario de test en Supabase Auth

El workflow espera un usuario existente y confirmado. Opciones:

### Opción A — Manual (recomendada si no se quiere exponer service_role en CI)

1. Ir a la consola de autenticación del backend (Lovable Cloud → Auth).
2. Crear un usuario con:
   - Email: el mismo valor que se usará en `TEST_EMAIL`.
   - Contraseña: el mismo valor que se usará en `TEST_PASSWORD`.
   - Confirmar email manualmente.
3. Asegurar que el usuario tiene un `profile` generado (trigger `handle_new_user` ya lo hace al crear la cuenta).

### Opción B — Automática vía endpoint `/api/public/seed-e2e`

Si se prefiere crear el usuario dinámicamente antes de cada run, se necesita:

- Añadir `SUPABASE_SERVICE_ROLE_KEY` a los secretos de GitHub.
- Hacer una llamada `POST` al endpoint con el token `x-seed-token` correcto.
- **Riesgo:** el endpoint actual (`src/routes/api/public/seed-e2e.ts`) tiene un token hardcodeado; rotarlo antes de usarlo en CI o eliminar el archivo tras uso.

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
