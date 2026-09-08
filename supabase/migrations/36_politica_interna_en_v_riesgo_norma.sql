-- ============================================================================
--  Expone normas.politica_interna (migración 35) en v_riesgo_norma para que
--  llegue a resultado.detalle sin tocar el motor de score (evaluar/engine.ts
--  hace pass-through de las filas de la vista).
--
--  Recrea la definición vigente (migración 31) y añade `politica_interna` AL
--  FINAL — `create or replace view` solo permite agregar columnas al final.
--  Aditiva: ningún cálculo cambia.
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
        * ie.incumplimiento_efectivo
        * n.peso_crediticio, 4) as riesgo_credito,
  n.peso_crediticio,
  round(b.riesgo_base_compartido
        * ie.incumplimiento_efectivo
        * n.peso_reputacional, 4) as riesgo_reputacion,
  n.peso_reputacional,
  (n.es_descalificante and r.estatus in ('no_cumple', 'parcial')) as gatilla_critico,
  n.multa_min,
  n.multa_max,
  n.multa_unidad,
  n.multa_nota,
  n.prob_fiscalizacion,
  n.tema,
  ie.incumplimiento_efectivo,          -- factor_incumplimiento + haircut de confianza (SOLO score)
  n.politica_interna                   -- política(s) interna(s) de Santander vinculada(s); columna nueva al final
from respuestas r
join normas n           on n.id = r.norma_id
join evaluaciones e     on e.id = r.evaluacion_id
join clientes c         on c.id = e.cliente_id
join v_riesgo_base_compartido b
     on b.norma_id = r.norma_id and b.sector_id = c.sector_id
cross join lateral (
  select least(
    1.0,
    r.factor_incumplimiento
    + case when r.nivel_confianza = 'autoreportado'
           then 0.12 * (1 - r.factor_incumplimiento)
           else 0 end
  ) as incumplimiento_efectivo
) ie
where r.estatus <> 'no_aplica';

grant select on v_riesgo_norma to service_role;
