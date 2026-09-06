-- ============================================================================
--  MIGRACIÓN 31 — Haircut de confianza: un "cumple" sin verificar carga riesgo
-- ----------------------------------------------------------------------------
--  El score es riesgo REGULATORIO. Confiar ciegamente en un dato autoreportado
--  es riesgoso: existe la probabilidad de que la afirmación no se sostenga ante
--  una revisión. Hasta ahora el modelo era asimétrico: castigaba fuerte lo
--  'desconocido' (factor_incumplimiento = 0.75) pero se creía un 'cumple' sin
--  evidencia al 100% (0.00) → un cliente todo-cumple daba score 0.000 aunque
--  solo una fracción estuviera verificada.
--
--  Se introduce `incumplimiento_efectivo`: factor_incumplimiento + un castigo
--  LEVE cuando el dato es autoreportado. El castigo escala con
--  (1 - factor_incumplimiento) → es un haircut sobre el "beneficio de la duda":
--  completo en 'cumple', a la mitad en 'parcial', mínimo en 'desconocido', nulo
--  en 'no_cumple' (ahí no hay buena noticia que descontar).
--
--  ALCANCE: `incumplimiento_efectivo` alimenta SOLO riesgo_credito /
--  riesgo_reputacion (el score). `factor_incumplimiento` se conserva intacto en
--  la vista y lo siguen usando la multa esperada, la exposición y el simulador
--  financiero, que miden consecuencia del incumplimiento REAL, no confianza.
--
--  k = 0.12 (constante única abajo, editable). Con k=0.12 un cliente todo-cumple
--  totalmente autoreportado queda en banda Bajo (score ~0.15-0.35), y uno
--  todo-cumple totalmente verificado sigue en 0.000.
--
--  Recrea v_riesgo_norma sobre la definición vigente (migración 27) + la vista
--  gana una columna nueva `incumplimiento_efectivo` AL FINAL (create or replace
--  view solo permite agregar columnas al final, no intercalarlas). Aditiva, no
--  rompe consumidores. Requiere las migraciones previas de la vista.
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
  ie.incumplimiento_efectivo           -- factor_incumplimiento + haircut de confianza (SOLO score); columna nueva al final
from respuestas r
join normas n           on n.id = r.norma_id
join evaluaciones e     on e.id = r.evaluacion_id
join clientes c         on c.id = e.cliente_id
join v_riesgo_base_compartido b
     on b.norma_id = r.norma_id and b.sector_id = c.sector_id
-- Haircut de confianza: k · (1 - factor_incumplimiento) si el dato es
-- autoreportado, tope 1.0. k editable acá.
cross join lateral (
  select least(
    1.0,
    r.factor_incumplimiento
    + case when r.nivel_confianza = 'autoreportado'
           then 0.12 * (1 - r.factor_incumplimiento)
           else 0 end
  ) as incumplimiento_efectivo
) ie
-- ▼ Excluir las normas que el cliente determinó que NO le aplican ▼
where r.estatus <> 'no_aplica';

grant select on v_riesgo_norma to service_role;
