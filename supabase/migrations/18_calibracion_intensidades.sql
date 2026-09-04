-- ============================================================================
--  MIGRACIÓN 18 — Calibración de intensidades de escenario (deterioro EBITDA)
-- ----------------------------------------------------------------------------
--  Ajusta la fracción del impacto operativo que se materializa por escenario.
--  Antes eran placeholder (parcial 0.30, incumple 0.85) — el 0.85 llevaba el
--  EBITDA a negativo con demasiada facilidad (impacto >100% del EBITDA en casos
--  típicos, irreal).
--
--  Calibración: el impacto de un incumplimiento típico (pocas normas materiales)
--  cae dentro del rango de deterioro del EBITDA del 15-50% documentado para el
--  sector agroindustrial/ganadero mexicano (Expansión ESG / Global Green Growth
--  Institute, análisis de fiscalización reciente en México). El EBITDA negativo
--  se reserva para incumplimientos graves/extendidos (p.ej. pérdida de
--  certificación TIF/exportación, que "evapora más de la mitad del EBITDA").
--
--  Con estos valores: caso típico (4 normas materiales) → ~39% del EBITDA;
--  caso extremo (10 normas) → ~85%, cruzando a negativo con multas o pérdida
--  de certificación. "Permite negativo, pero estabiliza la penalización."
-- ============================================================================

update intensidad_escenario set intensidad = 0.00, origen = 'calibrado' where escenario = 'cumple';
update intensidad_escenario set intensidad = 0.13, origen = 'calibrado' where escenario = 'parcial';
update intensidad_escenario set intensidad = 0.30, origen = 'calibrado' where escenario = 'incumple';

-- Verificación
-- select escenario, intensidad, origen from intensidad_escenario order by intensidad;