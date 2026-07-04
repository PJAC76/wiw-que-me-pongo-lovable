# Fase 5 — Feed público, votos, favoritos y follows

Convierto WIW en algo social sin comentarios: cada usuario puede publicar voluntariamente entradas del registro diario, la comunidad las vota del 0 al 10 y guarda favoritas, y hay perfiles públicos con follow. Todo respeta la regla de privacidad: **nada se hace público sin confirmación explícita**.

## Alcance

1. **Publicar una entrada del diario** al feed público (opt-in, con confirmación).
2. **Feed global** vertical, mobile-first, con paginación por scroll.
3. **Votos 0–10** visibles, un voto por usuario+outfit, editable.
4. **Favoritos** privados.
5. **Follows** entre usuarios (amigos, famosos, influencers — misma tabla).
6. **Perfil público** `/u/$username` con outfits publicados, contadores y botón follow.
7. **Handle público** (`username`) elegido por el usuario, único, editable en ajustes.

Fuera de alcance en esta fase: comentarios, moderación admin (Fase 8), notificaciones push, feeds personalizados por IA (Fase 6 los consumirá).

## Modelo de datos (migración nueva `phase5_social.sql`)

- `profiles` (nueva tabla pública mínima):
  - `id uuid PK → auth.users`, `username citext UNIQUE`, `display_name text`, `bio text`, `avatar_url text`, `created_at`, `updated_at`.
  - Trigger `on auth.users insert` que crea la fila con `username` autogenerado provisional.
  - RLS: `SELECT` público (`TO anon, authenticated`); `UPDATE` solo propietario.
- `public_outfits`:
  - `id uuid PK`, `user_id uuid`, `log_id uuid → outfit_logs (nullable, ON DELETE SET NULL)`, `image_url text NOT NULL`, `image_path text`, `title text`, `occasions text[]`, `item_ids uuid[]` (snapshot, para que borrar prendas no rompa la publicación), `published_at timestamptz default now()`, `is_hidden boolean default false`.
  - RLS: `SELECT` público de las no ocultas + `SELECT` propietario de las suyas; `INSERT/UPDATE/DELETE` solo propietario.
- `outfit_votes`:
  - `PK (public_outfit_id, voter_id)`, `score int CHECK (0..10)`, `created_at`, `updated_at`.
  - RLS: `SELECT` público (para pintar media); `INSERT/UPDATE/DELETE` solo el votante, y no permite votar los propios (`voter_id <> public_outfits.user_id` vía policy con subselect).
- `outfit_favorites`:
  - `PK (public_outfit_id, user_id)`, `created_at`.
  - RLS: solo el propietario (`user_id = auth.uid()`) ve/gestiona sus favoritos.
- `follows`:
  - `PK (follower_id, followee_id)`, `created_at`, `CHECK follower <> followee`.
  - RLS: `SELECT` público (para contadores y listas); `INSERT/DELETE` solo el follower.
- **Vista `public_outfit_stats`** (o columnas calculadas al vuelo) con `avg_score`, `votes_count`, `favorites_count` para el feed sin N+1.
- Todas las tablas: `GRANT` explícitos siguiendo la regla (SELECT a `anon` solo en las públicas; nada de anon en favoritos).
- **Storage**: nuevo bucket público `public-outfits` para las imágenes publicadas (copia desde `wardrobe-images` privado al publicar), o mantener `wardrobe-images` y exponer URL firmada de larga duración renovable. Elijo **bucket público** `public-outfits` para simplicidad y cacheo CDN.

## Server functions (`src/lib/social.functions.ts`)

Todas con `requireSupabaseAuth` salvo las lecturas anónimas:

- `publishOutfitLogFn({ logId, title? })` → copia imagen del log al bucket público, crea `public_outfits`, devuelve el registro.
- `unpublishOutfitFn({ id })`
- `voteOutfitFn({ id, score })` (upsert) — rechaza autovoto.
- `removeVoteFn({ id })`
- `favoriteOutfitFn({ id })` / `unfavoriteOutfitFn({ id })`
- `followUserFn({ userId })` / `unfollowUserFn({ userId })`
- `setUsernameFn({ username })` con validación regex `[a-z0-9_]{3,20}` y unicidad.

