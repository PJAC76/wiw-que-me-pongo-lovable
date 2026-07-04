-- Fase 6 (baseline): marcar prendas como usadas hoy desde una sugerencia.
-- Incrementa times_worn y actualiza last_worn_at de forma atómica y sólo
-- sobre prendas propias del usuario autenticado (defensa en profundidad
-- adicional a las políticas RLS existentes).

create or replace function public.mark_items_worn(_item_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.clothing_items
     set times_worn = times_worn + 1,
         last_worn_at = now()
   where id = any(_item_ids)
     and user_id = auth.uid();

  get diagnostics _count = row_count;
  return _count;
end;
$$;

revoke all on function public.mark_items_worn(uuid[]) from public;
grant execute on function public.mark_items_worn(uuid[]) to authenticated;
