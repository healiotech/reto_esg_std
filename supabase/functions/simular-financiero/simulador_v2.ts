// ============================================================================
//  SIMULADOR FINANCIERO v2 — Estados financieros seccionados + CAPEX cumplimiento
//  Determinista. Capa complementaria (no modifica el score). Estimación.
//
//  NOVEDADES vs v1:
//   · "ACTUAL": estado real del cliente (mezcla heterogénea de sus respuestas),
//     calculado con el factor_incumplimiento REAL de cada norma. Es el ancla.
//   · Tres escenarios de REFERENCIA (cumple/parcial/incumple): hipótesis
//     uniformes que delimitan el espectro donde ubicar al "Actual".
//   · CAPEX DE CUMPLIMIENTO: cumplir cuesta. Se deriva de la consecuencia
//     ("consecuencia invertida"): CAPEX = 60% de la consecuencia esperada.
//     Se financia 75% deuda / 25% capital, se deprecia a 10 años.
//   · Tres estados financieros SECCIONADOS: Estado de Resultados, Balance
//     General y Flujo de Efectivo (operativo/inversión/financiamiento).
//
//  Lógica del trade-off (todo honesto, sin ocultar costos):
//   · CUMPLE  → invierte CAPEX: +activo fijo, +deuda, +depreciación, +intereses;
//               PERO sin multa ni pérdida operativa. Cumplir NO es gratis.
//   · INCUMPLE→ no invierte: sin CAPEX; PERO multa + pérdida operativa (EBITDA).
//   · PARCIAL → fracción de ambos.
//   · ACTUAL  → la mezcla real: por norma, según su factor_incumplimiento.
// ============================================================================

// --- Curva de severidad ISO 31000 (impacto 1-2-4-8-16 normalizado) -----------
export const CURVA_SEVERIDAD_ISO: Record<number, number> = {
  1: 0.06, 2: 0.13, 3: 0.25, 4: 0.50, 5: 1.00,
};

// --- Parámetros del CAPEX de cumplimiento (criterio de finanzas) --------------
export const CAPEX_PARAMS = {
  factor_consecuencia: 0.60,   // CAPEX cumplir = 60% de la consecuencia esperada
  pct_deuda: 0.75,             // financiamiento: 75% deuda
  pct_capital: 0.25,           // 25% capital propio
  anios_depreciacion: 10,      // depreciación lineal
};

export interface PerfilFinanciero {
  ingresos_anuales: number;
  margen_ebitda: number;
  deuda_ebitda: number;        // apalancamiento base → define deuda inicial
  tasa_interes: number;
  capex_pct_ingresos: number;  // CAPEX operativo normal (no el de cumplimiento)
  amortizacion_anios: number;  // plazo de amortización de la deuda (para el DSCR)
}

// Fallback = perfil GANADERÍA PyME (FIRA). Ya no es un placeholder inventado:
// deriva de la estructura FIRA por red de valor + comparables BMV.
// La edge function selecciona el perfil real por subsector × tamaño desde la BD;
// este es solo el respaldo si la consulta falla.
export const PERFIL_BASE_AGRO_PLACEHOLDER: PerfilFinanciero = {
  ingresos_anuales: 50_000_000, margen_ebitda: 0.12, deuda_ebitda: 3.1,
  tasa_interes: 0.13, capex_pct_ingresos: 0.08, amortizacion_anios: 5,
};

export const INTENSIDAD_ESCENARIO_PLACEHOLDER = {
  cumple: 0.0, parcial: 0.30, incumple: 0.85,
};

export interface FilaSimulacion {
  norma_titulo: string;
  tema: string;
  severidad: number;
  factor_incumplimiento: number;   // REAL (para el "Actual")
  multa_esperada_mxn: number;      // canal directo (multa)
}

export type Vista = "actual" | "cumple" | "parcial" | "incumple";

