# E2E tests

Suite Playwright que valida los flujos críticos contra el dev server local
(`http://localhost:8080`) y el backend real del proyecto.

## Proyecto objetivo

Todos los tests apuntan **obligatoriamente** al proyecto Lovable Cloud / Supabase:

- **Project ref:** `gjtjejluwrjnntyzrsks`
- **Project URL:** `https://gjtjejluwrjnntyzrsks.supabase.co`
- **Publishable key:** `sb_publishable_vIOR3LUJMfYCqd9o8NFiDA_6Yi7AYqp`

> ⚠️ Nunca mezclar keys de otros proyectos. Si `VITE_SUPABASE_URL` o `VITE_SUPABASE_PUBLISHABLE_KEY` apuntan a otro project ref, el test puede loguearse contra un usuario inexistente o producir datos en el proyecto equivocado.

## Secretos requeridos por Playwright

Los specs de Playwright leen estas variables de entorno directamente con `os.environ`. Deben estar exportadas en local o configuradas como **repository secrets** en GitHub Actions.

| Variable de entorno | Secret de GitHub | Valor esperado para `gjtjejluwrjnntyzrsks` | Uso en Playwright | Obligatorio |
| --- | --- | --- | --- | --- |
| `TEST_EMAIL` | `TEST_EMAIL` | Email del usuario de prueba existente en Auth (ej. `e2e@wiw-e2e.lovable.app`) | Login en el formulario de auth | Sí |
| `TEST_PASSWORD` | `TEST_PASSWORD` | Contraseña actual del usuario de prueba | Login en el formulario de auth | Sí |
| `VITE_SUPABASE_URL` | `VITE_SUPABASE_URL` | `https://gjtjejluwrjnntyzrsks.supabase.co` | Inicializa el cliente Supabase del navegador durante el dev server | Sí |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_vIOR3LUJMfYCqd9o8NFiDA_6Yi7AYqp` | Inicializa el cliente Supabase del navegador durante el dev server | Sí |
| `VITE_SUPABASE_PROJECT_ID` | `VITE_SUPABASE_PROJECT_ID` | `gjtjejluwrjnntyzrsks` | Referencia del proyecto (cliente generado) | Sí |
| `AI_DETECTION_MOCK` | — (literal) | `1` | Fuerza el modo mock de `detectClothingFn` para no gastar créditos de AI | No, pero recomendado en CI |

### Variables que Playwright NO lee directamente

Estas variables son necesarias para el workflow de CI pero **no** las usa el código Python de los specs:

| Variable / Secret | Propósito | Usado por |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` / `secrets.SUPABASE_SERVICE_ROLE_KEY` | Provisión/actualización del usuario de test vía Admin API (`scripts/ensure-test-user.ts`) | Workflow de CI (actualmente deshabilitado en Fase 5; se reactivará en Fase 9) |
| `LOVABLE_API_KEY` | AI Gateway real | No usado en E2E; el workflow fuerza `AI_DETECTION_MOCK=1` |

## Correspondencia secreto → proyecto

Para evitar cruces de proyecto, valida cada secreto antes de guardarlo en GitHub:

```text
TEST_EMAIL          → usuario existente en Auth de gjtjejluwrjnntyzrsks
TEST_PASSWORD       → contraseña de ese usuario
VITE_SUPABASE_URL   → https://gjtjejluwrjnntyzrsks.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY → sb_publishable_vIOR3LUJMfYCqd9o8NFiDA_6Yi7AYqp
VITE_SUPABASE_PROJECT_ID      → gjtjejluwrjnntyzrsks
SUPABASE_SERVICE_ROLE_KEY     → service_role JWT del proyecto gjtjejluwrjnntyzrsks (solo CI, nunca en el cliente)
```

### Reglas anti-cruce de proyecto

1. **El `project_ref` debe coincidir** en `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID` y en el `iss` del JWT de `SUPABASE_SERVICE_ROLE_KEY`.
2. **No reutilizar keys de otros proyectos**, aunque el formato parezca correcto. Supabase Auth rechazará la key con `401 Invalid API key` si el issuer no coincide.
3. **Verificar la publishable key:** debe empezar por `sb_publishable_vIOR3LUJMfYCqd9o8NFiDA_6Yi7AYqp` para este proyecto.
4. **Pegar los secrets sin comillas ni espacios** en GitHub Actions. Un espacio o salto de línea al final del JWT lo invalida.
5. **Nunca incluir `SUPABASE_SERVICE_ROLE_KEY` en `.env` del frontend ni en el repo.** Es solo para CI/Admin API.

## Verificación rápida de configuración

Antes de lanzar el test, comprueba que las variables apuntan al proyecto correcto:

```bash
# En local o en un step de CI de debug (no imprimas valores secretos en logs públicos)
echo "URL:      $VITE_SUPABASE_URL"
echo "Project:  $VITE_SUPABASE_PROJECT_ID"
echo "Anon key: ${VITE_SUPABASE_PUBLISHABLE_KEY:0:30}..."
```

Debe coincidir:

```text
URL:      https://gjtjejluwrjnntyzrsks.supabase.co
Project:  gjtjejluwrjnntyzrsks
Anon key: sb_publishable_vIOR3LUJMfYCqd9...
```

Para verificar el formato de `SUPABASE_SERVICE_ROLE_KEY` (sin exponerlo):

```bash
node -e "const k=process.env.SUPABASE_SERVICE_ROLE_KEY; console.log('parts:', k.split('.').length, 'length:', k.length);"
# Debe imprimir: parts: 3  length: ~160-220
```

Si `parts` no es `3`, la key no es un JWT válido de Admin API y `scripts/ensure-test-user.ts` fallará.

## Ejecución local

```bash
# 1. Variables obligatorias para Playwright
export TEST_EMAIL=...
export TEST_PASSWORD=...
export VITE_SUPABASE_URL=https://gjtjejluwrjnntyzrsks.supabase.co
export VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_vIOR3LUJMfYCqd9o8NFiDA_6Yi7AYqp
export VITE_SUPABASE_PROJECT_ID=gjtjejluwrjnntyzrsks
export AI_DETECTION_MOCK=1

# 2. Arrancar el dev server
bun run dev &          # http://localhost:8080

# 3. Instalar Playwright (solo la primera vez)
python -m pip install playwright && python -m playwright install chromium

# 4. Lanzar el test
python tests/e2e/wardrobe-ai-flow.spec.py
```

> El flujo de CI puede requerir también `SUPABASE_SERVICE_ROLE_KEY` para el paso `Ensure test user` (ver `tests/e2e/PHASE9-CI-CHECKLIST.md`). En local no es necesario si el usuario de test ya existe.

## Precondición de esquema

`wardrobe-ai-flow.spec.py` **falla explícitamente** si falta la columna
`public.clothing_items.background_removed_storage_path`. Aplica
`migrations/phase3_background_removal.sql` en el Supabase objetivo antes de
lanzar el test.

## Referencias

- Checklist completo para re-activar CI en Fase 9: `tests/e2e/PHASE9-CI-CHECKLIST.md`
- Workflow de CI: `.github/workflows/e2e-wardrobe-ai.yml`
- Script de provisión de usuario: `scripts/ensure-test-user.ts`
