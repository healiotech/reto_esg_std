-- ============================================================================
--  MIGRACIÓN 08 — Habilita el cálculo de exposición financiera esperada
-- ----------------------------------------------------------------------------
--  La exposición se calcula en la edge function 'evaluar' (capa aislada,
--  reutiliza el motor determinista). Para calcularla, la función necesita
--  'prob_fiscalizacion' por norma, que la vista v_riesgo_norma todavía no
--  exponía. Esta migración solo agrega esa columna a la vista.
--
--  El cálculo NO vive en SQL: vive en exposicion.ts (probado con tests) e
--  invocado por evaluar/index.ts. La exposición se persiste dentro de
--  'resultado' junto al score, congelada para reproducibilidad.
--
--  Recordatorio de diseño: la exposición es capa COMPLEMENTARIA, se reporta
--  como rango (min–max) y etiquetada como estimación. Las descalificantes de
--  sanción categórica (PCT_INGRESOS) NO se suman — se listan aparte.
-- ============================================================================

create or replace view v_riesgo_norma as
select
  r.evaluacion_id,
  r.norma_id,
  n.clave              as norma_clave,
  n.titulo             as norma_titulo,
  n.categoria,
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
  (n.es_descalificante and r.estatus = 'no_cumple') as gatilla_critico,
  n.multa_min,
  n.multa_max,
  n.multa_unidad,
  n.multa_nota,
  -- ▼ nueva: la exposición la necesita para modular por probabilidad real ▼
  n.prob_fiscalizacion
from respuestas r
join normas n           on n.id = r.norma_id
join evaluaciones e     on e.id = r.evaluacion_id
join clientes c         on c.id = e.cliente_id
join v_riesgo_base_compartido b
     on b.norma_id = r.norma_id and b.sector_id = c.sector_id;

grant select on v_riesgo_norma to service_role;