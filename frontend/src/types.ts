export type Categoria = 'ambiental' | 'social' | 'jurisdiccional_documental';

/** Tema ESG (coef_materialidad_tema.tema / normas.tema) — más fino que Categoria. */
export type TemaEsg =
  | 'agua'
  | 'uso_suelo'
  | 'sanidad'
  | 'biodiversidad'
  | 'derechos_laborales'
  | 'contaminacion'
  | 'comunidades_tierra'
  | 'salud_seguridad'
  | 'permisos_licencias'
  | 'cambio_climatico'
  | 'residuos'
  | 'etiquetado'
  | 'economia_circular'
  | 'requisitos_exportacion';

export type Banda = 'Bajo' | 'Medio' | 'Alto' | 'Crítico';

/** `no_aplica`: la norma es condicional_actividad y el cliente determinó que no le aplica. El motor la excluye del score (ni numerador ni denominador). */
export type Estatus = 'cumple' | 'parcial' | 'no_cumple' | 'desconocido' | 'no_aplica';

/** Tipo de aplicabilidad de una norma (normas.tipo_aplicabilidad). `condicional_perfil` ya viene filtrada por el RPC; solo `condicional_actividad` se pregunta en el cuestionario. */
export type TipoAplicabilidad = 'directa' | 'condicional_actividad' | 'condicional_perfil';

export type NivelConfianza = 'verificado' | 'autoreportado';

export type PerfilTamano = 'pyme' | 'mediana' | 'cotiza_bolsa' | 'multinacional';

export type MultaUnidad = 'UMA' | 'MXN' | 'PCT_INGRESOS';

export interface Sector {
  id: string;
  clave: string;
  nombre: string;
}

export type NivelJurisdiccion = 'internacional' | 'federal' | 'estatal' | 'municipal';

export interface Jurisdiccion {
  id: string;
  clave: string;
  nombre: string;
  nivel: NivelJurisdiccion;
  /** Tip cualitativo de riesgos ESG del estado (ej. estrés hídrico). No modula el score. */
  contexto_riesgo: string | null;
}

export interface NormaAplicable {
  norma_id: string;
  norma_clave: string;
  norma_titulo: string;
  categoria: Categoria;
  /** Tema ESG fino (normas.tema): agua, uso_suelo, sanidad… Lo expone el RPC `normas_aplicables` (migración 21/28). */
  tema: TemaEsg;
  pregunta_evaluacion: string;
  jurisdiccion: string;
  jurisdiccion_nivel: NivelJurisdiccion;
  tipo_aplicabilidad: TipoAplicabilidad;
  /** Solo presente cuando `tipo_aplicabilidad === 'condicional_actividad'`. */
  pregunta_aplicabilidad: string | null;
  /** Documentación de soporte típica para acreditar cumplimiento (normas.evidencia, migración 29/30). */
  evidencia: string | null;
}

/** Subsector agropecuario (clientes.subsector). Selecciona el perfil financiero FIRA junto con perfil_tamano. */
export type SubsectorAgro = 'ganaderia' | 'agricultura';

export interface ClienteInput {
  /** Número de cliente del banco (clientes.numero_cliente, UNIQUE). Clave de deduplicación: identifica al cliente entre evaluaciones. */
  numero_cliente: string;
  /**
   * ID interno del cliente cuando la evaluación se VINCULA a un cliente ya
   * existente (resuelto por `buscar-cliente` en el formulario). Ausente/`null`
   * cuando es un cliente nuevo: en ese caso `evaluar` crea la fila.
   */
  cliente_id?: string | null;
  nombre: string;
  sector_id: string;
  /** El estado donde opera el cliente (jurisdicciones.nivel = 'estatal'). Federal/internacional ya no se eligen: aplican automáticamente. */
  jurisdiccion_id: string;
  perfil_tamano: PerfilTamano;
  /** Ganadería / Agricultura. Elige el perfil financiero FIRA por subsector × tamaño. `null` en evaluaciones antiguas. */
  subsector: SubsectorAgro | null;
  es_exportador: boolean;
  /** El activo del cliente está en/cerca de una zona sensible o restringida (ANP, veda, etc.). Contexto cualitativo, no modula el score. */
  en_zona_riesgo: boolean;
  zona_riesgo_nota: string | null;
}