// --- Estados financieros seccionados -----------------------------------------
export interface EstadoResultados {
  ingresos: number;
  ebitda: number;                 // ya neto de pérdida operativa del escenario
  depreciacion: number;           // incluye la del CAPEX de cumplimiento
  multa: number;                  // gasto extraordinario
  intereses: number;
  utilidad_neta: number;
}
export interface BalanceGeneral {
  activo_fijo: number;            // sube con el CAPEX de cumplimiento
  otros_activos: number;
  activo_total: number;
  deuda: number;                  // sube con el financiamiento del CAPEX
  capital: number;                // baja con pérdidas / aporte 25% del CAPEX
  pasivo_capital_total: number;
}
export interface FlujoEfectivo {
  flujo_operativo: number;        // EBITDA - intereses - multa (aprox)
  flujo_inversion: number;        // -CAPEX de cumplimiento
  flujo_financiamiento: number;   // +deuda nueva del CAPEX
  flujo_neto: number;
}
export interface Indicadores {
  deuda_ebitda: number | null;    // null = indefinido (EBITDA<=0)
  cobertura_intereses: number | null;
  margen_operativo: number;
  dscr: number | null;            // (EBITDA − impuestos aprox) / (principal + intereses)
  requiere_fega: boolean;         // DSCR bajo el mínimo bancable (~1.20x)
}
export interface ResultadoVista {
  vista: Vista;
  capex_cumplimiento: number;     // inversión para cumplir (0 en incumple)
  impacto_operativo: number;      // pérdida de EBITDA (0 en cumple)
  multa: number;                  // canal directo
  estado_resultados: EstadoResultados;
  balance: BalanceGeneral;
  flujo: FlujoEfectivo;
  indicadores: Indicadores;
}

export interface ResultadoSimulacionV2 {
  actual: ResultadoVista;
  escenarios: ResultadoVista[];   // cumple, parcial, incumple (referencias)
  perfil_usado: PerfilFinanciero;
  origen_parametros: Record<string, string>;
}

