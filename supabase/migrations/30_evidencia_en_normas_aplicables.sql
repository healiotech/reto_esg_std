-- ============================================================================
--  MIGRACIÓN 30 — Expone `normas.evidencia` en normas_aplicables
-- ----------------------------------------------------------------------------
--  29_columna_evidencia.sql cargó el contenido de la columna `evidencia`
--  (agregada manualmente a `normas`), pero normas_aplicables aún no la
--  devuelve. El cuestionario la muestra como desplegable bajo la pregunta de
--  cumplimiento. Puro pass-through sobre 28_tema_en_normas_aplicables_v2.sql,
--  sin tocar el resto de la lógica.
-- ============================================================================

drop function if exists normas_aplicables(uuid, uuid, boolean, text);

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
  tema                   tema_esg,
  pregunta_evaluacion    text,
  jurisdiccion           text,
  jurisdiccion_nivel     text,
  tipo_aplicabilidad     text,
  pregunta_aplicabilidad text,
  evidencia              text
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.clave, n.titulo, n.categoria, n.tema, n.pregunta_evaluacion,
         j.clave, j.nivel,
         n.tipo_aplicabilidad::text, n.pregunta_aplicabilidad, n.evidencia
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
