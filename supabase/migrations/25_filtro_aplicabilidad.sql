-- ============================================================================
--  MIGRACIÓN 23 — Filtro de aplicabilidad: tipo por norma + pregunta
-- ----------------------------------------------------------------------------
--  Tres tipos de aplicabilidad:
--   · directa              → aplica a todo cliente del sector.
--   · condicional_actividad→ pregunta '¿aplica?' antes de evaluar (por actividad).
--   · condicional_perfil   → filtro automático por tamaño (no se pregunta).
--  Requiere que la migración 22 (enum 'no_aplica') se haya corrido antes.
-- ============================================================================

-- 1. Enum de tipo de aplicabilidad.
do $$ begin
  if not exists (select 1 from pg_type where typname='tipo_aplicabilidad') then
    create type tipo_aplicabilidad as enum ('directa','condicional_actividad','condicional_perfil');
  end if;
end $$;

-- 2. Campos nuevos en normas.
alter table normas add column if not exists tipo_aplicabilidad tipo_aplicabilidad not null default 'directa';
alter table normas add column if not exists pregunta_aplicabilidad text;
alter table normas add column if not exists perfil_aplicable text;  -- para condicional_perfil: qué tamaño

comment on column normas.tipo_aplicabilidad is 'directa | condicional_actividad (pregunta) | condicional_perfil (filtro por tamaño)';
comment on column normas.perfil_aplicable is 'Para condicional_perfil: el perfil_tamano al que aplica (p.ej. cotiza_bolsa).';

-- 3. Marcar las condicionales por ACTIVIDAD (con su pregunta).
update normas set tipo_aplicabilidad='condicional_actividad', pregunta_aplicabilidad='¿Descarga aguas residuales a un cuerpo nacional?' where clave='NOM001';
update normas set tipo_aplicabilidad='condicional_actividad', pregunta_aplicabilidad='¿Ha incorporado superficie que antes tenía vegetación forestal?' where clave='LGDFS';
update normas set tipo_aplicabilidad='condicional_actividad', pregunta_aplicabilidad='¿Moviliza ganado o productos de origen animal entre entidades o zonas?' where clave='LFSA';
update normas set tipo_aplicabilidad='condicional_actividad', pregunta_aplicabilidad='¿Usa fuego en sus terrenos (quemas agrícolas o pecuarias)?' where clave='NOM015';
update normas set tipo_aplicabilidad='condicional_actividad', pregunta_aplicabilidad='¿Genera residuos peligrosos por encima del umbral de microgenerador?' where clave='LGPGIR';
update normas set tipo_aplicabilidad='condicional_actividad', pregunta_aplicabilidad='¿Genera residuos que requieren clasificación de peligrosidad?' where clave='NOM052';
update normas set tipo_aplicabilidad='condicional_actividad', pregunta_aplicabilidad='¿Opera en tierras ejidales o comunales?' where clave='LAGR';
update normas set tipo_aplicabilidad='condicional_actividad', pregunta_aplicabilidad='¿Abastece agua para consumo humano?' where clave='NOM127';

-- 4. Marcar las condicionales por PERFIL (filtro automático por tamaño).
update normas set tipo_aplicabilidad='condicional_perfil', perfil_aplicable='cotiza_bolsa' where clave='LMV';
update normas set tipo_aplicabilidad='condicional_perfil', perfil_aplicable='cotiza_bolsa' where clave='ECUADOR';

-- El resto queda 'directa' por el default. Verificación:
-- select tipo_aplicabilidad, count(*) from normas group by tipo_aplicabilidad;