// ----------------------------------------------------------------------------
//  Construye una vista completa (estados financieros) dado:
//   · impactoOperativo: pérdida de EBITDA (canal operativo)
//   · multa: canal directo
//   · capexCumplimiento: inversión para cumplir (mutuamente excluyente con daño)
// ----------------------------------------------------------------------------
function construirVista(
  vista: Vista,
  perfil: PerfilFinanciero,
  impactoOperativo: number,
  multa: number,
  capexCumplimiento: number,
): ResultadoVista {
  const ingresos = perfil.ingresos_anuales;
  const ebitdaBase = perfil.margen_ebitda * ingresos;
  const deudaBase = ebitdaBase * perfil.deuda_ebitda;

  // EBITDA ajustado por pérdida operativa (canal operativo).
  // SIN piso en cero: una pérdida operativa PUEDE volver el EBITDA negativo,
  // sobre todo en PyMES donde los costos fijos se comen la operación. Un EBITDA
  // negativo es información honesta (pérdida operativa), no un error a ocultar.
  const ebitda = ebitdaBase - impactoOperativo;

  // CAPEX de cumplimiento: 75% deuda, 25% capital; se deprecia a 10 años.
  const deudaNueva = capexCumplimiento * CAPEX_PARAMS.pct_deuda;
  const aporteCapital = capexCumplimiento * CAPEX_PARAMS.pct_capital;
  const deprecCapex = capexCumplimiento / CAPEX_PARAMS.anios_depreciacion;

  // Depreciación base (del CAPEX operativo normal) + la del CAPEX de cumplimiento.
  const deprecBase = (perfil.capex_pct_ingresos * ingresos) / CAPEX_PARAMS.anios_depreciacion;
  const depreciacion = deprecBase + deprecCapex;

  const deudaTotal = deudaBase + deudaNueva;
  const intereses = deudaTotal * perfil.tasa_interes;

  // --- Estado de Resultados ---
  const utilidadNeta = ebitda - depreciacion - multa - intereses;
  const estado_resultados: EstadoResultados = {
    ingresos: Math.round(ingresos),
    ebitda: Math.round(ebitda),
    depreciacion: Math.round(depreciacion),
    multa: Math.round(multa),
    intereses: Math.round(intereses),
    utilidad_neta: Math.round(utilidadNeta),
  };

  // --- Balance General ---
  // Activo fijo base (aprox = deuda base como proxy de capital instalado) + CAPEX.
  const activoFijoBase = deudaBase; // simplificación: activo instalado ~ deuda base
  // Circulante (proxy). La MULTA sale de caja → reduce este activo, además de
  // erosionar capital. Así el balance cuadra (Activo = Pasivo + Capital):
  // la multa baja AMBOS lados (sale caja, se registra la pérdida).
  const otrosActivos = ebitdaBase * 0.5 - multa;
  const activoFijo = activoFijoBase + capexCumplimiento;
  const activoTotal = activoFijo + otrosActivos;
  // Capital = capital base + aporte propio del CAPEX (25%) − pérdida por multa.
  const capitalBase = (activoFijoBase + ebitdaBase * 0.5) - deudaBase;
  const capital = capitalBase + aporteCapital - multa;
  const balance: BalanceGeneral = {
    activo_fijo: Math.round(activoFijo),
    otros_activos: Math.round(otrosActivos),
    activo_total: Math.round(activoTotal),
    deuda: Math.round(deudaTotal),
    capital: Math.round(capital),
    pasivo_capital_total: Math.round(deudaTotal + capital),
  };

  // --- Flujo de Efectivo (seccionado) ---
  const flujoOperativo = ebitda - intereses - multa;
  const flujoInversion = -capexCumplimiento;
  const flujoFinanciamiento = deudaNueva; // entra la deuda que financia el CAPEX
  const flujoNeto = flujoOperativo + flujoInversion + flujoFinanciamiento;
  const flujo: FlujoEfectivo = {
    flujo_operativo: Math.round(flujoOperativo),
    flujo_inversion: Math.round(flujoInversion),
    flujo_financiamiento: Math.round(flujoFinanciamiento),
    flujo_neto: Math.round(flujoNeto),
  };

  // --- Indicadores ---
  // deuda_ebitda / cobertura: se calculan normal aunque el EBITDA sea NEGATIVO
  // (el resultado negativo es informativo: señala pérdida operativa). Solo se
  // devuelve null cuando el EBITDA es EXACTAMENTE 0 (división por cero real).
  //
  // DSCR (Debt Service Coverage Ratio) = (EBITDA − impuestos) / servicio de deuda,
  // donde servicio de deuda = principal (amortización anual) + intereses.
  // Es EL ratio de decisión de crédito. Umbral bancable ~1.20x (FIRA); por debajo,
  // una PyME requeriría respaldo de garantía FEGA para ser sujeto de crédito.
  //
  // Estructura de deuda agropecuaria: solo la porción REFACCIONARIA (largo plazo,
  // 40%) amortiza principal. El 60% restante es crédito de AVÍO revolvente —
  // capital de trabajo que se refinancia cada ciclo, no se amortiza (solo paga
  // intereses). Amortizar toda la deuda sobreestimaría el servicio y subvaluaría
  // el DSCR. Esta mezcla lo alinea con el rango FIRA (~1.10–1.25x PyME).
  const PCT_DEUDA_REFACCIONARIA = 0.40;
  const deudaRefaccionaria = deudaTotal * PCT_DEUDA_REFACCIONARIA;
  const principalAnual = perfil.amortizacion_anios > 0
    ? deudaRefaccionaria / perfil.amortizacion_anios : 0;
  const servicioDeuda = principalAnual + intereses;
  // Impuestos aprox: 30% (ISR MX) sobre utilidad antes de impuestos si es positiva.
  const utilidadAntesImp = ebitda - depreciacion - multa - intereses;
  const impuestos = utilidadAntesImp > 0 ? utilidadAntesImp * 0.30 : 0;
  const dscr = servicioDeuda > 0
    ? +(((ebitda - impuestos) / servicioDeuda)).toFixed(2) : null;
  const UMBRAL_FEGA = 1.20;

  const indicadores: Indicadores = {
    deuda_ebitda: ebitda !== 0 ? +(deudaTotal / ebitda).toFixed(2) : null,
    cobertura_intereses: intereses > 0
      ? +(ebitda / intereses).toFixed(2)   // negativo si EBITDA<0: no cubre intereses
      : null,
    margen_operativo: +(ebitda / ingresos).toFixed(4),
    dscr,
    // requiere FEGA si el DSCR cae bajo el umbral bancable (y es calculable).
    requiere_fega: dscr !== null && dscr < UMBRAL_FEGA,
  };

  return {
    vista,
    capex_cumplimiento: Math.round(capexCumplimiento),
    impacto_operativo: Math.round(impactoOperativo),
    multa: Math.round(multa),
    estado_resultados, balance, flujo, indicadores,
  };
}

