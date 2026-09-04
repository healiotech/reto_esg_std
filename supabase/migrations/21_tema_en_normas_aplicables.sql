-- ============================================================================
--  MIGRACIÓN 21 — Expone normas.tema en el RPC normas_aplicables
-- ----------------------------------------------------------------------------
--  El cuestionario (Cuestionario.tsx) ahora muestra una etiqueta de tema ESG
--  por norma (agua, uso_suelo, sanidad…). El RPC normas_aplicables — la última
--  versión vive en 11_ubicacion_y_capas.sql — no devuelve `tema`. Esta
--  migración recrea la función IDÉNTICA salvo por la columna nueva: agrega
--  `tema` a la tabla de retorno y `n.tema` al select. No toca el filtro de las
--  3 capas, el orden, la firma ni los grants.
-- ============================================================================

drop function if exists normas_aplicables(uuid, uuid, boolean);

create or replace function normas_aplicables(
  p_sector_id uuid,
  p_jurisdiccion_id uuid,
  p_es_exportador boolean default false
)
returns table (
  norma_id            uuid,
  norma_clave         text,
  norma_titulo        text,
  categoria           categoria_norma,
  tema                tema_esg,
  pregunta_evaluacion text,
  jurisdiccion        text,
  jurisdiccion_nivel  text
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.clave, n.titulo, n.categoria, n.tema, n.pregunta_evaluacion,
         j.clave, j.nivel
  from norma_sector ns
  join normas n         on n.id = ns.norma_id and n.vigente = true
  join jurisdicciones j on j.id = n.jurisdiccion_id
  where ns.sector_id = p_sector_id
    and ns.aplica = true
    and (
      (j.nivel = 'internacional' and (n.solo_si_exporta = false or p_es_exportador = true))
      or j.nivel = 'federal'
      or (j.nivel = 'estatal' and n.jurisdiccion_id = p_jurisdiccion_id)
    )
  order by
    case j.nivel when 'internacional' then 1 when 'federal' then 2 else 3 end,
    n.categoria, n.clave;
$$;

grant execute on function normas_aplicables(uuid, uuid, boolean) to anon, authenticated, service_role;
