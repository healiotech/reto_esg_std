-- ============================================================================
--  MIGRACIÓN 07 — Multa por norma (dato de referencia) + capa de exposición
-- ----------------------------------------------------------------------------
--  Las columnas multa_min / multa_max / multa_unidad / multa_nota ya fueron
--  creadas por ti con ALTER TABLE. Esta migración:
--    1. Siembra valores ILUSTRATIVOS pero verídicos en las normas clave.
--    2. Recrea la vista v_riesgo_norma para exponer la multa en la caja de cristal.
--    3. Deja ESCRITA Y COMENTADA la capa de exposición financiera esperada,
--       lista para activar cuando la Fase 1 tenga montos y probabilidades reales.
--
--  Unidad: las sanciones mexicanas del sector se expresan típicamente en UMA
--  (Unidad de Medida y Actualización), no en pesos fijos — así no envejecen con
--  la inflación. Valor UMA 2026: $117.31 MXN/día (INEGI, DOF 09-ene-2026).
--
--  ⚠️ Los montos sembrados son ILUSTRATIVOS y aproximados, para el demo.
--     Los rangos exactos y su fundamento legal salen de la investigación
--     regulatoria de la Fase 1. No presentar como cifras oficiales definitivas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed de multas (rangos en UMA) en las normas más ilustrativas.
--    El resto queda en NULL a propósito → pendiente de la Fase 1.
-- ----------------------------------------------------------------------------

-- EUDR: no es multa mexicana en UMA, es pérdida de acceso al mercado UE →
-- se modela como nota, no como rango numérico (su "sanción" es no poder exportar).
update normas set
  multa_unidad = 'PCT_INGRESOS',
  multa_nota   = 'Hasta 4% de la facturación anual en la UE + confiscación de producto y prohibición de comercialización (Reglamento UE 2023/1115). La sanción efectiva es la pérdida de acceso al mercado de exportación.'
  where clave = 'EUDR';

-- Cambio de uso de suelo forestal (LGDFS): sanciones altas en UMA.
update normas set
  multa_min = 100, multa_max = 20000, multa_unidad = 'UMA',
  multa_nota = 'Rango sancionatorio amplio según superficie afectada; puede implicar restauración obligatoria del predio. Fundamento: LGDFS.'
  where clave = 'ACUSTF';

-- Concesión de aguas nacionales (Ley de Aguas Nacionales / CONAGUA).
update normas set
  multa_min = 200, multa_max = 25000, multa_unidad = 'UMA',
  multa_nota = 'Sanción por uso/explotación sin título o excediendo volumen concesionado. Fundamento: Ley de Aguas Nacionales.'
  where clave = 'CONCESION_AGUA';

-- Especies en riesgo (NOM-059 / LGVS).
update normas set
  multa_min = 50, multa_max = 50000, multa_unidad = 'UMA',
  multa_nota = 'Afectación a especies listadas; sanción según gravedad, puede escalar con daño a hábitat en zona protegida. Fundamento: LGVS / LGEEPA.'
  where clave = 'NOM059_ESPECIES';

-- Descargas de aguas residuales (NOM-001-SEMARNAT-2021).
update normas set
  multa_min = 50, multa_max = 15000, multa_unidad = 'UMA',
  multa_nota = 'Incumplimiento de límites de contaminantes en descargas. Fundamento: LGEEPA / Ley de Aguas Nacionales.'
  where clave = 'NOM001_DESCARGAS';

-- Condiciones laborales de jornaleros (LFT).
update normas set
  multa_min = 50, multa_max = 5000, multa_unidad = 'UMA',
  multa_nota = 'Multa por trabajador afectado según Ley Federal del Trabajo; se multiplica por número de trabajadores en situación irregular.'
  where clave = 'JORNALEROS_LFT';

