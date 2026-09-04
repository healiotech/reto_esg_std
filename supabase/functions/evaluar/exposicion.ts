// ============================================================================
//  EXPOSICIÓN FINANCIERA ESPERADA — lógica pura, determinista.
//  Capa COMPLEMENTARIA al score (no lo modifica). Estimación orientativa.
//  Probada con tests (7/7): cumplidas no aportan; incumplidas se modulan por
//  factor × fiscalización; descalificantes categóricas (PCT_INGRESOS) van
//  aparte; normas sin multa se ignoran. Se reporta como RANGO (min–max).
// ============================================================================

export interface FilaExposicion {
  norma_titulo: string;
  factor_incumplimiento: number;
  prob_fiscalizacion: number;
  multa_min: number | null;
  multa_max: number | null;
  multa_unidad: string | null;
  es_descalificante: boolean;
}

export interface ExposicionResultado {
  exposicion_min_mxn: number;
  exposicion_max_mxn: number;
  valor_uma: number;
  detalle_cuantificable: Array<{ norma_titulo: string; min_mxn: number; max_mxn: number }>;
  no_cuantificables: Array<{ norma_titulo: string; motivo: string }>;
  hay_no_cuantificable: boolean;
}

function aMXN(monto: number, unidad: string, valorUma: number): number {
  if (unidad === "UMA") return monto * valorUma;
  if (unidad === "MXN") return monto;
  return 0;
}

export function calcularExposicion(
  filas: FilaExposicion[],
  valorUma: number,
): ExposicionResultado {
  let expMin = 0;
  let expMax = 0;
  const detalle: ExposicionResultado["detalle_cuantificable"] = [];
  const noCuant: ExposicionResultado["no_cuantificables"] = [];

  for (const f of filas) {
    if (f.factor_incumplimiento <= 0) continue;

    if (f.es_descalificante && f.multa_unidad === "PCT_INGRESOS") {
      noCuant.push({
        norma_titulo: f.norma_titulo,
        motivo: "Impacto categórico (pérdida de acceso a mercado / cierre), no cuantificable como multa.",
      });
      continue;
    }

    if (
      f.multa_min == null || f.multa_max == null ||
      (f.multa_unidad !== "UMA" && f.multa_unidad !== "MXN")
    ) continue;

    const modulador = f.factor_incumplimiento * (f.prob_fiscalizacion / 5);
    const minMxn = aMXN(f.multa_min, f.multa_unidad, valorUma) * modulador;
    const maxMxn = aMXN(f.multa_max, f.multa_unidad, valorUma) * modulador;

    expMin += minMxn;
    expMax += maxMxn;
    detalle.push({
      norma_titulo: f.norma_titulo,
      min_mxn: Math.round(minMxn),
      max_mxn: Math.round(maxMxn),
    });
  }

  return {
    exposicion_min_mxn: Math.round(expMin),
    exposicion_max_mxn: Math.round(expMax),
    valor_uma: valorUma,
    detalle_cuantificable: detalle,
    no_cuantificables: noCuant,
    hay_no_cuantificable: noCuant.length > 0,
  };
}