// ----------------------------------------------------------------------------
//  Calcula, para un conjunto de normas y un "peso de materialización" por norma,
//  el impacto operativo, la multa y el CAPEX de cumplimiento agregados.
//
//  peso(f) = cuánto se materializa el incumplimiento de esa norma [0..1].
//    · escenarios uniformes: peso = intensidad del escenario (igual para todas)
//    · "actual": peso = factor_incumplimiento real de cada norma (heterogéneo)
// ----------------------------------------------------------------------------
function agregar(
  filas: FilaSimulacion[],
  coefMaterialidad: Record<string, number>,
  ebitdaBase: number,
  peso: (f: FilaSimulacion) => number,
  esCumple: boolean,
) {
  let impactoOperativo = 0;
  let multa = 0;
  let consecuenciaTotal = 0; // para derivar el CAPEX de cumplimiento

  for (const f of filas) {
    const w = peso(f);
    const coef = coefMaterialidad[f.tema] ?? 0;
    const curva = CURVA_SEVERIDAD_ISO[f.severidad] ?? 0;

    // Consecuencia potencial "plena" de esta norma (operativa + multa),
    // usada tanto para el daño (si incumple) como para derivar el CAPEX (si cumple).
    const opPleno = ebitdaBase * coef * curva;
    const multaPlena = f.multa_esperada_mxn;
    consecuenciaTotal += opPleno + multaPlena;

    if (!esCumple) {
      // Escenario de daño: se materializa según el peso.
      impactoOperativo += opPleno * w;
      multa += multaPlena * w;
    }
  }

  // CAPEX de cumplimiento: solo en "cumple" (invierte para evitar TODA la
  // consecuencia). Deriva de la consecuencia total: 60% de ella.
  const capex = esCumple ? consecuenciaTotal * CAPEX_PARAMS.factor_consecuencia : 0;

  return { impactoOperativo, multa, capex };
}

export function simularV2(
  filas: FilaSimulacion[],
  coefMaterialidad: Record<string, number>,
  perfil: PerfilFinanciero = PERFIL_BASE_AGRO_PLACEHOLDER,
  intensidad = INTENSIDAD_ESCENARIO_PLACEHOLDER,
): ResultadoSimulacionV2 {
  const ebitdaBase = perfil.margen_ebitda * perfil.ingresos_anuales;

  // --- ACTUAL: mezcla real, peso = factor_incumplimiento de cada norma ---
  const act = agregar(filas, coefMaterialidad, ebitdaBase,
    (f) => f.factor_incumplimiento, false);
  const actual = construirVista("actual", perfil, act.impactoOperativo, act.multa, 0);

  // --- Escenarios de referencia (uniformes) ---
  const escenarios: ResultadoVista[] = (["cumple","parcial","incumple"] as Vista[]).map((esc) => {
    const esCumple = esc === "cumple";
    const w = (intensidad as any)[esc] as number;
    const agg = agregar(filas, coefMaterialidad, ebitdaBase, () => w, esCumple);
    return construirVista(esc, perfil, agg.impactoOperativo, agg.multa, agg.capex);
  });

  return {
    actual,
    escenarios,
    perfil_usado: perfil,
    origen_parametros: {
      curva_severidad: "referencia_iso",
      coef_materialidad: "supuesto",
      capex_cumplimiento: "derivado_consecuencia_60pct",
      financiamiento_capex: "supuesto_75_25",
      perfil_base: "placeholder",
      intensidad_escenario: "placeholder",
    },
  };
}

// ============================================================================
//  AUTO-ESTRUCTURACIÓN DE DEUDA (goal seek) + DÉFICIT DE FLUJO
// ----------------------------------------------------------------------------
//  Responde la pregunta de crédito: dado un escenario cuyo DSCR está bajo el
//  mínimo bancable (1.20x), ¿existe un plazo de amortización que lo vuelva
//  bancable? Si sí → propone el plazo (app como asesor). Si no → cuantifica el
//  déficit de flujo (cuánto le falta para ser bancable) → requeriría FEGA.
//
//  El DSCR depende del plazo solo vía el principal anual (deuda refaccionaria /
//  plazo). Recalculamos el DSCR variando el plazo, con el resto de la vista fijo.
//  Determinista, ~8 iteraciones. No altera los indicadores existentes.
// ============================================================================

const UMBRAL_BANCABLE = 1.20;
const PLAZO_MIN = 3;
const PLAZO_MAX = 10;

export interface EstructuraDeuda {
  dscr_base: number | null;        // DSCR al plazo del perfil (referencia)
  bancable_base: boolean;          // ¿ya bancable sin reestructurar?
  plazo_optimo: number | null;     // plazo (años) que alcanza 1.20x; null si ninguno
  dscr_optimo: number | null;      // DSCR al plazo óptimo
  reestructurable: boolean;        // ¿algún plazo ≤ MAX lo vuelve bancable?
  deficit_flujo: number;           // faltante de flujo para DSCR 1.20 (0 si bancable)
}

