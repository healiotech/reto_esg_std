-- ============================================================================
--  HERRAMIENTA DE RIESGO REGULATORIO ESG  —  Reto Santander × Tec
--  Migración inicial (Supabase / PostgreSQL 15+)
-- ----------------------------------------------------------------------------
--  Traduce la metodología cerrada en la Etapa 1 a esquema ejecutable.
--
--  Principio rector — separación de niveles:
--    NIVEL 1  = constantes de la NORMA (o de la relación norma×sector).
--               No cambian por cliente. Se precalculan y se consultan.
--    NIVEL 2  = variables del CLIENTE evaluado.
--               Cambian en cada evaluación. Viven en la capa de evaluación.
--
--  Decisiones de diseño reflejadas aquí:
--   · Dos pesos por norma (crédito / reputación) — canales separados desde la norma.
--   · Fiscalización SOLO modifica el canal crédito (fuera del base compartido).
--   · Materialidad vive en la relación norma×sector, no en la norma.
--   · Confianza es indicador de gobernanza, NO entra en el cálculo del score.
--   · Parámetros (factores de tamaño, bandas) en tablas versionables, no en código.
--   · Versionado temporal + snapshot de evaluación = reproducibilidad histórica.
--
--  ⚠️  ADVERTENCIA SOBRE LOS DATOS SEMILLA (al final del archivo):
--      Las NORMAS citadas son reales (regulación mexicana / EUDR aplicable).
--      Los VALORES numéricos (severidad, materialidad, pesos, fiscalización,
--      tendencia) son ILUSTRATIVOS y PROVISIONALES — placeholders para ver el
--      sistema correr end-to-end. Deben reemplazarse con la investigación
--      regulatoria de la Fase 1 y validarse con criterio experto (Fernando /
--      Etna). No presentar estos números como definitivos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensiones y tipos
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()

create type categoria_norma      as enum ('ambiental', 'social', 'jurisdiccional_documental');
create type perfil_tamano        as enum ('pyme', 'mediana', 'cotiza_bolsa', 'multinacional');
create type estatus_cumplimiento as enum ('cumple', 'parcial', 'no_cumple', 'desconocido');
create type nivel_confianza      as enum ('verificado', 'autoreportado');
create type canal_riesgo         as enum ('credito', 'reputacion');
create type estado_evaluacion    as enum ('borrador', 'cerrada');

-- ============================================================================
--  NIVEL 1 — BASE REGULATORIA (constantes, precalculadas)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Sectores
-- ----------------------------------------------------------------------------
create table sectores (
  id          uuid primary key default gen_random_uuid(),
  clave       text unique not null,
  nombre      text not null,
  descripcion text
);

-- ----------------------------------------------------------------------------
-- 2. Normas  (atributos inherentes a la norma)
--    NOTA: materialidad NO está aquí — es propiedad de la relación norma×sector.
--    NOTA: prob_fiscalizacion vive aquí (es inherente a la norma) pero solo se
--          aplica en el canal crédito, no en el base compartido (ver vistas).
-- ----------------------------------------------------------------------------
create table normas (
  id                 uuid primary key default gen_random_uuid(),
  clave              text not null,
  titulo             text not null,
  descripcion        text,
  categoria          categoria_norma not null,

  -- Magnitud (inherente a la norma)
  severidad          smallint not null check (severidad between 1 and 5),
  prob_fiscalizacion smallint not null check (prob_fiscalizacion between 1 and 5),
  tendencia          numeric(2,1) not null default 1.0
                       check (tendencia in (1.0, 1.3, 1.5)),  -- estable / endurece / inminente

  -- No-linealidad
  es_descalificante  boolean not null default false,          -- fuerza banda Crítico si no_cumple

  -- Reparto por canal (corazón de la separación crédito / reputación)
  peso_crediticio    numeric(3,2) not null check (peso_crediticio   >= 0),
  peso_reputacional  numeric(3,2) not null check (peso_reputacional >= 0),

  -- Trazabilidad de la fuente (auditabilidad)
  fuente             text not null,
  fuente_url         text,
  fecha_publicacion  date,
  fecha_revision     date,          -- clave para 'tendencia': re-validar antes de que envejezca

  -- Versionado temporal (reproducibilidad histórica)
  version            integer not null default 1,
  valido_desde       date not null default current_date,
  valido_hasta       date,          -- null = vigente
  vigente            boolean not null default true,

  creado_en          timestamptz not null default now()
);