-- ----------------------------------------------------------------------------
-- 2. Parámetro global: valor de la UMA vigente (para convertir UMA → MXN).
--    Se guarda como fila de configuración, NO hardcodeado — se actualiza cada
--    año sin tocar datos ni código. (Reusa el patrón de tablas de parámetros.)
-- ----------------------------------------------------------------------------
create table if not exists parametros_financieros (
  clave       text primary key,
  valor       numeric not null,
  unidad      text,
  vigente_desde date,
  fuente      text
);

insert into parametros_financieros (clave, valor, unidad, vigente_desde, fuente)
values ('uma_diaria', 117.31, 'MXN', '2026-02-01',
        'INEGI — DOF 09-ene-2026, vigente desde 01-feb-2026')
on conflict (clave) do update
  set valor = excluded.valor, vigente_desde = excluded.vigente_desde, fuente = excluded.fuente;

-- ----------------------------------------------------------------------------
-- 3. Recrear v_riesgo_norma agregando las columnas de multa AL FINAL.
--    (CREATE OR REPLACE exige no reordenar ni quitar columnas existentes;
--     las nuevas van al final del SELECT.)
-- ----------------------------------------------------------------------------
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
  -- ▼▼▼ nuevas columnas de multa (referencia, no entran al cálculo) ▼▼▼
  n.multa_min,
  n.multa_max,
  n.multa_unidad,
  n.multa_nota
from respuestas r
join normas n           on n.id = r.norma_id
join evaluaciones e     on e.id = r.evaluacion_id
join clientes c         on c.id = e.cliente_id
join v_riesgo_base_compartido b
     on b.norma_id = r.norma_id and b.sector_id = c.sector_id;

grant select on v_riesgo_norma to service_role;

-- ============================================================================
-- 4. CAPA DE EXPOSICIÓN FINANCIERA ESPERADA — ESCRITA PERO INACTIVA
-- ----------------------------------------------------------------------------
--  NO se activa en v1. Se deja documentada para mostrar que la arquitectura
--  está lista para el impacto financiero directo, y para activarla cuando la
--  Fase 1 tenga montos reales y una postura defendible sobre fiscalización.
--
--  Diseño (cuando se active): capa SEPARADA del score de riesgo. El score
--  ordinal (Bajo/Medio/Alto/Crítico) sigue siendo el producto de decisión;
--  la exposición en pesos es un COMPLEMENTO orientativo, etiquetado como
--  estimación — nunca una predicción, para no proyectar falsa precisión.
--
--  Fórmula por norma (reutiliza variables que YA existen — no inventa modelo):
--    exposición_esperada = multa_estimada_MXN
--                          × factor_incumplimiento      (cuánto activa el cliente)
--                          × (prob_fiscalizacion / 5)   (probabilidad de que caiga)
--  donde multa_estimada_MXN = ((multa_min + multa_max)/2) × valor_uma_diaria
--  (para unidad UMA). El punto medio del rango es una simplificación consciente.
--
--  Advertencia de doble conteo (documentar en la PPT): esta exposición mide
--  la pérdida potencial DEL CLIENTE por sanción (afecta su capacidad de pago),
--  NO la exposición crediticia del banco (EAD). Son riesgos distintos; no sumar.
--
--  create or replace view v_exposicion_esperada as
--  with uma as (select valor from parametros_financieros where clave = 'uma_diaria')
--  select
--    rn.evaluacion_id,
--    rn.norma_id,
--    rn.norma_titulo,
--    case
--      when rn.multa_unidad = 'UMA' and rn.multa_min is not null then
--        round( ((rn.multa_min + rn.multa_max)/2.0) * (select valor from uma)
--               * rn.factor_incumplimiento
--               * (n.prob_fiscalizacion / 5.0), 2)
--      else null   -- unidades no-UMA (PCT_INGRESOS, etc.) requieren su propio cálculo
--    end as exposicion_esperada_mxn
--  from v_riesgo_norma rn
--  join normas n on n.id = rn.norma_id;
--
--  -- Agregado por evaluación: SUM(exposicion_esperada_mxn) → "exposición
--  -- financiera esperada total del cliente", como capa ilustrativa separada.
-- ============================================================================