// Recalcula el DSCR de una vista para un plazo de amortización dado.
function dscrParaPlazo(v: ResultadoVista, perfil: PerfilFinanciero, plazoAnios: number): number | null {
  const er = v.estado_resultados;
  const ebitda = er.ebitda;
  const deudaTotal = v.balance.deuda;
  const intereses = er.intereses;
  // Mismo modelo que el motor: solo el 40% (refaccionaria) amortiza.
  const deudaRefaccionaria = deudaTotal * 0.40;
  const principalAnual = plazoAnios > 0 ? deudaRefaccionaria / plazoAnios : 0;
  const servicioDeuda = principalAnual + intereses;
  // Impuestos aprox 30% sobre utilidad antes de impuestos positiva (igual que el motor).
  const utilidadAntesImp = ebitda - er.depreciacion - er.multa - intereses;
  const impuestos = utilidadAntesImp > 0 ? utilidadAntesImp * 0.30 : 0;
  return servicioDeuda > 0 ? +(((ebitda - impuestos) / servicioDeuda)).toFixed(2) : null;
}

export function estructurarDeuda(v: ResultadoVista, perfil: PerfilFinanciero): EstructuraDeuda {
  const dscrBase = v.indicadores.dscr;
  const bancableBase = dscrBase !== null && dscrBase >= UMBRAL_BANCABLE;

  // Goal seek: busca el plazo MÁS CORTO que alcanza el umbral (plazo corto es
  // preferible para el banco; más plazo = más riesgo de tasa/duración).
  let plazoOptimo: number | null = null;
  let dscrOptimo: number | null = null;
  if (!bancableBase) {
    for (let p = PLAZO_MIN; p <= PLAZO_MAX; p++) {
      const d = dscrParaPlazo(v, perfil, p);
      if (d !== null && d >= UMBRAL_BANCABLE) {
        plazoOptimo = p; dscrOptimo = d; break;
      }
    }
  }
  const reestructurable = plazoOptimo !== null;

  // Déficit de flujo: cuánto flujo (EBITDA − impuestos) le falta para que, al
  // plazo MÁXIMO (el más favorable), el DSCR llegue a 1.20. Solo relevante si
  // NO es reestructurable (ni al plazo máximo alcanza).
  let deficit = 0;
  if (!bancableBase && !reestructurable) {
    const er = v.estado_resultados;
    const deudaRef = v.balance.deuda * 0.40;
    const principalMax = PLAZO_MAX > 0 ? deudaRef / PLAZO_MAX : 0;
    const servicioMin = principalMax + er.intereses; // servicio al plazo más largo
    const utilidadAntesImp = er.ebitda - er.depreciacion - er.multa - er.intereses;
    const impuestos = utilidadAntesImp > 0 ? utilidadAntesImp * 0.30 : 0;
    const flujoDisponible = er.ebitda - impuestos;
    // Flujo necesario para DSCR 1.20 al plazo más largo:
    const flujoNecesario = servicioMin * UMBRAL_BANCABLE;
    deficit = Math.max(0, Math.round(flujoNecesario - flujoDisponible));
  }

  return {
    dscr_base: dscrBase,
    bancable_base: bancableBase,
    plazo_optimo: plazoOptimo,
    dscr_optimo: dscrOptimo,
    reestructurable,
    deficit_flujo: deficit,
  };
}

// ============================================================================
//  SCORECARD DE SPREAD CREDITICIO — riesgo ESG → precio del crédito (pb sobre TIIE)
// ----------------------------------------------------------------------------
//  Deriva el sobreprecio (spread) que un banco cobraría, como función del riesgo
//  ESG del cliente Y su salud financiera. NO es una PD econométrica (no hay datos
//  históricos de default para calibrarla): es un SCORECARD transparente, como el
//  que un banco usa para PyMEs — mapea a categoría de riesgo y asigna spread.
//
//  ALCANCE: solo PyME y mediana (crédito FIRA). Un corporativo que cotiza se
//  fondea vía mercado de capitales (TIIE+1.25% quirografario), no con crédito
//  PyME FIRA — el scorecard no aplica y se marca fuera de alcance.
//
//  Dos ejes:
//   1. Score ESG (banda de riesgo) → categoría A/B/C/D → spread ESG base.
//   2. Ajuste financiero: si el DSCR está bajo el mínimo bancable, sube el spread
//      (un cliente que cumple ESG pero no puede servir su deuda paga más).
//
//  Anclas (fuente): base PyME TIIE+5.5% (FIRA); castigo ESG +200 a +400 pb
//  (Expansión ESG / GGGI: "incumplimiento ambiental detona 200-400 pb").
//  Greenium (premio) para el cliente blindado (finanzas sostenibles).
// ============================================================================

