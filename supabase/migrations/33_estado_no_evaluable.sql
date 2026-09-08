-- ============================================================================
--  Añade 'no_evaluable' a estado_evaluacion.
--
--  Un cliente que participa en una actividad PROHIBIDA por la política ESG del
--  Grupo Santander no se evalúa: no hay cuestionario de normas, score ni
--  simulador. La evaluación se persiste igual (para que el caso quede
--  registrado en la cartera) con este estado.
--
--  Va en archivo propio: `alter type ... add value` no puede usarse en la
--  misma transacción que lo define, y el resto del feature (tabla + columna)
--  necesita referenciar el enum ya commiteado (migración 34).
-- ============================================================================

alter type estado_evaluacion add value if not exists 'no_evaluable' before 'cerrada';
