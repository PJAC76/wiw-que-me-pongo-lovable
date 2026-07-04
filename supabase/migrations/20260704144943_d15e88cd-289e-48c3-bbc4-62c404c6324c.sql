
-- Fijar search_path en set_updated_at (elimina WARN 0011)
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin new.updated_at = now(); return new; end $$;

-- Revocar EXECUTE en funciones SECURITY DEFINER expuestas por PostgREST
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_user_wardrobe() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
-- has_role sí debe poder invocarla el usuario autenticado (se usa en policies con auth.uid())
-- pero las políticas la llaman como SECURITY DEFINER; revocamos anon/public y dejamos authenticated
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
