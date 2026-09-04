-- ============================================================================
--  MIGRACIÓN 22 — Agregar 'no_aplica' al enum de estatus de respuesta
-- ----------------------------------------------------------------------------
--  Para el filtro de aplicabilidad: una norma condicional que el cliente
--  determina que NO le aplica se registra con estatus 'no_aplica'. El motor de
--  scoring la EXCLUYE del cálculo (ni numerador ni denominador).
--
--  ⚠️ Debe correr SOLA. Si el SQL Editor da error de 'transaction block',
--     ya está aislada. El resto va en la migración 23.
-- ============================================================================

-- Nota: ajustar el nombre del tipo si difiere. Se busca el enum del campo respuestas.estatus (estatus_cumplimiento).
alter type estatus_cumplimiento add value if not exists 'no_aplica';