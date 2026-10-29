-- Recálculo de huella_diaria / huella_mensual en public.respuestas_hh
-- Ecuaciones vigentes desde 29/10/2026 (mismas que evalúa la web generada):
--   8  sanitario   = inodoro_dia*6 + mingitorio_dia*0.5
--   54 bebidas     = litros_dispenser + litros_mate*30 + tazas_cafe*140
--   55 papel       = copias_mes * (1/dias_semana) * (1/4) * 10
--   69 comedor     = veces_comedor_semana * (1/dias_semana) * 2151.31
--   huella_diaria  = 55 + 54 + 8 + 69
--   huella_mensual = (8 + 54 + 55) * dias_semana * 4 + veces_comedor_semana * 4 * 2151.31
--
-- Idempotente: se puede re-ejecutar cuantas veces haga falta.
-- Respeta los NULL originales: no rellena filas que no tenían huella calculada.
-- dias_semana vacío o 0 → componentes 55 y 69 = 0 (igual que en el navegador,
-- donde 1/0 es no-finito y el cálculo queda en 0).
--
-- Uso: Supabase → SQL Editor → New query → pegar → Run.
--   (la anon key no puede UPDATE: RLS solo permite INSERT desde la web)

with base as (
  select submission_id,
         huella_diaria  as prev_d,
         huella_mensual as prev_m,
         coalesce(inodoro_dia, 0) * 6 + coalesce(mingitorio_dia, 0) * 0.5 as c8,
         coalesce(litros_dispenser, 0)
           + coalesce(litros_mate, 0) * 30
           + coalesce(tazas_cafe, 0) * 140 as c54,
         case when coalesce(dias_semana, 0) = 0 then 0
              else coalesce(copias_mes, 0) * (1.0 / dias_semana) * (1.0 / 4) * 10
         end as c55,
         case when coalesce(dias_semana, 0) = 0 then 0
              else coalesce(veces_comedor_semana, 0) * (1.0 / dias_semana) * 2151.31
         end as c69,
         coalesce(dias_semana, 0) as dias,
         coalesce(veces_comedor_semana, 0) as veces
  from public.respuestas_hh
),
calc as (
  select submission_id,
         prev_d,
         prev_m,
         round((c55 + c54 + c8 + c69)::numeric, 2) as nueva_d,
         round(((c8 + c54 + c55) * dias * 4 + veces * 4 * 2151.31)::numeric, 2) as nueva_m
  from base
)
update public.respuestas_hh t
set huella_diaria  = case when t.huella_diaria  is null then null else c.nueva_d end,
    huella_mensual = case when t.huella_mensual is null then null else c.nueva_m end
from calc c
where t.submission_id = c.submission_id;

-- Verificación: filas con huella calculada y promedios resultantes
select count(*)                                    as total,
       count(*) filter (where huella_diaria  is not null) as con_diaria,
       count(*) filter (where huella_mensual is not null) as con_mensual,
       round(avg(huella_diaria), 2)                as promedio_diaria,
       round(avg(huella_mensual), 2)               as promedio_mensual
from public.respuestas_hh;
