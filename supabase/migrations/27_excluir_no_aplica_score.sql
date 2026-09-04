-- ============================================================================
--  MIGRACIÓN 25 — Excluir 'no_aplica' del cálculo de scoring
-- ----------------------------------------------------------------------------
--  Cuando una norma condicional se determina como "no aplica" al cliente, su
--  respuesta se registra con estatus 'no_aplica'. Esta norma NO debe entrar en
--  el score: ni en el numerador (riesgo) ni en el denominador (conteo). Es como
--  si no existiera para ese cliente.
--
--  Se agrega el filtro 'where r.estatus <> no_aplica' a la vista v_riesgo_norma,
--  que alimenta todo el scoring. Recrea la vista con toda su lógica vigente
--  (multas, prob_fiscalizacion, gatilla_critico con parcial, tema) + el filtro.
--
--  Requiere las migraciones 22 (enum no_aplica) y las previas de la vista.
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
  (n.es_descalificante and r.estatus in ('no_cumple', 'parcial')) as gatilla_critico,
  n.multa_min,
  n.multa_max,
  n.multa_unidad,
  n.multa_nota,
  n.prob_fiscalizacion,
  n.tema
from respuestas r
join normas n           on n.id = r.norma_id
join evaluaciones e     on e.id = r.evaluacion_id
join clientes c         on c.id = e.cliente_id
join v_riesgo_base_compartido b
     on b.norma_id = r.norma_id and b.sector_id = c.sector_id
-- ▼ Excluir las normas que el cliente determinó que NO le aplican ▼
where r.estatus <> 'no_aplica';

grant select on v_riesgo_norma to service_role;