-- ============================================================================
--  MIGRACIÓN 24 — normas_aplicables con filtro de aplicabilidad completo
-- ----------------------------------------------------------------------------
--  Extiende la función para:
--   · Recibir el perfil de tamaño del cliente.
--   · Filtrar las normas 'condicional_perfil' (LMV, ECUADOR): solo aparecen si
--     el perfil_tamano del cliente coincide con normas.perfil_aplicable. Una PyME
--     NO ve LMV ni ECUADOR — no se le pregunta, simplemente no aplican.
--   · Devolver tipo_aplicabilidad y pregunta_aplicabilidad, para que el frontend
--     sepa cuáles normas requieren la pregunta '¿aplica?' (condicional_actividad).
--
--  Las 'condicional_actividad' SÍ aparecen (se pregunta ¿aplica? en el cuestionario);
--  las 'directa' siempre aparecen; las 'condicional_perfil' se filtran aquí.
--  Requiere migraciones 22 (enum no_aplica) y 23 (campos) corridas antes.
-- ============================================================================

drop function if exists normas_aplicables(uuid, uuid, boolean);
create or replace function normas_aplicables(
  p_sector_id uuid,
  p_jurisdiccion_id uuid,
  p_es_exportador boolean default false,
  p_perfil_tamano text default 'pyme'
)
returns table (
  norma_id               uuid,
  norma_clave            text,
  norma_titulo           text,
  categoria              categoria_norma,
  pregunta_evaluacion    text,
  jurisdiccion           text,
  jurisdiccion_nivel     text,
  tipo_aplicabilidad     text,
  pregunta_aplicabilidad text
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.clave, n.titulo, n.categoria, n.pregunta_evaluacion,
         j.clave, j.nivel,
         n.tipo_aplicabilidad::text, n.pregunta_aplicabilidad
  from norma_sector ns
  join normas n         on n.id = ns.norma_id and n.vigente = true
  join jurisdicciones j on j.id = n.jurisdiccion_id
  where ns.sector_id = p_sector_id
    and ns.aplica = true
    -- Capas jurisdiccionales (internacional condicionado por exportación).
    and (
      (j.nivel = 'internacional' and (n.solo_si_exporta = false or p_es_exportador = true))
      or j.nivel = 'federal'
      or (j.nivel = 'estatal' and n.jurisdiccion_id = p_jurisdiccion_id)
    )
    -- Filtro condicional_perfil: si la norma aplica solo a cierto tamaño,
    -- incluirla únicamente cuando el perfil del cliente coincide.
    and (
      n.tipo_aplicabilidad <> 'condicional_perfil'
      or n.perfil_aplicable = p_perfil_tamano
    )
  order by
    case j.nivel when 'internacional' then 1 when 'federal' then 2 else 3 end,
    n.categoria, n.clave;
$$;

grant execute on function normas_aplicables(uuid, uuid, boolean, text) to anon, authenticated, service_role;