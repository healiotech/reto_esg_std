UPDATE jurisdicciones AS j
SET 
    contexto_riesgo = v.contexto_riesgo,
    accionable = v.accionable
FROM (VALUES
    -- Campeche
    ('e3155a6c-e2ab-491e-86f0-c7705badba8c'::uuid, 'Estrés hídrico medio-bajo (1.0 a 2.0). Consumo 10%-20%. Efecto Climático (WRI): Inundación costera y eventos ciclónicos.', 'Verificar concesión vigente. Riesgo moderado; revisión documental estándar. Impacto Agro/Operativo: Pérdida de cultivos por anegamiento y daños a infraestructura logística.'),
    
    -- Aguascalientes
    ('a845ea73-b625-4448-bf42-d68b1cc052b3'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Sequía prolongada (Nivel Extremo).', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Ags: Estrés por sector automotriz. Auditar pozos profundos y esquemas de "cero descargas" industriales. Impacto Agro/Operativo: Estrés estructural para la ganadería y agricultura.'),
    
    -- Baja California
    ('3805f8d9-05ea-4956-b343-5f6e7858bc7c'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Sequía prolongada y calor extremo.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. BC: Dependencia del Río Colorado; monitorear recortes binacionales y plantas desalinizadoras. Impacto Agro/Operativo: Límite severo para expansión agrícola; alto costo de desalinización.'),
    
    -- Baja California Sur
    ('cab57558-ce7d-42a4-ade7-ccad58c198f3'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Mayor presión sobre acuíferos. Efecto Climático (WRI): Agotamiento crítico de acuíferos (Nivel Extremo).', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. BCS: Intrusión salina en acuíferos; verificar viabilidad hídrica en desarrollos turísticos. Impacto Agro/Operativo: Límite severo para expansión; intrusión salina.'),
    
    -- Coahuila
    ('745230cc-a920-473b-aeff-c82868b2c90e'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Sequía severa.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Coah: Sobredemanda por cuenca lechera; fiscalizar volúmenes de extracción forrajera. Impacto Agro/Operativo: Pérdida de hato ganadero y estrés en cultivos forrajeros.'),
    
    -- Colima
    ('7b95d752-1de2-44ab-b743-bbfc3b053abb'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Tormentas tropicales e inundaciones.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Impacto Agro/Operativo: Daños a plantaciones frutales y cierres logísticos.'),
    
    -- Chiapas
    ('aff55aab-7324-4040-8204-1145ee1e98ad'::uuid, 'Estrés hídrico bajo (0.0 a 1.0). Consumo <10%. Efecto Climático (WRI): Riesgo extremo de inundación y deslizamientos.', 'Riesgo bajo. Revisión documental estándar de concesión. Impacto Agro/Operativo: Pérdida de cosechas y aislamiento de rutas comerciales.'),
    
    -- Chihuahua
    ('3ff5af8f-c5fb-4e8d-85d4-ac0a9de57b57'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Sequía severa (Drought Risk, Nivel Alto).', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Chih: Conflicto Tratado 1944 (Río Bravo); alta presión por nogaleros y agroexportación. Impacto Agro/Operativo: Pérdida de hato ganadero por estiaje; recortes a distritos de riego.'),
    
    -- Ciudad de México
    ('d9185063-969f-48f7-a813-bddf1585981f'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Mayor presión sobre fuentes. Efecto Climático (WRI): Hundimiento y riesgo de inundación pluvial.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Impacto Agro/Operativo: Disrupción logística y cortes de suministro operativo.'),
    
    -- Durango
    ('1abbb3ab-e02f-49d1-97dc-f74d506dbae3'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Sequía severa y prolongada.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Dgo: Comarca Lagunera; monitorear concentración de arsénico por perforación profunda. Impacto Agro/Operativo: Afectación directa a ganadería extensiva y agricultura de temporal.'),
    
    -- Guanajuato
    ('743bcea5-b604-466a-8c08-094a7c1a483a'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Variabilidad interanual extrema (Nivel Extremo).', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Gto: Fuerte competencia agroindustria vs. manufactura. Monitorear abatimiento de acuíferos locales. Impacto Agro/Operativo: Riesgo alto en cultivos de riego; pozos abatidos.'),
    
    -- Guerrero
    ('948147bf-c436-4434-967c-5cb4e818131b'::uuid, 'Estrés hídrico bajo (0.0 a 1.0). Consumo <10%. Efecto Climático (WRI): Huracanes e inundación fluvial.', 'Riesgo bajo. Revisión documental estándar de concesión. Impacto Agro/Operativo: Daño catastrófico a infraestructura agropecuaria y turística.'),
    
    -- Hidalgo
    ('bd715478-d896-4e22-afee-b4fe1733c3e6'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Variabilidad estacional extrema y sequía.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Impacto Agro/Operativo: Mermas en rendimientos agrícolas por falta de agua superficial.'),
    
    -- Jalisco
    ('a3000000-0000-0000-0000-000000000000'::uuid, 'Estrés hídrico alto (3.0 a 4.0). Consumo 40%-80%. Efecto Climático (WRI): Variabilidad estacional media (Nivel Medio-Alto).', 'Validar concesión y consumos. Requerir plan de contingencia ante escasez. Impacto Agro/Operativo: Estrés temporal en temporada seca; alta competencia agroindustrial.'),
    
    -- Estado de México
    ('73118eb6-ec7a-4b87-a9b0-a40784eb32c7'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Variabilidad estacional y estrés superficial.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Impacto Agro/Operativo: Competencia por agua con zona metropolitana; paros operativos.'),
    
    -- Michoacán
    ('c455735f-a653-4fec-856c-3bdd245e881e'::uuid, 'Estrés hídrico alto (3.0 a 4.0). Consumo 40%-80%. Efecto Climático (WRI): Variabilidad estacional media.', 'Validar concesión y consumos. Requerir plan de contingencia ante escasez. Impacto Agro/Operativo: Estrés hídrico en huertas frutícolas (aguacate/berries) durante estiaje.'),
    
    -- Morelos
    ('503c6efa-a436-4a97-a287-3f2bad7fdf3e'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Variabilidad estacional.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Impacto Agro/Operativo: Estrés en cultivos intensivos y caña de azúcar.'),
    
    -- Nayarit
    ('77121595-ca20-455e-8ddb-9bc14b2d5584'::uuid, 'Estrés hídrico bajo (0.0 a 1.0). Consumo <10%. Efecto Climático (WRI): Inundaciones y huracanes.', 'Riesgo bajo. Revisión documental estándar de concesión. Impacto Agro/Operativo: Riesgo de anegamiento en valles agrícolas y daños a invernaderos.'),
    
    -- Nuevo León
    ('83d41fe0-6d7b-4ab0-ad80-5e61434aa0bc'::uuid, 'Estrés hídrico medio-alto (2.0 a 3.0). Consumo 20%-40%. Efecto Climático (WRI): Estrés superficial por presas vacías (Nivel Alto).', 'Revisar consumo vs. concesión. Monitorear clima. NL: Alta vulnerabilidad urbano-industrial; verificar abasto en Monterrey y cuotas privadas. Impacto Agro/Operativo: Paros operativos industriales por cuotas de racionamiento.'),
    
    -- Oaxaca
    ('04a0dd3f-0d1e-4a1f-8aad-1917ef24bcfb'::uuid, 'Estrés hídrico bajo (0.0 a 1.0). Consumo <10%. Efecto Climático (WRI): Sequía estacional y huracanes.', 'Riesgo bajo. Revisión documental estándar de concesión. Impacto Agro/Operativo: Alta vulnerabilidad en agricultura de temporal y daños costeros.'),
    
    -- Puebla
    ('91657349-0603-4e68-bf75-0c5ecd5fe292'::uuid, 'Estrés hídrico alto (3.0 a 4.0). Consumo 40%-80%. Efecto Climático (WRI): Variabilidad estacional y heladas.', 'Validar concesión y consumos. Requerir plan de contingencia ante escasez. Impacto Agro/Operativo: Pérdida de cultivos por eventos térmicos extremos y estiaje.'),
    
    -- Querétaro
    ('ff9ecf4c-3258-4c85-afec-93411937b7f3'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Sequía prolongada.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Qro: Presión por expansión industrial; requerir factibilidad hídrica en parques industriales (Acueducto). Impacto Agro/Operativo: Estrés estructural para agricultura y competencia industrial.'),
    
    -- Quintana Roo
    ('19733379-32e8-4e28-b0b3-30d7c9e239f3'::uuid, 'Estrés hídrico medio-bajo (1.0 a 2.0). Consumo 10%-20%. Efecto Climático (WRI): Huracanes e inundación costera.', 'Verificar concesión vigente. Riesgo moderado; revisión documental estándar. Impacto Agro/Operativo: Daño a infraestructura logística y turística.'),
    
    -- San Luis Potosí
    ('957f55b4-48a7-4736-9de5-2ee579900408'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Sequía severa.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. SLP: Estrés crítico en Altiplano; revisar pozos para abasto de grandes manufacturas. Impacto Agro/Operativo: Pérdida de productividad en zonas áridas y estrés hídrico industrial.'),
    
    -- Sinaloa
    ('a2000000-0000-0000-0000-000000000000'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Sequía severa y variabilidad extrema.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Sin: Agricultura intensiva; monitorear niveles de presas y cuotas en distritos de riego. Impacto Agro/Operativo: Reducción drástica de cuotas en distritos de riego para agricultura intensiva.'),
    
    -- Sonora
    ('a1000000-0000-0000-0000-000000000000'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Sequía severa y calor extremo.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Son: Alta demanda agrícola; revisar pozos y derechos en Valle del Yaqui/Mayo. Impacto Agro/Operativo: Alta mortalidad ganadera y recortes críticos en valles agrícolas.'),
    
    -- Tabasco
    ('a5000000-0000-0000-0000-000000000000'::uuid, 'Estrés hídrico bajo (0.0 a 1.0). Consumo <10%. Efecto Climático (WRI): Riesgo extremo de inundación (Nivel Bajo estrés, alto clima).', 'Riesgo bajo. Revisión documental estándar de concesión. Impacto Agro/Operativo: Disrupción de cadenas de suministro; pérdida total de cosechas por desbordes.'),
    
    -- Tamaulipas
    ('458ce57e-b07c-42bb-8bc4-a83f1c41166c'::uuid, 'Estrés hídrico alto (3.0 a 4.0). Consumo 40%-80%. Efecto Climático (WRI): Sequía severa y huracanes.', 'Validar concesión y consumos. Requerir plan de contingencia ante escasez. Tamps: Tensión en frontera; impacto por entregas del Tratado de Agua 1944. Impacto Agro/Operativo: Estrés hídrico en agricultura fronteriza y daños por ciclones.'),
    
    -- Tlaxcala
    ('a4608356-a2a8-41de-be8f-b99b89d66b81'::uuid, 'Estrés hídrico alto (3.0 a 4.0). Consumo 40%-80%. Efecto Climático (WRI): Variabilidad estacional y heladas.', 'Validar concesión y consumos. Requerir plan de contingencia ante escasez. Impacto Agro/Operativo: Mermas en agricultura de temporal.'),
    
    -- Veracruz
    ('e001237f-8c75-4e45-831a-d349c5958cc9'::uuid, 'Estrés hídrico medio-bajo (1.0 a 2.0). Consumo 10%-20%. Efecto Climático (WRI): Inundación fluvial y costera (Nivel Bajo estrés, alto clima).', 'Verificar concesión vigente. Riesgo moderado; revisión documental estándar. Impacto Agro/Operativo: Pérdida de cultivos por anegamiento; daño a infraestructura.'),
    
    -- Yucatán
    ('465e8e8f-892b-441d-a97b-45e38ad4e53a'::uuid, 'Estrés hídrico medio-bajo (1.0 a 2.0). Consumo 10%-20%. Efecto Climático (WRI): Huracanes y vulnerabilidad del manto freático.', 'Verificar concesión vigente. Riesgo moderado; revisión documental estándar. Impacto Agro/Operativo: Contaminación de acuíferos tras inundaciones; daño eólico.'),
    
    -- Zacatecas
    ('9f00ad79-869c-44ca-84c9-63359b19e244'::uuid, 'Estrés hídrico extremadamente alto (4.0 a 5.0). Consumo >80% de reservas renovables. Efecto Climático (WRI): Sequía prolongada y severa.', 'Validar concesión (CONAGUA) y plan de reúso. Alto riesgo operativo. Zac: Sobreexplotación combinada minería/agricultura; auditoría estricta de extracciones. Impacto Agro/Operativo: Afectación profunda a ganadería y agricultura de temporal.')
) AS v(id, contexto_riesgo, accionable)
WHERE j.id = v.id;