Lecturas públicas (server publishable client, sin bearer):
- `listFeedFn({ cursor?, limit=20 })` → outfits + stats + author profile.
- `getPublicOutfitFn({ id })`.
- `getPublicProfileFn({ username })` + `listUserPublicOutfitsFn({ username, cursor? })`.

## Cliente y pantallas

- **`/_authenticated/feed`** (ya existe como placeholder): feed vertical, tarjeta grande con imagen, autor, ocasiones, media de votos, contador, botones **votar** (slider 0–10 con confirmación tap), **favorito**, **ver perfil**. Infinite scroll con TanStack Query `useInfiniteQuery`.
- **`/u/$username`** (ruta **pública**, SSR on, con `head()` OG dinámico usando la primera imagen): avatar, bio, follow count, grid de outfits públicos. Si el visitante no está autenticado, botones muestran "Inicia sesión para X".
- **`/outfit/$id`** (ruta **pública**, SSR on, con OG dinámico): detalle de un outfit publicado — imagen grande, autor, media, votos, botón votar/favorito/compartir.
- **`/_authenticated/favorites`** nueva ruta accesible desde perfil.
- **`/_authenticated/outfits`**: en cada entrada del log añado botón **"Publicar en el feed"** con `AlertDialog` de confirmación explícita ("Será visible públicamente en el feed y votable del 0 al 10"). Si ya está publicada, muestra "Publicado" + acción "Quitar del feed".
- **`/_authenticated/profile`** (aún placeholder): lo mínimo para esta fase — mostrar handle `@username`, editar handle/bio/avatar, enlace a "Ver mi perfil público" y a "Favoritos". El resto (plan, analíticas, ajustes) sigue en Fases 7/8.
- Actualizar bottom tab bar: el icono Feed pasa a ruta funcional; añadir badge "público" si aplica.

## Componentes nuevos

- `PublicOutfitCard` (feed + perfil)
- `VoteControl` (slider 0–10 con feedback háptico visual)
- `FavoriteButton`, `FollowButton` (optimistas con TanStack Query)
- `PublishOutfitDialog` (confirmación explícita + selección de título opcional)
- `UsernameField` (validación en vivo, disponibilidad)

## SEO / OG

- `/u/$username` y `/outfit/$id` son públicos y compartibles: `head()` con `title`, `description`, `og:image` (imagen del outfit / avatar), `og:type=profile` o `article`, `twitter:card=summary_large_image`, JSON-LD `Person` / `CreativeWork`. Loader alimenta head con datos reales.

## Seguridad

- Publicar copia la imagen al bucket público — el original privado no queda expuesto.
- Autovoto bloqueado en policy y en UI.
- Handle único con índice `citext`, validación server-side.
- `is_hidden` deja preparado el borrado suave para moderación admin (Fase 8) sin cambiar esquema después.
- Scan de seguridad al final de la fase.

## Entrega por sub-pasos (para poder validar sin bloquear)

1. Migración `phase5_social.sql` + bucket `public-outfits` + tipos regenerados.
2. Server functions y helpers `src/lib/social.ts`.
3. Handle público + edición mínima en `/profile`.
4. Publicar/despublicar desde `/outfits` con confirmación.
5. Feed funcional `/feed` con votos y favoritos.
6. Perfil público `/u/$username` + detalle `/outfit/$id` con SEO.
7. Follows + lista de favoritos.
8. Verificación E2E (Playwright): publicar → votar desde otro usuario → aparece en feed → favorito → follow → perfil público accesible sin sesión.

## Detalles técnicos clave

- Todas las mutaciones sociales pasan por `createServerFn` + `requireSupabaseAuth`; lecturas públicas usan el server publishable client con policies `TO anon`.
- `useInfiniteQuery` con cursor por `published_at` (keyset), no `offset`.
- Vote optimista: `onMutate` actualiza cache local, `onError` revierte.
- Imagen pública: al publicar, `supabase.storage.from('wardrobe-images').download()` → `upload()` a `public-outfits/{user_id}/{uuid}.jpg`; guardamos `image_url` público directo.
- Un solo `head()` con `og:image` por ruta (nunca en `__root`).

¿Arranco por el sub-paso 1 (migración + bucket + tipos) o prefieres que empiece por otro orden?
