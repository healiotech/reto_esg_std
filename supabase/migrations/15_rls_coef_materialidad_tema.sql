-- ============================================================================
--  MIGRACIÓN 15 — RLS de coef_materialidad_tema (falta la policy, no el grant)
-- ----------------------------------------------------------------------------
--  La migración 13 le dio GRANT SELECT a anon/authenticated, pero la tabla
--  tiene Row Level Security ACTIVADO sin ninguna policy — Postgres deniega
--  por defecto, así que PostgREST devuelve 200 con 0 filas (`content-range:
--  */0`) para cualquier rol que no sea service_role, no un error. Confirmado
--  en vivo: el GRANT ya no da "permission denied", pero la lista sigue
--  vacía para anon aunque la tabla tiene datos reales (el simulador, que usa
--  service_role, sí los ve).
--
--  Mismo patrón que jurisdicciones (05_jurisdicciones.sql): RLS activado +
--  una policy de lectura abierta, porque es catálogo de referencia (peso de
--  materialidad por tema), no dato de cliente.
-- ============================================================================

alter table coef_materialidad_tema enable row level security;

create policy "lectura publica catalogo" on coef_materialidad_tema
  for select using (true);