comment on column normas.prob_fiscalizacion is
  'Solo modifica el canal CRÉDITO (enforcement del regulador). No aplica a reputación (daño por exposición pública).';
comment on column normas.es_descalificante is
  'Reservar para casos binarios por naturaleza legal (prohibiciones absolutas, barreras de exportación), NO como sinónimo de severidad=5.';

-- ----------------------------------------------------------------------------
-- 3. norma_sector  (puente: aplicabilidad + MATERIALIDAD por sector)
--    Aquí vive materialidad porque la misma norma es central en un sector y
--    tangencial en otro. Esto hace la base escalable a multi-sector sin rehacerla.
-- ----------------------------------------------------------------------------
create table norma_sector (
  norma_id     uuid not null references normas(id) on delete cascade,
  sector_id    uuid not null references sectores(id) on delete cascade,
  aplica       boolean not null default true,
  materialidad smallint not null check (materialidad between 1 and 5),  -- criterio experto
  primary key (norma_id, sector_id)
);

-- ============================================================================
--  TABLAS DE CONFIGURACIÓN (parámetros versionables — no hardcodear en código)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4. Factores de tamaño por canal
--    Crédito ≈ plano (escrutinio ↑ ~cancela absorción ↓ por unidad).
--    Reputación = creciente y limpio (tamaño = visibilidad pública).
-- ----------------------------------------------------------------------------
create table factores_tamano (
  perfil            perfil_tamano primary key,
  factor_credito    numeric(3,2) not null,
  factor_reputacion numeric(3,2) not null
);

-- ----------------------------------------------------------------------------
-- 5. Bandas de interpretación por canal
--    ⚠️ Rangos ilustrativos — recalibrar contra la distribución real de scores.
-- ----------------------------------------------------------------------------
create table bandas (
  id              uuid primary key default gen_random_uuid(),
  canal           canal_riesgo not null,
  etiqueta        text not null,        -- Bajo / Medio / Alto / Crítico
  limite_inferior numeric(6,3) not null,
  limite_superior numeric(6,3),         -- null = sin tope (Crítico)
  orden           smallint not null
);

