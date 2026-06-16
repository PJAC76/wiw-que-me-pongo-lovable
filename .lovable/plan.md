# Plan de implementación — WIW / What I Wear

App mobile-first de armario virtual inteligente, estética Quiet Luxury, ES/EN, mercado España/Europa. Stack: React + TS + Vite + Tailwind + shadcn + TanStack Start + Lovable Cloud (Supabase) + IA (Ollama) + APIs externas (clima, remoción de fondo).

Construyo por fases, validando cada módulo antes de pasar al siguiente. El orden sigue el PRD: primero frontend con datos mock, luego backend real, luego integraciones IA/externas.

---

## Fase 0 — Fundaciones (UI base, tema, navegación)

- Sistema de diseño Quiet Luxury en `src/styles.css`: paleta neutra premium (off-white, beige, negro suave), tipografía editorial (display serif + sans neutra), radios, sombras suaves, tokens semánticos.
- Layout mobile-first con bottom tab bar (Armario, Outfits, Feed, Recomendaciones, Perfil) y top bar contextual.
- i18n ES/EN (react-i18next) con selector y detección.
- Rutas TanStack (todas con `head()` propio):
  - `/` landing/redirect, `/auth/*`, `/onboarding`, `/_authenticated/*` (wardrobe, item/$id, add, outfits, outfit/$id, daily-log, feed, profile/$username, settings, premium, recommendations).
- Estados vacíos, skeletons, toasts y componentes base (Card prenda, Card outfit, FeedItem, Filtros).

## Fase 1 — Auth y Onboarding

- Lovable Cloud activado. Email/password + OAuth (Google/Apple preparado).
- Tabla `profiles` con trigger al crear usuario, `user_roles` (admin/user) con `has_role()` security definer.
- Pantallas: registro/login, recuperar contraseña, onboarding (idioma, país, estilo preferido, tallas, crear primer armario).
- RLS estricta en todas las tablas: cada usuario solo ve lo suyo salvo contenido público.

## Fase 2 — Mi Armario (CRUD prendas, manual)

- Esquema: `wardrobes`, `clothing_items`, `clothing_item_shares` con RLS + GRANTS.
- Storage bucket `wardrobe-images` (privado por defecto, signed URLs).
- Pantalla "Mi Armario": grid de prendas, filtros (categoría, color, temporada, ocasión, marca, uso), búsqueda, contadores más/menos usadas.
- Añadir prenda manual: formulario completo (categoría, subcategoría, color, marca, temporada, ocasión, precio, fecha compra, tallas, etiquetas).
- Detalle de prenda: imagen grande, datos, historial de uso, outfits en los que aparece, acciones (editar, eliminar, compartir, marcar usada).

## Fase 3 — Carga avanzada de prendas

- Carga por lote: múltiples imágenes, edición en cola, autocompletado de campos.
- Escaneo por video: grabación/upload, extracción de frames, IA detecta candidatos, usuario confirma/edita/descarta cada uno.
- Integración API configurable de remoción de fondo (guardar `image_url` y `background_removed_image_url`).
- Hash de similitud (`similarity_hash`) para detección de duplicados al añadir.

## Fase 4 — Outfits y Registro Diario

- Esquemas: `outfits`, `outfit_items` (pivot), `daily_outfit_logs`.
- Crear outfit: drag/tap prendas, título, ocasión, vibe, foto opcional.
- Registro diario: foto del look, etiqueta de destino, evento, nota 0–10, prendas usadas (auto-incrementa `times_worn` / `last_worn_at`).
- Historial de outfits: timeline + calendario, filtros.

## Fase 5 — Feed público, votos y favoritos

- Esquemas: votos (0–10, visibles, sin comentarios), `favorites`, follows (amigos/famosos/influencers).
- Publicar outfit voluntariamente con confirmación explícita ("será visible en feed público y votable").
- Feed vertical global, perfil público (`/profile/$username`), votar, guardar en favoritos, seguir.
- Sin comentarios en MVP.

## Fase 6 — IA: Recomendaciones y aprendizaje

- Proveedor IA configurable basado en Ollama (edge function / server fn con secret).
- API externa de clima configurable (geo del usuario, current + forecast).
- Endpoint recomendaciones: contexto = prendas disponibles + historial + notas + favoritos + votos sociales + clima + evento → 1..N propuestas con explicación.
- Tabla `ai_recommendations` con feedback del usuario.
- Aprendizaje progresivo: notas, favoritos y votos alimentan el contexto; señalización de prendas olvidadas.
- Detección de prendas similares dentro del armario (hash + embeddings cuando disponibles).

## Fase 7 — Analíticas del armario

- `wardrobe_analytics` (materializado o calculado on-demand): total prendas/outfits, más/menos usadas, coste por uso, valor estimado, duplicados, infrautilizadas.
- Pantalla de analíticas con gráficos sobrios (Recharts) y recomendaciones de limpieza.

## Fase 8 — Premium, Ajustes, Admin, Preparaciones futuras

- Pantalla Plan Premium (visual, sin Stripe activo; flag `plan`/`subscription_status` en perfil).
- Ajustes: idioma, país, privacidad, notificaciones (placeholder), exportar datos, eliminar cuenta.
- Admin mínimo: cambio manual de plan/rol, moderación básica de outfits públicos (gated por `has_role('admin')`).
- Preparación (no activar): Stripe, push notifications, import e-commerce/email.

## Fase 9 — Pulido, SEO y publicación

- Meta tags por ruta, OG/Twitter en perfiles y outfits públicos, sitemap, JSON-LD.
- Auditoría de accesibilidad y rendimiento, lazy loading de imágenes, revisión Quiet Luxury en cada pantalla contra los diseños adjuntos.
- QA de RLS, scan de seguridad, publicación.

---

## Detalles técnicos clave

- **Privacidad**: armario privado por defecto; visibilidad granular por prenda/outfit (`private`, `shared_with_friends`, `public`); RLS en todas las tablas.
- **Roles**: `user_roles` separada con `app_role` enum + `has_role()` SECURITY DEFINER (nunca rol en `profiles`).
- **Storage**: imágenes privadas con signed URLs; los outfits públicos exponen URL pública solo tras publicación explícita.
- **IA y APIs externas**: claves en secrets de Lovable Cloud; llamadas siempre desde server functions, nunca desde el cliente.
- **Sin pagos reales en MVP**; sin comentarios; sin marketplace; sin estilista humano; sin publicación automática de fotos diarias.
- **Diseños**: respeto estricto de las 12 pantallas adjuntas (`onboarding`, `registro_login`, `mi_armario`, `detalle_de_prenda`, `a_adir_prenda_escaneo`, `registro_de_outfit`, `historial_de_outfits`, `recomendaciones_ia`, `perfil`, `ajustes`, `plan_premium`, `aura_of_silence`) — no se inventan pantallas fuera del PRD.

## Entregables por fase

Cada fase termina con: pantallas funcionales mostradas en el preview, migraciones SQL aplicadas con GRANTS+RLS, server functions tipadas, y verificación visual contra los diseños. Avanzamos solo cuando confirmes que la fase está OK.

¿Empezamos por la **Fase 0 (fundaciones de diseño + navegación)** o prefieres que arranque directamente con **Fase 1 (Auth + Onboarding)** activando Lovable Cloud?
