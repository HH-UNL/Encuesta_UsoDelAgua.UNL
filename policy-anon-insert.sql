-- Política RLS para que la web estática pueda insertar respuestas
-- con la anon key, sin poder leer ni modificar nada.
--
-- Ejecutar una sola vez: Supabase → SQL Editor → New query → pegar → Run.

drop policy if exists "anon insert respuestas_hh" on public.respuestas_hh;

create policy "anon insert respuestas_hh"
  on public.respuestas_hh
  for insert
  to anon
  with check (true);

-- Verificación (con la anon key en el cliente solo debe funcionar el INSERT):
--   select * from public.respuestas_hh;            -- debe fallar (42501)
--   insert into public.respuestas_hh ... ;         -- debe funcionar