-- ============================================================================
--  NIVEL 2 — CAPA DE EVALUACIÓN (variables del cliente)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 6. Clientes
-- ----------------------------------------------------------------------------
create table clientes (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  sector_id     uuid not null references sectores(id),
  perfil_tamano perfil_tamano not null,
  es_exportador boolean not null default false,  -- relevante p.ej. para EUDR
  creado_en     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. Evaluaciones
--    snapshot: congela parámetros + versión de base usada => reproducibilidad.
--    Una evaluación 'cerrada' debe ser inmutable (idealmente vía trigger/RLS).
-- ----------------------------------------------------------------------------
create table evaluaciones (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  evaluador  text,
  estado     estado_evaluacion not null default 'borrador',
  fecha      timestamptz not null default now(),
  snapshot   jsonb,   -- factores_tamano + bandas + versión de normas al momento de cerrar
  cerrada_en timestamptz
);

comment on column evaluaciones.snapshot is
  'Congela los parámetros y versiones vigentes al cerrar. Permite reproducir el score exacto aunque la base regulatoria cambie después.';

-- ----------------------------------------------------------------------------
-- 8. Respuestas  (estatus del cliente por norma)
--    factor_incumplimiento es GENERADO desde el estatus — no se captura a mano.
--    nivel_confianza es indicador separado: NO entra en ninguna fórmula de score.
-- ----------------------------------------------------------------------------
create table respuestas (
  id             uuid primary key default gen_random_uuid(),
  evaluacion_id  uuid not null references evaluaciones(id) on delete cascade,
  norma_id       uuid not null references normas(id),
  estatus        estatus_cumplimiento not null,

  -- Cumple=0 / Parcial=0.5 / No cumple=1 / Desconocido=0.75
  -- (0 y 1 son las anclas del multiplicador; 0.75 penaliza la incertidumbre
  --  casi como el peor caso, para no premiar la opacidad)
  factor_incumplimiento numeric(3,2) generated always as (
    case estatus
      when 'cumple'      then 0
      when 'parcial'     then 0.5
      when 'no_cumple'   then 1
      when 'desconocido' then 0.75
    end
  ) stored,

  nivel_confianza nivel_confianza not null default 'autoreportado',
  documento_url   text,          -- soporte del estatus; su ausencia ya es información
  nota            text,
  unique (evaluacion_id, norma_id)
);

-- ============================================================================
--  VISTAS — MOTOR DE LECTURA / CAJA DE CRISTAL
--  (El cálculo autoritativo vive en una edge function determinista y testeable.
--   Estas vistas materializan la trazabilidad: descomponer un score = un JOIN.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 9. Riesgo base COMPARTIDO por (norma, sector)  — precálculo consultable
--    Fiscalización queda FUERA a propósito: es concepto de crédito, no compartido.
-- ----------------------------------------------------------------------------
create view v_riesgo_base_compartido as
select
  ns.norma_id,
  ns.sector_id,
  n.severidad * ns.materialidad * n.tendencia as riesgo_base_compartido
from norma_sector ns
join normas n on n.id = ns.norma_id
where ns.aplica = true
  and n.vigente = true;

-- ----------------------------------------------------------------------------
-- 10. Riesgo por norma y canal para cada respuesta  (el detalle de la caja de cristal)
--     Crédito     = base × (fiscalización/5) × factor_incumpl × peso_crediticio
--     Reputación  = base ×                      factor_incumpl × peso_reputacional
-- ----------------------------------------------------------------------------
create view v_riesgo_norma as
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
  -- Canal crédito (incluye fiscalización)
  round(b.riesgo_base_compartido
        * (n.prob_fiscalizacion / 5.0)
        * r.factor_incumplimiento
        * n.peso_crediticio, 4) as riesgo_credito,
  n.peso_crediticio,
  -- Canal reputación (sin fiscalización)
  round(b.riesgo_base_compartido
        * r.factor_incumplimiento
        * n.peso_reputacional, 4) as riesgo_reputacion,
  n.peso_reputacional,
  -- Bandera dura: descalificante incumplida => Crítico, sin promediar
  (n.es_descalificante and r.estatus = 'no_cumple') as gatilla_critico
from respuestas r
join normas n           on n.id = r.norma_id
join evaluaciones e     on e.id = r.evaluacion_id
join clientes c         on c.id = e.cliente_id
join v_riesgo_base_compartido b
     on b.norma_id = r.norma_id and b.sector_id = c.sector_id;

-- ----------------------------------------------------------------------------
-- 11. Score agregado por evaluación y canal
--     Agregación ÚNICA y consistente: promedio ponderado por el peso del canal
--     (no suma → no infla por cantidad de normas). Aplica factor de tamaño.
--     Reporta también MAX por canal para que una norma crítica no se diluya.
--     NOTA: el multiplicador sistémico (2+ categorías en Alto/Crítico) y el
--     override por descalificante se aplican en la edge function sobre esta base.
-- ----------------------------------------------------------------------------
create view v_score_evaluacion as
with detalle as (
  select rn.*, c.perfil_tamano
  from v_riesgo_norma rn
  join evaluaciones e on e.id = rn.evaluacion_id
  join clientes c     on c.id = e.cliente_id
)
select
  d.evaluacion_id,
  -- Crédito
  round( sum(d.riesgo_credito)    / nullif(sum(d.peso_crediticio),   0)
         * ft.factor_credito, 4)                          as score_credito,
  round( max(d.riesgo_credito), 4)                         as max_credito,
  -- Reputación
  round( sum(d.riesgo_reputacion) / nullif(sum(d.peso_reputacional), 0)
         * ft.factor_reputacion, 4)                       as score_reputacion,
  round( max(d.riesgo_reputacion), 4)                      as max_reputacion,
  -- Banderas y gobernanza
  bool_or(d.gatilla_critico)                               as forzar_critico,
  count(*) filter (where d.nivel_confianza = 'autoreportado')::numeric
    / count(*)                                             as pct_autoreportado
from detalle d
join factores_tamano ft on ft.perfil = d.perfil_tamano
group by d.evaluacion_id, ft.factor_credito, ft.factor_reputacion;

-- ============================================================================
--  DATOS SEMILLA  —  Sector agropecuario / ganadero
--  Normas REALES · valores numéricos ILUSTRATIVOS (validar en Fase 1)
-- ============================================================================

-- Sector
insert into sectores (id, clave, nombre, descripcion) values
  ('11111111-1111-1111-1111-111111111111', 'AGRO',
   'Agropecuario / Ganadero',
   'Producción agrícola y ganadera; foco del prototipo.');

-- Factores de tamaño (crédito ≈ plano; reputación creciente)
insert into factores_tamano (perfil, factor_credito, factor_reputacion) values
  ('pyme',          0.90, 0.50),
  ('mediana',       1.00, 0.80),
  ('cotiza_bolsa',  1.05, 1.50),
  ('multinacional', 1.10, 1.60);

-- Bandas (ilustrativas — recalibrar contra distribución real)
insert into bandas (canal, etiqueta, limite_inferior, limite_superior, orden) values
  ('credito',    'Bajo',   0.0, 1.0, 1),
  ('credito',    'Medio',  1.0, 2.0, 2),
  ('credito',    'Alto',   2.0, 3.5, 3),
  ('credito',    'Crítico',3.5, null,4),
  ('reputacion', 'Bajo',   0.0, 1.0, 1),
  ('reputacion', 'Medio',  1.0, 2.0, 2),
  ('reputacion', 'Alto',   2.0, 3.5, 3),
  ('reputacion', 'Crítico',3.5, null,4);

-- Normas (reales) — valores ilustrativos
--  sev=severidad · fisc=prob_fiscalización · tend=tendencia · desc=descalificante
--  pc=peso_crediticio · pr=peso_reputacional
insert into normas
  (id, clave, titulo, categoria, severidad, prob_fiscalizacion, tendencia,
   es_descalificante, peso_crediticio, peso_reputacional, fuente) values

-- Ambiental
('a0000001-0000-0000-0000-000000000001','ACUSTF',
 'Autorización de cambio de uso de suelo en terreno forestal',
 'ambiental', 5, 4, 1.0, true, 0.70, 1.00,
 'Ley General de Desarrollo Forestal Sustentable (LGDFS) — SEMARNAT'),

('a0000002-0000-0000-0000-000000000002','CONCESION_AGUA',
 'Título de concesión para uso/aprovechamiento de aguas nacionales',
 'ambiental', 4, 3, 1.0, false, 0.90, 0.60,
 'Ley de Aguas Nacionales — CONAGUA'),

('a0000003-0000-0000-0000-000000000003','NOM001_DESCARGAS',
 'Límites de contaminantes en descargas de aguas residuales',
 'ambiental', 3, 3, 1.3, false, 0.60, 0.70,
 'NOM-001-SEMARNAT-2021'),

('a0000004-0000-0000-0000-000000000004','MIA',
 'Manifestación de Impacto Ambiental',
 'ambiental', 4, 3, 1.0, false, 0.70, 0.80,
 'LGEEPA art. 28 — SEMARNAT'),

('a0000005-0000-0000-0000-000000000005','NOM059_ESPECIES',
 'Protección de especies en riesgo (afectación de hábitat)',
 'ambiental', 4, 2, 1.0, false, 0.50, 1.00,
 'NOM-059-SEMARNAT-2010'),

('a0000006-0000-0000-0000-000000000006','PLAGUICIDAS',
 'Registro y uso autorizado de plaguicidas / agroquímicos',
 'ambiental', 3, 3, 1.3, false, 0.50, 0.70,
 'LGEEPA / COFEPRIS-SADER'),

-- Social
('b0000007-0000-0000-0000-000000000007','JORNALEROS_LFT',
 'Condiciones laborales de jornaleros agrícolas',
 'social', 3, 2, 1.3, false, 0.40, 1.20,
 'Ley Federal del Trabajo'),

('b0000008-0000-0000-0000-000000000008','TIERRAS_EJIDALES',
 'Uso de tierras ejidales/comunales y derechos agrarios',
 'social', 4, 2, 1.0, false, 0.60, 1.10,
 'Ley Agraria'),

-- Jurisdiccional / documental
('c0000009-0000-0000-0000-000000000009','EUDR',
 'Debida diligencia libre de deforestación para exportación a la UE',
 'jurisdiccional_documental', 5, 4, 1.5, true, 1.00, 1.30,
 'Reglamento (UE) 2023/1115 (EUDR)'),

('c0000010-0000-0000-0000-000000000010','SENASICA_MOV',
 'Requisitos de movilización pecuaria y sanidad animal',
 'jurisdiccional_documental', 2, 4, 1.0, false, 0.60, 0.30,
 'SENASICA'),

('c0000011-0000-0000-0000-000000000011','ETIQUETADO',
 'Etiquetado de producto (norma tangencial al core ganadero)',
 'jurisdiccional_documental', 2, 3, 1.0, false, 0.30, 0.30,
 'NOM-051-SCFI/SSA1');

-- Aplicabilidad + materialidad para el sector AGRO
--  (etiquetado con materialidad baja = ejemplo intencional de norma tangencial)
insert into norma_sector (norma_id, sector_id, aplica, materialidad) values
  ('a0000001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', true, 5),
  ('a0000002-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111', true, 5),
  ('a0000003-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111', true, 3),
  ('a0000004-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111', true, 4),
  ('a0000005-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111', true, 3),
  ('a0000006-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111', true, 4),
  ('b0000007-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111', true, 4),
  ('b0000008-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111', true, 4),
  ('c0000009-0000-0000-0000-000000000009','11111111-1111-1111-1111-111111111111', true, 5),
  ('c0000010-0000-0000-0000-000000000010','11111111-1111-1111-1111-111111111111', true, 3),
  ('c0000011-0000-0000-0000-000000000011','11111111-1111-1111-1111-111111111111', true, 2);

-- ----------------------------------------------------------------------------
-- Clientes de demostración (ficticios)  — diseñados para mostrar DIVERGENCIA
-- entre canales, que es donde la herramienta aporta valor.
-- ----------------------------------------------------------------------------
insert into clientes (id, nombre, sector_id, perfil_tamano, es_exportador) values
  ('d0000001-0000-0000-0000-000000000001','Rancho El Porvenir (demo)',
   '11111111-1111-1111-1111-111111111111','mediana', false),
  ('d0000002-0000-0000-0000-000000000002','Agroinsumos del Bajío (demo)',
   '11111111-1111-1111-1111-111111111111','mediana', false);

-- Evaluaciones
insert into evaluaciones (id, cliente_id, evaluador, estado) values
  ('e0000001-0000-0000-0000-000000000001','d0000001-0000-0000-0000-000000000001','demo','borrador'),
  ('e0000002-0000-0000-0000-000000000002','d0000002-0000-0000-0000-000000000002','demo','borrador');

-- CASO A — "El Porvenir": papeles impecables, PROBLEMA AMBIENTAL.
--   Esperado: crédito moderado / reputación elevada (canal ambiental pesa en rep).
insert into respuestas (evaluacion_id, norma_id, estatus, nivel_confianza) values
  ('e0000001-0000-0000-0000-000000000001','a0000001-0000-0000-0000-000000000001','cumple',    'verificado'),
  ('e0000001-0000-0000-0000-000000000001','a0000002-0000-0000-0000-000000000002','cumple',    'verificado'),
  ('e0000001-0000-0000-0000-000000000001','a0000003-0000-0000-0000-000000000003','cumple',    'verificado'),
  ('e0000001-0000-0000-0000-000000000001','a0000004-0000-0000-0000-000000000004','cumple',    'verificado'),
  ('e0000001-0000-0000-0000-000000000001','a0000005-0000-0000-0000-000000000005','no_cumple', 'verificado'),  -- hábitat de especie protegida
  ('e0000001-0000-0000-0000-000000000001','a0000006-0000-0000-0000-000000000006','parcial',   'autoreportado'),
  ('e0000001-0000-0000-0000-000000000001','b0000007-0000-0000-0000-000000000007','cumple',    'verificado'),
  ('e0000001-0000-0000-0000-000000000001','b0000008-0000-0000-0000-000000000008','cumple',    'verificado'),
  ('e0000001-0000-0000-0000-000000000001','c0000010-0000-0000-0000-000000000010','cumple',    'verificado'),
  ('e0000001-0000-0000-0000-000000000001','c0000011-0000-0000-0000-000000000011','cumple',    'verificado');

-- CASO B — "Agroinsumos del Bajío": ambiental limpio, PAPELES/DOCUMENTAL FLOJOS.
--   Esperado: crédito elevado / reputación baja (canal documental pesa en crédito).
insert into respuestas (evaluacion_id, norma_id, estatus, nivel_confianza) values
  ('e0000002-0000-0000-0000-000000000002','a0000001-0000-0000-0000-000000000001','cumple',    'verificado'),
  ('e0000002-0000-0000-0000-000000000002','a0000002-0000-0000-0000-000000000002','no_cumple', 'verificado'),  -- sin concesión de agua vigente
  ('e0000002-0000-0000-0000-000000000002','a0000003-0000-0000-0000-000000000003','cumple',    'autoreportado'),
  ('e0000002-0000-0000-0000-000000000002','a0000004-0000-0000-0000-000000000004','desconocido','autoreportado'),
  ('e0000002-0000-0000-0000-000000000002','a0000005-0000-0000-0000-000000000005','cumple',    'verificado'),
  ('e0000002-0000-0000-0000-000000000002','a0000006-0000-0000-0000-000000000006','cumple',    'verificado'),
  ('e0000002-0000-0000-0000-000000000002','b0000007-0000-0000-0000-000000000007','cumple',    'verificado'),
  ('e0000002-0000-0000-0000-000000000002','b0000008-0000-0000-0000-000000000008','cumple',    'verificado'),
  ('e0000002-0000-0000-0000-000000000002','c0000010-0000-0000-0000-000000000010','no_cumple', 'verificado'),  -- movilización sin requisitos
  ('e0000002-0000-0000-0000-000000000002','c0000011-0000-0000-0000-000000000011','cumple',    'verificado');

-- ============================================================================
--  CONSULTAS DE VERIFICACIÓN (ejecutar tras la migración)
-- ----------------------------------------------------------------------------
--   -- Detalle caja de cristal de un cliente:
--   -- select norma_titulo, estatus, riesgo_credito, riesgo_reputacion, fuente
--   -- from v_riesgo_norma where evaluacion_id = 'e0000001-...' order by riesgo_reputacion desc;
--
--   -- Scores agregados de ambos clientes (debe verse la divergencia entre canales):
--   -- select * from v_score_evaluacion;
-- ============================================================================