export interface RespuestaInput {
  norma_id: string;
  estatus: Estatus;
  nivel_confianza: NivelConfianza;
  documento_url: string | null;
}

export interface CanalResultado {
  score: number;
  banda: Banda;
  score_base: number;
  max_norma: number;
  forzado_por_descalificante: boolean;
  multiplicador_sistemico: number;
  factor_tamano: number;
}

export interface DetalleNorma {
  norma_clave: string;
  norma_titulo: string;
  categoria: Categoria;
  /** Más fino que `categoria` — para cruzar con coef_materialidad_tema. */
  tema: TemaEsg;
  fuente: string;
  fuente_url: string | null;
  estatus: Estatus;
  nivel_confianza: NivelConfianza;
  es_descalificante: boolean;
  riesgo_credito: number;
  peso_crediticio: number;
  riesgo_reputacion: number;
  peso_reputacional: number;
  gatilla_critico: boolean;
  multa_min: number | null;
  multa_max: number | null;
  multa_unidad: MultaUnidad | null;
  multa_nota: string | null;
}

export type EstadoEvaluacion = 'borrador' | 'completa' | 'cerrada';

export interface ExposicionDetalleNorma {
  norma_titulo: string;
  min_mxn: number;
  max_mxn: number;
}

export interface ExposicionNoCuantificable {
  norma_titulo: string;
  motivo: string;
}

/** Capa complementaria al score (pesos potenciales en riesgo). Nunca se suma al score ni a crédito/reputación. */
export interface Exposicion {
  exposicion_min_mxn: number;
  exposicion_max_mxn: number;
  valor_uma: number;
  detalle_cuantificable: ExposicionDetalleNorma[];
  no_cuantificables: ExposicionNoCuantificable[];
  hay_no_cuantificable: boolean;
}

export interface ResultadoEvaluacion {
  evaluacion_id: string;
  cliente_id: string;
  credito: CanalResultado;
  reputacion: CanalResultado;
  pct_autoreportado: number;
  categorias_en_riesgo: Categoria[];
  detalle: DetalleNorma[];
  estado: EstadoEvaluacion;
  cerrada_en?: string | null;
  cerrada_por?: string | null;
  exposicion: Exposicion;
  /** Resumen ejecutivo narrativo generado por IA (edge function `generar-narrativa`). `null` mientras no se genera. */
  resumen_ejecutivo?: string | null;
  resumen_generado_en?: string | null;
}

/** Sesión en memoria: una evaluación completa ligada al nombre del cliente. */
export interface EvaluacionSesion {
  id: string;
  cliente: ClienteInput;
  sectorNombre: string;
  jurisdiccionNombre: string;
  resultado: ResultadoEvaluacion;
  fecha: string;
}

/** Datos para reabrir el Cuestionario precargado al editar una evaluación existente. */
export interface EvaluacionParaEditar {
  evaluacion_id: string;
  cliente: ClienteInput;
  sectorNombre: string;
  jurisdiccionNombre: string;
  respuestas: RespuestaInput[];
}

// ---------------------------------------------------------------------------
// Simulador financiero (v2): capa de PROYECCIÓN sobre la evaluación, no parte
// del score. Traduce el riesgo regulatorio (ya calculado) en tres estados
// financieros seccionados, para una vista "actual" (mezcla real del cliente,
// el ancla) y tres escenarios de referencia uniformes (cumple/parcial/
// incumple). Nunca modula ni sustituye a `CanalResultado`/`Exposicion`.
// ---------------------------------------------------------------------------

export type VistaSimulada = 'actual' | 'cumple' | 'parcial' | 'incumple';

