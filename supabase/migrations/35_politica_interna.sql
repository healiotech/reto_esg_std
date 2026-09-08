-- 1. Crear la nueva columna en la tabla 'normas'
ALTER TABLE normas ADD COLUMN IF NOT EXISTS politica_interna TEXT;

-- 2. Migrar los datos desde el archivo Excel
UPDATE normas SET politica_interna = CASE id
  WHEN '3c82c3b2-45e6-4df8-ba96-88fe616f5f7f' THEN 'Código General de Conducta; prevención del crimen financiero; anticorrupción; riesgos medioambientales y sociales.' -- Código Penal Federal
  WHEN '779ad5cd-442c-420c-b30b-95336f95ebd3' THEN 'Política de Banca Responsable y Sostenibilidad; Política de Gestión de Riesgos Medioambientales y Sociales; derechos humanos.' -- Constitución Política de los Estado Unidos Méxicanos
  WHEN 'f7f0f380-259e-438d-b9af-7ba2e936d57b' THEN 'Política de Gestión de Riesgos Medioambientales y Sociales; especial atención a impactos, biodiversidad y contaminación.' -- Ley General del Equilibrio Ecológico y la Protección al Ambiente
  WHEN 'cf16a02b-bb57-4e05-b6fc-af27ac155ebd' THEN 'Cumplimiento legal y fiscal del cliente; riesgo de crédito y legal; condiciones precedentes de financiamiento.' -- Ley Federal de Derechos
  WHEN 'd2a6bf53-2386-4b23-bee3-f08e0163967a' THEN 'Política de Gestión de Riesgos Medioambientales, Sociales y de Cambio Climático; Política de Banca Responsable y Sostenibilidad.' -- Ley de Aguas Nacionales
  WHEN '7089beac-e555-4746-bd90-ad00eeba8593' THEN 'Política de Gestión de Riesgos Medioambientales y Sociales; contaminación, residuos y economía circular.' -- Ley General para la Prevención y Gestión Integral de Residuos
  WHEN 'f983b34f-c916-4c07-aee5-91c6d89c5e69' THEN 'Banca Responsable; derechos humanos; cultura inclusiva; gestión de riesgos sociales y cadena de suministro.' -- Organización Internacional del Trabajo
  WHEN '7a947120-6299-4a36-aa01-939116207530' THEN 'Política de Gestión de Riesgos Medioambientales y Sociales; biodiversidad, deforestación y soft commodities.' -- Marco de Biodiversidad de Kumming-Montreal
  WHEN 'e4cbc3ee-baed-41e8-b643-101c02b81efe' THEN 'Política de Cultura Corporativa; Banca Responsable; diversidad, equidad e inclusión; inclusión financiera.' -- Plataforma de Beijing
  WHEN '3c6e0aea-e762-4fe3-8017-409b56424aaf' THEN 'Política de Gestión de Riesgos Medioambientales, Sociales y de Cambio Climático' -- Ley General de Desarrollo Forestal Sustentable
  WHEN 'ec3133c1-19e9-4794-af64-d580e340adae' THEN 'Política de Banca Responsable y Sostenibilidad; Política de Riesgos Medioambientales y Sociales; Net Zero 2050.' -- Ley General de Cambio Climático
  WHEN '10dc38a5-c71e-4c1f-8513-ba2f655258a4' THEN 'Gestión de riesgos medioambientales y sociales; due diligence y protección de garantías.' -- Ley Federal de Responsabilidad Ambiental
  WHEN '4a8c0dd7-5e7e-437b-bcee-b143fc5d5c3e' THEN 'Inclusión financiera; crecimiento inclusivo; soft commodities; desarrollo de comunidades y resiliencia.' -- Ley de Desarrollo Rural Sustentable
  WHEN '4df1f78f-84ee-446d-8fc4-7473deb824a2' THEN 'Política de Gestión de Riesgos Medioambientales y Sociales' -- ISO 14001
  WHEN 'da94b7be-94e2-4bb4-bc50-b80536be6384' THEN 'Derechos humanos; pueblos y comunidades; riesgo social, reasentamiento y tenencia de la tierra.' -- Ley Agraria
  WHEN 'c6b69d72-047b-439f-9722-b45f9a74b473' THEN 'Banca Responsable; Gestión de Riesgos Medioambientales y Sociales; ambición Net Zero 2050.' -- Acuerdo de París
  WHEN '0527ee2c-aaa3-4d8d-8f6b-e0a46579ac10' THEN 'Política de Banca Responsable y Sostenibilidad; derechos humanos; gestión de riesgos sociales.' -- Convención Americana sobre Derechos Humanos
  WHEN 'c4d4477d-6ca8-4722-8b64-cb5e46d4a926' THEN 'Política de Gestión de Riesgos Medioambientales, Sociales y de Cambio Climático' -- Ley General de Asentamientos Humanos, Ordenamiento Territorial y Desarrollo Urbano
  WHEN 'b88f8ee4-6750-4323-a994-8428fb863095' THEN 'Política de Banca Responsable y Sostenibilidad' -- Ley General de Economía Circular
  WHEN 'd0639b90-c2cf-41ec-812a-adb0c1692bf3' THEN 'Código General de Conducta ' -- Ley General de Sociedades Mercantiles
  WHEN '3b1c7820-69de-4e91-9fa2-4891d285b6de' THEN 'Política de Gestión de Riesgos Medioambientales, Sociales y de Cambio Climático' -- Ley General de Aguas
  WHEN '3b4826e2-17ee-4aa7-97f9-8765cdc32bb8' THEN 'Política de Banca Responsable y Sostenibilidad' -- Protocolo de Kioto
  WHEN '0ba95d37-20ff-41bd-a8d3-7a02253dd80f' THEN 'Riesgos ambientales y sociales; soft commodities; bienestar animal, bioseguridad y cadena de suministro.' -- Ley Federal de Sanidad Animal
  WHEN 'b1839c92-0e65-47bd-b0e6-57111375f067' THEN 'Política de Gestión de Riesgos Medioambientales y Sociales' -- NOM - 127 - SSA 1- 2021
  WHEN 'acde8b71-6440-4030-8474-5c083cc86c84' THEN 'Política de Banca Responsable y Sostenibilidad' -- Ley Federal  del Trabajo
  WHEN '8ea66ec0-974b-49b8-b468-cf84ea3a87fb' THEN 'Política de Gestión de Riesgos Medioambientales y de Cambio Climático; Política de Banca Responsable y Sostenibilidad' -- NOM - 001 - SEMARNAT - 2021
  WHEN 'e52d70b1-9665-432a-ab89-80b983073faf' THEN 'Política de Gestión de Riesgos Medioambientales y Sociales' -- NOM  - 015 - SEMARNAT/AGRICULTURA - 2023
  WHEN '8da59e3e-b7de-4654-9a43-e5253d96a6da' THEN 'Código General de Conducta' -- Ley del Mercado de Valores
  WHEN '2d829209-5dd0-4fd7-8469-a454e873682b' THEN 'Política de Banca Responsable y Sostenibilidad' -- Principios de Ecuador
  WHEN '03ee6035-60af-4aba-9ba0-0e035afd00f1' THEN 'Política de Gestión de Riesgos Medioambientales y Sociales' -- NOM - 052 - SEMARNAT - 2005
  ELSE politica_interna
END;