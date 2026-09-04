-- ============================================================================
--  MIGRACIÓN 12 — Parámetros del simulador financiero (editables sin redeploy)
-- ----------------------------------------------------------------------------
--  El simulador es determinista pero sus parámetros son criterio de finanzas.
--  Se guardan en tablas para que el equipo los ajuste sin tocar código.
--
--  Tres grupos:
--    1. perfil_financiero_base  — el cliente genérico del sector (PLACEHOLDER)
--    2. intensidad_escenario    — % del impacto que se materializa por escenario
--    3. coef_materialidad_tema  — peso de impacto operativo por tema ESG
--
--  ⚠ perfil e intensidad son PLACEHOLDER — pendientes de validación de finanzas.
--    Los coeficientes de materialidad ya fueron definidos por el equipo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Perfil financiero base (una fila por sector; hoy solo agropecuario).
--    Es el "cliente representativo" sobre el que se simula.
-- ----------------------------------------------------------------------------
create table if not exists perfil_financiero_base (
  sector_id           uuid primary key references sectores(id),
  ingresos_anuales    numeric not null,   -- MXN
  margen_ebitda       numeric not null,   -- 0..1
  deuda_ebitda        numeric not null,   -- x veces
  tasa_interes        numeric not null,   -- 0..1
  capex_pct_ingresos  numeric not null,   -- 0..1
  origen              text default 'placeholder',  -- 'placeholder' | 'validado'
  nota                text
);

insert into perfil_financiero_base
  (sector_id, ingresos_anuales, margen_ebitda, deuda_ebitda, tasa_interes, capex_pct_ingresos, origen, nota)
values
  ('11111111-1111-1111-1111-111111111111', 50000000, 0.18, 3.0, 0.12, 0.08, 'placeholder',
   'Perfil PYME agropecuaria representativo. PLACEHOLDER — validar con datos de FIRA / informes sectoriales.')
  on conflict (sector_id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Intensidad por escenario: fracción del impacto que se materializa.
-- ----------------------------------------------------------------------------
create table if not exists intensidad_escenario (
  escenario  text primary key check (escenario in ('cumple','parcial','incumple')),
  intensidad numeric not null check (intensidad between 0 and 1),
  origen     text default 'placeholder'
);

insert into intensidad_escenario (escenario, intensidad, origen) values
  ('cumple',   0.00, 'placeholder'),
  ('parcial',  0.30, 'placeholder'),
  ('incumple', 0.85, 'placeholder')
  on conflict (escenario) do update set intensidad = excluded.intensidad;

-- ----------------------------------------------------------------------------
-- 3. Coeficiente de materialidad por tema (ya definido por el equipo).
--    Peso 0..1 de cuánto un incumplimiento de ese tema golpea el negocio
--    (vía ventas/costos), para el sector agropecuario.
-- ----------------------------------------------------------------------------
create table if not exists coef_materialidad_tema (
  tema        tema_esg primary key,
  coeficiente numeric not null check (coeficiente between 0 and 1),
  banda       text,   -- etiqueta cualitativa: bajo/medio/alto/critico
  en_canal_operativo boolean not null default true  -- EUDR va fuera (categórico)
);

insert into coef_materialidad_tema (tema, coeficiente, banda, en_canal_operativo) values
  ('agua',                  0.95, 'critico', true),
  ('uso_suelo',             0.88, 'critico', true),
  ('sanidad',               0.83, 'alto',    true),
  ('biodiversidad',         0.75, 'alto',    true),
  ('derechos_laborales',    0.70, 'alto',    true),
  ('contaminacion',         0.55, 'medio',   true),
  ('comunidades_tierra',    0.30, 'bajo',    true),
  ('salud_seguridad',       0.30, 'bajo',    true),
  ('permisos_licencias',    0.25, 'bajo',    true),
  ('cambio_climatico',      0.25, 'bajo',    true),
  ('residuos',              0.25, 'bajo',    true),
  ('etiquetado',            0.20, 'bajo',    true),
  ('economia_circular',     0.15, 'bajo',    true),
  ('requisitos_exportacion',0.00, 'categorico', false)  -- fuera del canal operativo
  on conflict (tema) do update set
    coeficiente = excluded.coeficiente, banda = excluded.banda,
    en_canal_operativo = excluded.en_canal_operativo;

-- ----------------------------------------------------------------------------
-- 4. Grants de lectura (la función del simulador usa service_role).
-- ----------------------------------------------------------------------------
grant select on perfil_financiero_base, intensidad_escenario, coef_materialidad_tema
  to service_role;