/** Supuestos financieros del cliente sobre los que corre el simulador (editables). */
export interface PerfilFinanciero {
  ingresos_anuales: number; // MXN
  margen_ebitda: number; // 0..1
  deuda_ebitda: number; // x veces — apalancamiento base
  tasa_interes: number; // 0..1
  capex_pct_ingresos: number; // 0..1 — CAPEX operativo normal (no el de cumplimiento)
  amortizacion_anios: number; // plazo de amortización de la deuda (para el DSCR)
  dias_cuentas_cobrar: number; // días del ciclo de efectivo (migración 32)
  dias_inventario: number;
  dias_cuentas_pagar: number;
}

export interface EstadoResultadosFinanciero {
  ingresos: number;
  ebitda: number; // ya neto de la pérdida operativa de la vista
  depreciacion: number; // incluye la del CAPEX de cumplimiento
  multa: number;
  intereses: number;
  utilidad_neta: number;
}

export interface BalanceGeneralFinanciero {
  activo_fijo: number;
  otros_activos: number; // circulante operativo: cuentas por cobrar + inventario
  activo_total: number;
  deuda: number; // deuda financiera (sin proveedores)
  cuentas_por_pagar: number; // crédito comercial de proveedores
  capital: number;
  pasivo_capital_total: number; // debe cuadrar con activo_total
}

export interface FlujoEfectivoFinanciero {
  flujo_operativo: number;
  flujo_inversion: number;
  flujo_financiamiento: number;
  flujo_neto: number;
}

export interface IndicadoresFinancieros {
  deuda_ebitda: number | null; // null = indefinido (EBITDA llegó a 0)
  cobertura_intereses: number | null; // ídem
  margen_operativo: number; // 0..1
  /** Debt Service Coverage Ratio = (EBITDA − impuestos) / (principal + intereses). null si EBITDA<=0. */
  dscr: number | null;
  /** DSCR bajo el mínimo bancable (~1.20x): requeriría respaldo de garantía FEGA de FIRA. */
  requiere_fega: boolean;
  /** Ciclo de conversión de efectivo en días: inventario + CxC − CxP, estresado por el daño ESG. */
  ciclo_conversion_efectivo: number;
  /** Capital de trabajo neto (MXN inmovilizados): (CxC + inventario) − CxP. */
  capital_trabajo_neto: number;
}

/** Un estado financiero completo para una vista (actual o un escenario de referencia). */
export interface VistaFinanciera {
  vista: VistaSimulada;
  capex_cumplimiento: number; // inversión para cumplir (>0 solo en 'cumple')
  impacto_operativo: number; // pérdida de EBITDA — canal operativo (0 en 'cumple')
  multa: number; // canal directo
  estado_resultados: EstadoResultadosFinanciero;
  balance: BalanceGeneralFinanciero;
  flujo: FlujoEfectivoFinanciero;
  indicadores: IndicadoresFinancieros;
}

/** Trazabilidad del perfil financiero FIRA usado (subsector × tamaño). */
export interface PerfilMeta {
  subsector: SubsectorAgro;
  perfil_tamano: string;
  /** Ej. "FIRA red de valor + comparables BMV", o "fallback (ganadería PyME)" si la consulta falló. */
  fuente: string;
}

/**
 * Auto-estructuración de deuda (goal seek del plazo) para un escenario de
 * decisión de crédito. Solo se calcula para Actual y Cumple. Traduce el DSCR
 * en un dictamen de bancabilidad: ya viable, viable reestructurando, o con
 * déficit de flujo (requiere respaldo FEGA).
 */
export interface EstructuraDeuda {
  /** DSCR al plazo del perfil (referencia). */
  dscr_base: number | null;
  /** ¿Ya bancable sin reestructurar? (DSCR ≥ 1.20). */
  bancable_base: boolean;
  /** Plazo (años) más corto que alcanza 1.20x; null si ninguno ≤ 10. */
  plazo_optimo: number | null;
  /** DSCR al plazo óptimo. */
  dscr_optimo: number | null;
  /** ¿Algún plazo ≤ 10 años lo vuelve bancable? */
  reestructurable: boolean;
  /** Faltante de flujo (MXN) para DSCR 1.20 al plazo máximo; 0 si no aplica. */
  deficit_flujo: number;
}

