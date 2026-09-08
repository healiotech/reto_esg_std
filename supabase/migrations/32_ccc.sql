-- 1. Añadir las nuevas columnas a la tabla existente
-- (Sustituye 'benchmark_financiero' por el nombre real de tu tabla)
ALTER TABLE perfil_financiero_agro
ADD COLUMN dias_cuentas_cobrar INTEGER,
ADD COLUMN dias_inventario INTEGER,
ADD COLUMN dias_cuentas_pagar INTEGER,
ADD COLUMN ciclo_conversion_efectivo INTEGER 
    GENERATED ALWAYS AS (dias_inventario + dias_cuentas_cobrar - dias_cuentas_pagar) STORED;

-- 2. Actualizar los registros de Ganadería
-- PyME: Sin poder de negociación, inventario lento.
UPDATE perfil_financiero_agro 
SET dias_cuentas_cobrar = 45, dias_inventario = 120, dias_cuentas_pagar = 30
WHERE subsector = 'ganaderia' AND perfil_tamano = 'pyme';

-- Mediana: Logística mejorada, algo de crédito comercial.
UPDATE perfil_financiero_agro
SET dias_cuentas_cobrar = 30, dias_inventario = 90, dias_cuentas_pagar = 45
WHERE subsector = 'ganaderia' AND perfil_tamano = 'mediana';

-- Cotiza en Bolsa: Alto poder sobre proveedores (pagan a 60 días), cobran rápido.
UPDATE perfil_financiero_agro 
SET dias_cuentas_cobrar = 15, dias_inventario = 60, dias_cuentas_pagar = 60
WHERE subsector = 'ganaderia' AND perfil_tamano = 'cotiza_bolsa';

-- 3. Actualizar los registros de Agricultura
-- PyME: Dependencia total de intermediarios, ciclo de cosecha largo.
UPDATE perfil_financiero_agro 
SET dias_cuentas_cobrar = 60, dias_inventario = 150, dias_cuentas_pagar = 30
WHERE subsector = 'agricultura' AND perfil_tamano = 'pyme';

-- Mediana: Ventas más directas a agroindustria, rotación moderada.
UPDATE perfil_financiero_agro 
SET dias_cuentas_cobrar = 45, dias_inventario = 120, dias_cuentas_pagar = 45
WHERE subsector = 'agricultura' AND perfil_tamano = 'mediana';

-- Cotiza en Bolsa: Agricultura por contrato, cadenas de suministro integradas.
UPDATE perfil_financiero_agro 
SET dias_cuentas_cobrar = 30, dias_inventario = 90, dias_cuentas_pagar = 60
WHERE subsector = 'agricultura' AND perfil_tamano = 'cotiza_bolsa';