export type CategoriaCredito = "A" | "B" | "C" | "D" | "fuera_alcance";

export interface Spread {
  aplica: boolean;                 // false para corporativo (fuera de alcance)
  categoria: CategoriaCredito;
  spread_pb: number | null;        // sobretasa sobre TIIE, en puntos base
  spread_pct: number | null;       // misma sobretasa en %
  tiie: number;                    // TIIE base usada (para mostrar TIIE + spread)
  tasa_total_pct: number | null;   // TIIE + spread, en %
  ajuste_financiero_pb: number;    // pb añadidos por fragilidad financiera (DSCR bajo)
  nota: string;                    // racional / mensaje de alcance
}

const TIIE_FONDEO = 6.75; // TIIE fondeo vigente (%). Editable si cambia.
const UMBRAL_BANCABLE_SPREAD = 1.20;

// Spread base por categoría ESG (PyME FIRA). En puntos base sobre TIIE.
// A = greenium (bajo la base); B = base PyME; C/D = castigo ESG (ancla Expansión).
function spreadBasePorBanda(banda: string): { cat: CategoriaCredito; pb: number; nota: string } {
  const b = banda.toLowerCase();
  if (b === "bajo")   return { cat: "A", pb: 400,  nota: "Riesgo bajo. Premio (greenium): empresa blindada, menor pérdida esperada, tasa preferencial." };
  if (b === "medio")  return { cat: "B", pb: 550,  nota: "Riesgo medio. Tasa base PyME FIRA: áreas de mejora sin riesgo inminente de paro operativo." };
  if (b === "alto")   return { cat: "C", pb: 750,  nota: "Riesgo alto. Castigo ESG (+200 pb): mayor probabilidad de multas que merman la liquidez." };
  // crítico
  return { cat: "D", pb: 950, nota: "Riesgo crítico. Castigo máximo (+400 pb): riesgo binario (clausura, pérdida de certificación). Estructurar con FEGA o rechazar." };
}

export function calcularSpread(
  bandaRiesgoGeneral: string,      // banda del nivel general (peor de crédito/reputación)
  dscr: number | null,             // DSCR del escenario
  perfilTamano: string,            // 'pyme' | 'mediana' | 'cotiza_bolsa'
): Spread {
  // Fuera de alcance: corporativo que cotiza.
  if (perfilTamano === "cotiza_bolsa" || perfilTamano === "multinacional") {
    return {
      aplica: false, categoria: "fuera_alcance", spread_pb: null, spread_pct: null,
      tiie: TIIE_FONDEO, tasa_total_pct: null, ajuste_financiero_pb: 0,
      nota: "Perfil corporativo: fondeo vía mercado de capitales (emisión bursátil). El scorecard de crédito PyME FIRA no aplica a este tamaño.",
    };
  }

  const base = spreadBasePorBanda(bandaRiesgoGeneral);

  // Ajuste financiero: si el DSCR está bajo el umbral bancable (o es negativo),
  // el cliente es más riesgoso de lo que su ESG sugiere → +150 pb.
  // Un cliente con buen ESG pero que no puede servir su deuda no merece tasa preferencial.
  const dscrDebil = dscr === null || dscr < UMBRAL_BANCABLE_SPREAD;
  const ajusteFin = dscrDebil ? 150 : 0;

  const spreadPb = base.pb + ajusteFin;
  const spreadPct = +(spreadPb / 100).toFixed(2);
  const tasaTotal = +(TIIE_FONDEO + spreadPct).toFixed(2);

  let nota = base.nota;
  if (ajusteFin > 0) {
    nota += " Ajuste por servicio de deuda ajustado (DSCR bajo el mínimo bancable): +150 pb.";
  }

  return {
    aplica: true,
    categoria: base.cat,
    spread_pb: spreadPb,
    spread_pct: spreadPct,
    tiie: TIIE_FONDEO,
    tasa_total_pct: tasaTotal,
    ajuste_financiero_pb: ajusteFin,
    nota,
  };
}