/** Categoría del scorecard de crédito PyME FIRA. `fuera_alcance` = corporativo. */
export type CategoriaCredito = 'A' | 'B' | 'C' | 'D' | 'bursatil' | 'fuera_alcance';

/**
 * Spread crediticio derivado por escenario: traduce el riesgo ESG y la
 * capacidad de pago (DSCR) a la sobretasa sobre TIIE que pagaría el cliente.
 * Es un scorecard, no una cotización. `aplica === false` para perfiles
 * corporativos, fuera del alcance del crédito PyME FIRA.
 */
export interface Spread {
  aplica: boolean;
  categoria: CategoriaCredito;
  /** Sobretasa sobre TIIE en puntos base. `null` si no aplica. */
  spread_pb: number | null;
  /** Misma sobretasa en %. `null` si no aplica. */
  spread_pct: number | null;
  /** TIIE base usada (%), para mostrar "TIIE + spread". */
  tiie: number;
  /** TIIE + spread, en %. `null` si no aplica. */
  tasa_total_pct: number | null;
  /** pb añadidos por fragilidad financiera (DSCR bajo el umbral); ya incluidos en `spread_pb`. */
  ajuste_financiero_pb: number;
  /** Racional del spread, o mensaje de alcance si `aplica === false`. */
  nota: string;
}

export interface SimulacionFinanciera {
  perfil_meta: PerfilMeta;
  /** Dictamen de estructuración de deuda para los dos escenarios de crédito. */
  estructura_deuda: { actual: EstructuraDeuda; cumple: EstructuraDeuda | null };
  /** Precio del crédito (spread sobre TIIE) por escenario. */
  spread: { actual: Spread; escenarios: Array<{ vista: VistaSimulada } & Spread> };
  actual: VistaFinanciera; // estado REAL del cliente — el ancla
  escenarios: VistaFinanciera[]; // [cumple, parcial, incumple] — referencias hipotéticas uniformes
  perfil_usado: PerfilFinanciero;
  /** Etiqueta de origen por parámetro: 'dato' | 'supuesto' | 'referencia_iso' | 'placeholder' | ... */
  origen_parametros: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Resumen de cartera (pantalla de Inicio). Agregados sobre la ÚLTIMA
// evaluación de cada cliente. Los devuelve la edge function `resumen-cartera`.
// ---------------------------------------------------------------------------

export interface DistribucionBanda {
  banda: Banda;
  clientes: number;
  /** Σ de la exposición regulatoria potencial (multa máxima) de los clientes en esa banda. */
  exposicion_mxn: number;
}

export interface VulnerabilidadTema {
  tema: TemaEsg;
  /** Nº de clientes cuya última evaluación tiene alguna norma de este tema en estatus `no_cumple`. */
  n_clientes: number;
  /** Nivel de materialidad del tema (`coef_materialidad_tema.banda`): 'critico' | 'alto' | 'medio' | 'bajo' | 'categorico' | null. */
  materialidad: string | null;
}

/** Pipeline de estructuración de crédito: cada cliente cae en exactamente un bucket. */
export interface PipelineCartera {
  viables: number;
  /** Subconjunto de `viables` con categoría de spread A (acceden al greenium). */
  con_greenium: number;
  viables_reestructura: number;
  requieren_fega: number;
  no_bancables: number;
  /** Perfiles corporativos, fuera del alcance del scorecard PyME FIRA. */
  fuera_alcance: number;
}

export interface ResumenCartera {
  total_clientes: number;
  total_evaluaciones: number;
  /** Σ de la exposición regulatoria potencial (multa máxima) de toda la cartera. */
  exposicion_total_mxn: number;
  /** Σ de esa exposición para los clientes cuya peor banda es Alto o Crítico. */
  valor_en_riesgo_mxn: number;
  distribucion: DistribucionBanda[];
  /** Temas ESG con más clientes en incumplimiento (`no_cumple`), top 3. */
  top_temas: VulnerabilidadTema[];
  pipeline: PipelineCartera;
}
