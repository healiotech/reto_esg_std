-- ============================================================================
--  MIGRACIÓN 11 — Ubicación de operación + jurisdicción en 3 capas + contexto
-- ----------------------------------------------------------------------------
--  Reencuadra el modelo: en vez de preguntar "jurisdicción", se pregunta
--  "¿dónde opera el cliente?" (un estado). De ese dato se derivan:
--    (a) las normas aplicables = INTERNACIONAL + FEDERAL + su ESTADO (3 capas)
--    (b) el contexto de riesgo del estado (tip cualitativo, paso 6)
--
--  Además:
--    · Normas internacionales pueden condicionarse a exportación (EUDR solo si exporta).
--    · Cada estado lleva un 'contexto_riesgo' (texto) que orienta al analista.
--    · El cliente lleva un flag de zona de riesgo del activo + nota.
--
--  Nada de esto modula el score. Es filtro de aplicabilidad + contexto cualitativo.
--  El motor (engine.ts) NO se toca.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Nivel 'internacional' en el enum de nivel de jurisdicción
--    (el catálogo usa texto con CHECK, no enum, así que ajustamos el CHECK)
-- ----------------------------------------------------------------------------
alter table jurisdicciones drop constraint if exists jurisdicciones_nivel_check;
alter table jurisdicciones add constraint jurisdicciones_nivel_check
  check (nivel in ('internacional', 'federal', 'estatal', 'municipal'));

-- Contexto de riesgo cualitativo por estado (tip que se muestra en el paso 6).
alter table jurisdicciones add column if not exists contexto_riesgo text;

-- ----------------------------------------------------------------------------
-- 2. Normas: flag de aplicabilidad condicionada a exportación
--    (para internacionales tipo EUDR que solo aplican a exportadores)
-- ----------------------------------------------------------------------------
alter table normas add column if not exists solo_si_exporta boolean not null default false;

-- EUDR es internacional y solo aplica a exportadores a la UE.
-- (Su jurisdiccion_id se reasigna a 'internacional' abajo, tras crear la fila.)
update normas set solo_si_exporta = true where clave = 'EUDR';

-- ----------------------------------------------------------------------------
-- 3. Catálogo de jurisdicciones: internacional + estados de muestra
-- ----------------------------------------------------------------------------
insert into jurisdicciones (id, clave, nombre, nivel, contexto_riesgo) values
  ('11000000-0000-0000-0000-000000000000','INT','Internacional (tratados)','internacional',
   null)
  on conflict (clave) do nothing;

-- Estados de muestra con contexto real del sector agropecuario.
-- ⚠ Tips ilustrativos basados en realidad (estrés hídrico, etc.); ampliar/validar en Fase 1.
insert into jurisdicciones (id, clave, nombre, nivel, contexto_riesgo) values
  ('a1000000-0000-0000-0000-000000000000','SON','Sonora','estatal',
   'Estrés hídrico alto: región de agricultura intensiva con presión sobre acuíferos. Revisar con atención concesiones y gestión de agua del cliente.'),
  ('a2000000-0000-0000-0000-000000000000','SIN','Sinaloa','estatal',
   'Principal estado agrícola; alta dependencia de riego y uso de agroquímicos. Revisar gestión hídrica y manejo de plaguicidas.'),
  ('a3000000-0000-0000-0000-000000000000','JAL','Jalisco','estatal',
   'Ganadería y agroindustria intensivas; presión sobre cuencas (Lago de Chapala) y zonas forestales. Revisar uso de suelo y descargas.'),
  ('a4000000-0000-0000-0000-000000000000','CHIH','Chihuahua','estatal',
   'Sequía recurrente y conflictos por agua; presión sobre acuíferos para agricultura de exportación. Revisar concesiones y estrés hídrico.'),
  ('a5000000-0000-0000-0000-000000000000','TAB','Tabasco','estatal',
   'Alta biodiversidad y humedales; riesgo de inundación y afectación a ecosistemas. Revisar impacto ambiental y biodiversidad.')
  on conflict (clave) do nothing;

-- Reasignar EUDR al nivel internacional (estaba como federal por conveniencia).
update normas set jurisdiccion_id = '11000000-0000-0000-0000-000000000000'
  where clave = 'EUDR';

-- ----------------------------------------------------------------------------
-- 4. Cliente: flag de zona de riesgo del activo + nota
--    (específico del activo del cliente, distinto del contexto general del estado)
-- ----------------------------------------------------------------------------
alter table clientes add column if not exists en_zona_riesgo boolean not null default false;
alter table clientes add column if not exists zona_riesgo_nota text;

comment on column clientes.en_zona_riesgo is
  'El activo del cliente está en/cerca de una zona sensible o restringida (ANP, veda, etc.). Contexto cualitativo, no modula el score.';
comment on column jurisdicciones.contexto_riesgo is
  'Tip cualitativo de riesgos ESG característicos del estado (ej. estrés hídrico). Se muestra al analista; no modula el score.';

-- ----------------------------------------------------------------------------
-- 5. Vista de aplicabilidad reescrita: 3 CAPAS
--    aplican = internacionales (salvo las solo_si_exporta cuando no exporta)
--            + federales
--            + las del estado donde opera el cliente
-- ----------------------------------------------------------------------------
create or replace view v_normas_aplicables as
select
  c.id            as cliente_id,
  c.nombre        as cliente_nombre,
  n.id            as norma_id,
  n.clave         as norma_clave,
  n.titulo        as norma_titulo,
  n.categoria,
  j.clave         as jurisdiccion,
  j.nivel         as jurisdiccion_nivel
from clientes c
join norma_sector ns  on ns.sector_id = c.sector_id and ns.aplica = true
join normas n         on n.id = ns.norma_id and n.vigente = true
join jurisdicciones j on j.id = n.jurisdiccion_id
where
  (
    j.nivel = 'internacional'
    and (n.solo_si_exporta = false or c.es_exportador = true)   -- EUDR solo si exporta
  )
  or j.nivel = 'federal'
  or (j.nivel = 'estatal' and n.jurisdiccion_id = c.jurisdiccion_id);

grant execute on function normas_aplicables(uuid, uuid) to anon, authenticated, service_role;
grant select on v_normas_aplicables to service_role;

-- ----------------------------------------------------------------------------
-- 6. Actualizar la función RPC normas_aplicables (la que usa el frontend)
--    para reflejar las 3 capas y el filtro de exportación.
--    Ahora necesita saber si el cliente exporta → nuevo parámetro.
-- ----------------------------------------------------------------------------
drop function if exists normas_aplicables(uuid, uuid);
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
  pregunta_evaluacion text,
  jurisdiccion        text,
  jurisdiccion_nivel  text
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.clave, n.titulo, n.categoria, n.pregunta_evaluacion,
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