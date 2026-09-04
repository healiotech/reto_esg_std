-- ============================================================================
--  MIGRACIÓN 09 — Descalificante "Parcial" también dispara el override a Crítico
-- ----------------------------------------------------------------------------
--  Una norma descalificante es BINARIA por naturaleza legal: o se cumple el
--  requisito (poder exportar, tener la autorización) o no. "Parcial" en una
--  norma binaria es, lógicamente, un NO-cumplimiento — no alcanzó el umbral.
--
--  Antes: gatilla_critico = es_descalificante AND estatus = 'no_cumple'
--  Ahora: gatilla_critico = es_descalificante AND estatus IN ('no_cumple','parcial')
--
--  'desconocido' se deja FUERA del override a propósito: es ausencia de
--  evidencia, no evidencia de incumplimiento. Ya se penaliza en el score
--  (factor 0.75) y lo cubre el bloqueo de cierre (una descalificante sin
--  verificar no se puede firmar). El override se reserva para incumplimiento
--  confirmado (parcial o total).
--
--  Solo cambia la definición del flag en la vista. El motor (engine.ts) NO se
--  toca: sigue consumiendo gatilla_critico y forzando Crítico igual. Sus tests
--  siguen válidos. La caja de cristal del frontend heredará el flag nuevo.
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
  -- ▼ B: parcial en descalificante también gatilla (antes solo no_cumple) ▼
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