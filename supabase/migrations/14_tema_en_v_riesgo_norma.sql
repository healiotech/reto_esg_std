-- ============================================================================
--  MIGRACIÓN 14 — Expone normas.tema en v_riesgo_norma
-- ----------------------------------------------------------------------------
--  El bloque "Dimensiones materiales en riesgo" (Resultados.tsx) cruza el
--  tema de cada norma con coef_materialidad_tema para mostrar solo las
--  dimensiones ESG donde el cliente realmente incumple algo material. Hasta
--  ahora v_riesgo_norma solo exponía `categoria` (más gruesa: ambiental/
--  social/jurisdiccional_documental) — no `tema` (agua, uso_suelo, sanidad…).
--
--  Puro pass-through: agrega n.tema a la selección, sin tocar ningún cálculo
--  de riesgo_credito/riesgo_reputacion, gatilla_critico, ni la lógica de
--  descalificantes. Copia exacta de la vista de 09_descalificante_parcial.sql
--  + la columna nueva.
-- ============================================================================

create or replace view v_riesgo_norma as
select
  r.evaluacion_id,
  r.norma_id,
  n.clave              as norma_clave,
  n.titulo             as norma_titulo,
  n.categoria,
  n.tema,
  n.fuente,
  n.fuente_url,
  r.estatus,
  r.factor_incumplimiento,
  r.nivel_confianza,
  n.es_descalificante,
  b.riesgo_base_compartido,
  round(b.riesgo_base_compartido
        * (n.prob_fiscalizacion / 5.0)
        * r.factor_incumplimiento
        * n.peso_crediticio, 4) as riesgo_credito,
  n.peso_crediticio,
  round(b.riesgo_base_compartido
        * r.factor_incumplimiento
        * n.peso_reputacional, 4) as riesgo_reputacion,
  n.peso_reputacional,
  (n.es_descalificante and r.estatus in ('no_cumple', 'parcial')) as gatilla_critico,
  n.multa_min,
  n.multa_max,
  n.multa_unidad,
  n.multa_nota,
  n.prob_fiscalizacion
from respuestas r
join normas n           on n.id = r.norma_id
join evaluaciones e     on e.id = r.evaluacion_id
join clientes c         on c.id = e.cliente_id
join v_riesgo_base_compartido b
     on b.norma_id = r.norma_id and b.sector_id = c.sector_id;

grant select on v_riesgo_norma to service_role;
