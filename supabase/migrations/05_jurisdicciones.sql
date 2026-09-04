-- ============================================================================
--  Jurisdicciones — reconciliación de drift descubierto al preparar
--  06_cerrar_evaluacion.sql (ver esa migración y la conversación de reseña).
--
--  Ninguna pieza de este archivo estaba en 01_esquema_riesgo.sql ni en
--  ningún otro archivo committeado, pero todas ya existen en la base viva
--  (aplicadas a mano). Reconstruido por introspección directa contra el
--  proyecto vinculado (tablas, columnas, FKs, vista y función vía
--  information_schema / pg_catalog / pg_get_viewdef / pg_get_functiondef),
--  no por suposición.
--
--  Contenido:
--   · tabla jurisdicciones (+ RLS de solo lectura, mismo patrón que sectores)
--   · clientes.jurisdiccion_id
--   · normas.jurisdiccion_id + normas.pregunta_evaluacion (+ backfill)
--   · vista v_normas_aplicables
--   · función normas_aplicables(p_sector_id, p_jurisdiccion_id) — el RPC que
--     invoca el frontend en Cuestionario.tsx
-- ============================================================================

create table if not exists jurisdicciones (
  id     uuid primary key default gen_random_uuid(),
  clave  text not null unique,
  nombre text not null,
  nivel  text not null check (nivel in ('federal', 'estatal', 'municipal'))
);

alter table jurisdicciones enable row level security;

drop policy if exists "lectura publica catalogo" on jurisdicciones;
create policy "lectura publica catalogo" on jurisdicciones for select using (true);

insert into jurisdicciones (id, clave, nombre, nivel) values
  ('f0000000-0000-0000-0000-000000000000', 'FED', 'Federal (México)', 'federal')
on conflict (clave) do nothing;

alter table clientes
  add column if not exists jurisdiccion_id uuid references jurisdicciones(id);

alter table normas
  add column if not exists jurisdiccion_id uuid references jurisdicciones(id),
  add column if not exists pregunta_evaluacion text;

-- Backfill: en la base viva, las 11 normas semilla apuntan todas a FED (es la
-- única jurisdicción existente). Si se agregan normas estatales/municipales
-- después, deben traer su jurisdiccion_id explícito desde su propio insert.
update normas set jurisdiccion_id = (select id from jurisdicciones where clave = 'FED')
where jurisdiccion_id is null;

update normas set pregunta_evaluacion = v.pregunta
from (values
  ('ACUSTF', '¿Cuenta el cliente con la Autorización de Cambio de Uso de Suelo en Terrenos Forestales (ACUSTF) vigente, emitida por SEMARNAT, para los predios donde opera?'),
  ('CONCESION_AGUA', '¿Cuenta con título de concesión vigente de CONAGUA para el uso o aprovechamiento de aguas nacionales?'),
  ('ETIQUETADO', '¿El etiquetado de sus productos cumple con la NOM-051 aplicable?'),
  ('EUDR', 'Si exporta a la Unión Europea: ¿cuenta con la debida diligencia de deforestación (geolocalización de predios y declaración) conforme al Reglamento (UE) 2023/1115 (EUDR)?'),
  ('JORNALEROS_LFT', '¿Los trabajadores agrícolas cuentan con contrato, seguridad social y condiciones conforme a la Ley Federal del Trabajo?'),
  ('MIA', '¿Cuenta con la autorización en materia de impacto ambiental (MIA) resuelta favorablemente por SEMARNAT para las obras/actividades que la requieren?'),
  ('NOM001_DESCARGAS', '¿Sus descargas de aguas residuales cumplen los límites de la NOM-001-SEMARNAT-2021, acreditado con análisis de laboratorio?'),
  ('NOM059_ESPECIES', '¿Las operaciones evitan la afectación de especies listadas en la NOM-059-SEMARNAT-2010, o cuentan con las medidas y autorizaciones correspondientes?'),
  ('PLAGUICIDAS', '¿Los plaguicidas/agroquímicos utilizados están registrados y autorizados (COFEPRIS-SADER) y se aplican conforme a la normativa vigente?'),
  ('SENASICA_MOV', '¿Cuenta con los certificados/guías de movilización pecuaria y los registros de sanidad animal vigentes ante SENASICA?'),
  ('TIERRAS_EJIDALES', '¿El uso de tierras ejidales o comunales cuenta con el respaldo jurídico correspondiente (asamblea, contrato o resolución) conforme a la Ley Agraria?')
) as v(clave, pregunta)
where normas.clave = v.clave and normas.pregunta_evaluacion is null;

create or replace view v_normas_aplicables as
select
  c.id     as cliente_id,
  c.nombre as cliente_nombre,
  n.id     as norma_id,
  n.clave  as norma_clave,
  n.titulo as norma_titulo,
  n.categoria,
  j.clave  as jurisdiccion,
  j.nivel  as jurisdiccion_nivel
from clientes c
join norma_sector ns on ns.sector_id = c.sector_id and ns.aplica = true
join normas n         on n.id = ns.norma_id and n.vigente = true
join jurisdicciones j on j.id = n.jurisdiccion_id
where j.nivel = 'federal' or n.jurisdiccion_id = c.jurisdiccion_id;

create or replace function normas_aplicables(p_sector_id uuid, p_jurisdiccion_id uuid)
returns table (
  norma_id uuid,
  norma_clave text,
  norma_titulo text,
  categoria categoria_norma,
  pregunta_evaluacion text,
  jurisdiccion text
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.clave, n.titulo, n.categoria, n.pregunta_evaluacion, j.clave
  from norma_sector ns
  join normas n         on n.id = ns.norma_id and n.vigente = true
  join jurisdicciones j on j.id = n.jurisdiccion_id
  where ns.sector_id = p_sector_id
    and ns.aplica = true
    and (j.nivel = 'federal' or n.jurisdiccion_id = p_jurisdiccion_id)
  order by n.categoria, n.clave;
$$;
