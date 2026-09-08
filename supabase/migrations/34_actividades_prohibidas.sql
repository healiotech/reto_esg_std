-- ============================================================================
--  Actividades PROHIBIDAS por la política ESG del Grupo Santander
--  ("Gestión de Riesgos Medioambientales, Sociales y de Cambio Climático",
--   sección 3). Si el cliente participa en alguna, el banco no le presta
--   servicios financieros: no hay evaluación de normas que hacer.
--
--  · Catálogo de solo lectura (mismo patrón RLS que jurisdicciones/sectores).
--  · clientes.actividad_prohibida_id — el marcador vive en el CLIENTE, no en
--    la evaluación: toda evaluación de un cliente marcado es 'no_evaluable'.
--  · Requiere el enum 'no_evaluable' de la migración 33 (ya commiteado).
--
--  Seed: subconjunto agro + transversales del documento (no la lista completa
--  de petróleo/gas, energía, minería y metalurgia).
-- ============================================================================

create table if not exists actividades_prohibidas (
  id                uuid primary key default gen_random_uuid(),
  clave             text not null unique,
  etiqueta          text not null,          -- nombre corto (Select y banner)
  clausula_politica text not null,          -- referencia citable de la política
  descripcion       text not null,          -- una o dos frases, como en el PDF
  orden             int  not null default 0,
  activa            boolean not null default true
);

alter table actividades_prohibidas enable row level security;

drop policy if exists "lectura publica catalogo" on actividades_prohibidas;
create policy "lectura publica catalogo" on actividades_prohibidas for select using (true);

grant select on actividades_prohibidas to anon, authenticated, service_role;

alter table clientes
  add column if not exists actividad_prohibida_id uuid references actividades_prohibidas(id);

insert into actividades_prohibidas (clave, etiqueta, clausula_politica, descripcion, orden) values
  ('soft_maderas_no_fsc',
   'Maderas tropicales autóctonas sin certificación FSC',
   'Actividades prohibidas · Soft commodities · Clientes',
   'Extracción de especies autóctonas de maderas tropicales no certificadas por el Forest Stewardship Council (FSC).',
   10),
  ('soft_palma_no_rspo',
   'Aceite de palma sin certificación RSPO',
   'Actividades prohibidas · Soft commodities · Clientes',
   'Procesadores de aceite de palma que no son miembros ni están certificados por la Mesa Redonda sobre el Aceite de Palma Sostenible (RSPO).',
   20),
  ('soft_turberas',
   'Desarrollos en turberas en geografías de alto riesgo',
   'Actividades prohibidas · Soft commodities · Proyectos',
   'Desarrollo de proyectos sobre turberas ubicadas en geografías de alto riesgo definidas por la política.',
   30),
  ('soft_deforestacion_amazonas',
   'Deforestación en el bioma del Amazonas',
   'Actividades que requieren especial atención · Soft commodities',
   'Riesgo de deforestación en clientes con actividades agrícolas y cárnicas en el bioma del Amazonas.',
   40),
  ('soft_expansion_agricola',
   'Expansión agrícola a costa de bosque natural',
   'Actividades que requieren especial atención · Soft commodities',
   'Financiación de actividades que generan la expansión de zonas agrícolas o plantaciones en detrimento del bosque natural.',
   50),
  ('soft_bosque_incendiado',
   'Desarrollo en bosques con incendios o deforestación reciente',
   'Actividades que requieren especial atención · Soft commodities',
   'Desarrollos en zonas boscosas que han sufrido incendios o deforestación masiva en los últimos cinco años.',
   60),
  ('trans_sitios_protegidos',
   'Actividad en zonas Ramsar, Patrimonio Mundial o UICN I–IV',
   'Actividades prohibidas · Transversal',
   'Proyecto o actividad que pone en riesgo zonas clasificadas por las listas Ramsar, de Patrimonio Mundial, o por la UICN como categorías I, II, III o IV.',
   70),
  ('trans_clpi_nds7',
   'Proyecto que requiere CLPI sin cumplir la NDS 7 de la IFC',
   'Actividades prohibidas · Transversal',
   'Proyectos que, conforme a la Norma de Desempeño 7 de la IFC (Pueblos Indígenas), requieren Consentimiento Libre, Previo e Informado (CLPI) y no la cumplen ni disponen de un plan de acción creíble.',
   80)
on conflict (clave) do nothing;
