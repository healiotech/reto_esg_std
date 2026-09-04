-- ============================================================================
--  MIGRACIÓN 13 — Lectura pública de coef_materialidad_tema
-- ----------------------------------------------------------------------------
--  Bloque "Materialidad del sector" de Resultados.tsx: lee esta tabla directo
--  desde el frontend con la anon key, igual que jurisdicciones/sectores — es
--  catálogo de referencia (peso de cada tema ESG), no dato sensible de
--  cliente. La migración 12 solo le había dado grant a service_role (para el
--  simulador financiero). Esta migración agrega el grant a anon/authenticated
--  sin tocar la tabla, sus datos, ni el grant existente de service_role.
-- ============================================================================

grant select on coef_materialidad_tema to anon, authenticated;
