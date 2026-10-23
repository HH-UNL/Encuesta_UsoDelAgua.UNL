-- Vista pública para el dashboard en vivo — encuesta Huella Hídrica UNL
-- Ejecutar una sola vez: Supabase → SQL Editor → New query → pegar → Run.
--
-- Expone SOLO lo que el dashboard ya publica: created_at + las 16 columnas
-- de respuestas. Sin submission_id ni status.
-- La tabla base conserva su RLS de solo INSERT para anon (policy-anon-insert.sql);
-- esta vista se ejecuta con permisos del dueño (postgres) por eso puede leer.

create or replace view public.respuestas_hh_public as
select
  created_at,
  unidad_academica,
  genero,
  vinculo_unl,
  dias_semana,
  horas_dia,
  inodoro_dia,
  mingitorio_dia,
  litros_dispenser,
  infusiones,
  litros_mate,
  tazas_cafe,
  almorza_comedor,
  veces_comedor_semana,
  copias_mes,
  huella_diaria,
  huella_mensual
from public.respuestas_hh;

grant select on public.respuestas_hh_public to anon;

-- Verificación con la anon key:
--   GET {SUPABASE_URL}/rest/v1/respuestas_hh_public?select=*  → 200 con filas
--   GET {SUPABASE_URL}/rest/v1/respuestas_hh?select=*        → 401/403 (tabla base cerrada)
