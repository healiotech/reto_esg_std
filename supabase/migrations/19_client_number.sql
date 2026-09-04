-- 1. Agregar la columna (permite nulos temporalmente por los datos que ya tienes)
ALTER TABLE clientes 
ADD COLUMN numero_cliente VARCHAR(50);

-- 2. Asegurar que no se puedan repetir números de cliente (evita duplicados)
ALTER TABLE clientes 
ADD CONSTRAINT clientes_numero_cliente_key UNIQUE (numero_cliente);

UPDATE clientes
SET numero_cliente = lpad(floor(random() * 99999999)::int::text, 8, '0')
WHERE numero_cliente IS NULL;