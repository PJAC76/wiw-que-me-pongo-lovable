# E2E tests

Suite Playwright que valida los flujos críticos contra el dev server local
(`http://localhost:8080`) y el Supabase real del proyecto.

## Secrets requeridos (CI · GitHub Actions)

Configúralos en **Settings → Secrets and variables → Actions** del repo:

| Secret | Valor |
| --- | --- |
| `TEST_EMAIL` | Email del usuario de prueba en Supabase Auth |
| `TEST_PASSWORD` | Contraseña del usuario de prueba |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (mismo que `.env`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key del proyecto |
| `VITE_SUPABASE_PROJECT_ID` | ID del proyecto Supabase |

El workflow inyecta también `AI_DETECTION_MOCK=1` para forzar el modo mock
del server fn `detectClothingFn` — sin gasto de créditos ni dependencia del
AI Gateway real. El procesamiento de fondo corre en modo passthrough (mismo
principio: sin `LOVABLE_API_KEY` devuelve la imagen original bajo `/bg/`).

## Ejecución local

```bash
export TEST_EMAIL=...
export TEST_PASSWORD=...
export AI_DETECTION_MOCK=1
bun run dev &          # http://localhost:8080
python -m pip install playwright && python -m playwright install chromium
python tests/e2e/wardrobe-ai-flow.spec.py
```

## Precondición de esquema

`wardrobe-ai-flow.spec.py` **falla explícitamente** si falta la columna
`public.clothing_items.background_removed_storage_path`. Aplica
`migrations/phase3_background_removal.sql` en el Supabase objetivo antes de
lanzar el test.
