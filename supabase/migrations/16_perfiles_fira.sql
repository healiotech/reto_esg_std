-- ============================================================================
--  MIGRACIÓN 16 — Perfiles financieros por subsector × tamaño (FIRA + BMV)
-- ----------------------------------------------------------------------------
--  Reestructura el perfil financiero del simulador. Antes: una fila por sector,
--  con valores placeholder. Ahora: un perfil por SUBSECTOR (ganadería/agricultura)
--  × TAMAÑO (pyme/mediana/cotiza_bolsa), derivado de la estructura FIRA por red
--  de valor + comparables cotizados en BMV (Gruma, Bafar, Bachoco, etc.).
--
--  Fuente: modelo comparativo FIRA (brecha PyME-FIRA vs. corporativo-BMV) +
--  ratios de comparables Bloomberg. TIIE fondeo 6.75% para convertir spreads.
--  Ya NO es placeholder — es un perfil fundamentado.
--
--  · amortizacion_anios: plazo del crédito refaccionario (5 años).
--  · El DSCR usa solo el 40% de la deuda (refaccionaria); el 60% es avío
--    revolvente (solo intereses) — se maneja en el motor, no aquí.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Campo subsector en el cliente (ganaderia | agricultura).
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'subsector_agro') then
    create type subsector_agro as enum ('ganaderia', 'agricultura');
  end if;
end $$;

alter table clientes add column if not exists subsector subsector_agro;

comment on column clientes.subsector is
  'Subsector agropecuario (ganaderia/agricultura). Selecciona el perfil financiero FIRA junto con perfil_tamano.';

-- ----------------------------------------------------------------------------
-- 2. Nueva tabla de perfiles por subsector × tamaño.
--    Reemplaza el uso de perfil_financiero_base (una sola fila) para el agro.
-- ----------------------------------------------------------------------------
create table if not exists perfil_financiero_agro (
  subsector           subsector_agro not null,
  perfil_tamano       text not null,     -- 'pyme' | 'mediana' | 'cotiza_bolsa'
  margen_ebitda       numeric not null,  -- 0..1
  deuda_ebitda        numeric not null,  -- x veces
  tasa_interes        numeric not null,  -- 0..1  (Kd nominal = TIIE + spread)
  capex_pct_ingresos  numeric not null,  -- 0..1
  amortizacion_anios  int not null,      -- plazo refaccionario
  dscr_referencia     numeric,           -- DSCR de referencia FIRA (para validación)
  fuente              text default 'FIRA red de valor + comparables BMV',
  primary key (subsector, perfil_tamano)
);

-- Ingresos base representativos (para escalar). No varía por subsector aquí;
-- el usuario puede ajustarlo en el simulador. $50M como PyME/mediana representativa.
-- Se guarda aparte porque es un supuesto de escala, no un ratio.

insert into perfil_financiero_agro
  (subsector, perfil_tamano, margen_ebitda, deuda_ebitda, tasa_interes, capex_pct_ingresos, amortizacion_anios, dscr_referencia)
values
  -- GANADERÍA / PROTEÍNA
  ('ganaderia', 'pyme',         0.12, 3.10, 0.13,  0.08, 5, 1.15),
  ('ganaderia', 'mediana',      0.16, 2.25, 0.105, 0.07, 6, 1.75),
  ('ganaderia', 'cotiza_bolsa', 0.20, 1.40, 0.08,  0.06, 7, 2.80),
  -- AGRICULTURA / GRANOS
  ('agricultura', 'pyme',         0.12, 3.30, 0.135, 0.10, 5, 1.10),
  ('agricultura', 'mediana',      0.16, 2.40, 0.11,  0.085, 6, 1.65),
  ('agricultura', 'cotiza_bolsa', 0.20, 1.50, 0.085, 0.07, 7, 2.60)
  on conflict (subsector, perfil_tamano) do update set
    margen_ebitda = excluded.margen_ebitda,
    deuda_ebitda = excluded.deuda_ebitda,
    tasa_interes = excluded.tasa_interes,
    capex_pct_ingresos = excluded.capex_pct_ingresos,
    amortizacion_anios = excluded.amortizacion_anios,
    dscr_referencia = excluded.dscr_referencia;

-- Ingresos base representativos por tamaño (supuesto de escala, editable).
create table if not exists ingresos_base_tamano (
  perfil_tamano text primary key,
  ingresos_anuales numeric not null
);
insert into ingresos_base_tamano (perfil_tamano, ingresos_anuales) values
  ('pyme',          50000000),
  ('mediana',      250000000),
  ('cotiza_bolsa', 2000000000)
  on conflict (perfil_tamano) do update set ingresos_anuales = excluded.ingresos_anuales;

-- ----------------------------------------------------------------------------
-- 3. Grants + RLS (catálogo de metodología, lectura pública; escribe service_role).
-- ----------------------------------------------------------------------------
grant select on perfil_financiero_agro, ingresos_base_tamano to service_role, anon, authenticated;

alter table perfil_financiero_agro enable row level security;
drop policy if exists "lectura publica catalogo" on perfil_financiero_agro;
create policy "lectura publica catalogo" on perfil_financiero_agro for select using (true);

alter table ingresos_base_tamano enable row level security;
drop policy if exists "lectura publica catalogo" on ingresos_base_tamano;
create policy "lectura publica catalogo" on ingresos_base_tamano for select using (true);