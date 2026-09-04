-- ============================================================================
--  Columnas de persistencia del resultado en evaluaciones.
--
--  evaluar/index.ts (v2) ya hace, al terminar de calcular:
--    update evaluaciones set resultado = ..., snapshot_parametros = ...,
--                            calculado_en = ..., estado = 'completa'
--
--  01_esquema_riesgo.sql define `snapshot jsonb` con este mismo propósito
--  (freeze de parámetros al cerrar), pero con otro nombre. Verificado por
--  introspección contra el proyecto vinculado: la base viva NO tiene columna
--  `snapshot` — solo `snapshot_parametros`, ya poblada por evaluar v2. No
--  hubo nunca una columna huérfana ahí que renombrar en producción.
--
--  El rename de abajo es condicional a propósito: cubre el caso de un
--  entorno nuevo que corrió 01_esquema_riesgo.sql tal cual (tendría
--  `snapshot`, no `snapshot_parametros`) sin romper contra el estado real
--  de la base viva, donde el rename no aplica y solo falta agregar columnas.
-- ============================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'evaluaciones' and column_name = 'snapshot'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'evaluaciones' and column_name = 'snapshot_parametros'
  ) then
    alter table evaluaciones rename column snapshot to snapshot_parametros;
  end if;
end $$;

alter table evaluaciones
  add column if not exists snapshot_parametros jsonb,
  add column if not exists resultado jsonb,
  add column if not exists calculado_en timestamptz;
