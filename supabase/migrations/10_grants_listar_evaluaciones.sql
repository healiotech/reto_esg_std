-- ============================================================================
--  Otorga a service_role el SELECT que faltaba sobre sectores/jurisdicciones.
--
--  Este proyecto no da por sentados los privilegios por defecto de
--  service_role sobre cada tabla — se otorgan explícitamente por tabla según
--  se van necesitando (ver 07/08/09_*.sql con v_riesgo_norma). Hasta ahora
--  ninguna edge function leía sectores/jurisdicciones directo: evaluar e
--  cerrar-evaluacion solo tocan clientes/evaluaciones/respuestas (que ya
--  tenían grant) más v_riesgo_norma/factores_tamano/bandas/
--  parametros_financieros. listar-evaluaciones y obtener-evaluacion-para-editar
--  son las primeras en hacer un embed de clientes -> sectores/jurisdicciones,
--  y fallaban con "permission denied for table jurisdicciones".
-- ============================================================================
grant select on sectores to service_role;
grant select on jurisdicciones to service_role;
