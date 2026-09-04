// ============================================================================
//  MOTOR DE SCORING — lógica pura, determinista, sin dependencias de red.
//  Aislada a propósito: se puede testear sin desplegar ni tocar la base.
//  El handler HTTP (index.ts) solo trae datos de Supabase y llama a esto.
// ============================================================================

export type Canal = "credito" | "reputacion";
export type Categoria = "ambiental" | "social" | "jurisdiccional_documental";
export type Estatus = "cumple" | "parcial" | "no_cumple" | "desconocido";
export type Confianza = "verificado" | "autoreportado";

// Una fila de v_riesgo_norma (lo que la vista ya calcula por norma)
export interface RiesgoNorma {
  norma_id: string;
  norma_titulo: string;
  categoria: Categoria;
  // Tema ESG (agua, uso_suelo, sanidad…) — más fino que `categoria`. Puro
  // pass-through: el motor no lo usa en ningún cálculo, solo viaja para que
  // el frontend cruce cumplimiento × materialidad (coef_materialidad_tema).
  tema: string;
  fuente: string;
  fuente_url: string | null;
  estatus: Estatus;
  nivel_confianza: Confianza;
  es_descalificante: boolean;
  riesgo_credito: number;      // ya incluye fiscalización y peso crédito
  riesgo_reputacion: number;   // ya incluye peso reputación (sin fiscalización)
  peso_crediticio: number;
  peso_reputacional: number;
  gatilla_critico: boolean;    // descalificante && no_cumple
}

export interface Banda {
  canal: Canal;
  etiqueta: string;
  limite_inferior: number;
  limite_superior: number | null;
}

export interface FactorTamano {
  factor_credito: number;
  factor_reputacion: number;
}

export interface ResultadoCanal {
  score: number;               // score final (post tamaño + sistémico + override)
  banda: string;
  score_base: number;          // promedio ponderado crudo (pre-ajustes)
  max_norma: number;           // norma más riesgosa del canal (evita dilución)
  forzado_por_descalificante: boolean;
  multiplicador_sistemico: number;
  factor_tamano: number;
}

export interface Resultado {
  credito: ResultadoCanal;
  reputacion: ResultadoCanal;
  pct_autoreportado: number;   // indicador de gobernanza (NO afecta el score)
  categorias_en_riesgo: Categoria[];
  detalle: RiesgoNorma[];      // para la caja de cristal
}

// ---- Helpers ---------------------------------------------------------------

// Promedio ponderado por el peso del canal (agregación ÚNICA y consistente).
// No suma → no infla por cantidad de normas.
function promedioPonderado(
  filas: RiesgoNorma[],
  riesgo: (f: RiesgoNorma) => number,
  peso: (f: RiesgoNorma) => number,
): number {
  const sumaPeso = filas.reduce((a, f) => a + peso(f), 0);
  if (sumaPeso === 0) return 0;
  const sumaRiesgo = filas.reduce((a, f) => a + riesgo(f), 0);
  return sumaRiesgo / sumaPeso;
}

function traducirBanda(score: number, bandas: Banda[], canal: Canal): string {
  const delCanal = bandas.filter((b) => b.canal === canal);
  for (const b of delCanal) {
    const dentroInf = score >= b.limite_inferior;
    const dentroSup = b.limite_superior === null || score < b.limite_superior;
    if (dentroInf && dentroSup) return b.etiqueta;
  }
  return delCanal.at(-1)?.etiqueta ?? "Desconocido";
}

// ¿La banda cuenta como "en riesgo" para el conteo sistémico?
function esAltoOCritico(etiqueta: string): boolean {
  return etiqueta === "Alto" || etiqueta === "Crítico";
}

// ---- Motor principal -------------------------------------------------------

export function calcularScore(
  filas: RiesgoNorma[],
  bandas: Banda[],
  tamano: FactorTamano,
): Resultado {
  // 1) Score base por canal = promedio ponderado crudo
  const baseCred = promedioPonderado(filas, (f) => f.riesgo_credito, (f) => f.peso_crediticio);
  const baseRep = promedioPonderado(filas, (f) => f.riesgo_reputacion, (f) => f.peso_reputacional);

  // 2) Override por descalificante (si alguna norma descalificante está no_cumple)
  const hayDescalificante = filas.some((f) => f.gatilla_critico);

  // 3) Determinar categorías en riesgo SOBRE EL CRUDO (antes del sistémico),
  //    para que el multiplicador refleje el patrón en los datos y no se retroalimente.
  //    Se evalúa por categoría usando el max de riesgo reputacional/crediticio de la categoría,
  //    traducido a banda con el umbral del canal correspondiente.
  const categorias = [...new Set(filas.map((f) => f.categoria))] as Categoria[];
  const categoriasEnRiesgo: Categoria[] = [];
  for (const cat of categorias) {
    const enCat = filas.filter((f) => f.categoria === cat);
    // Una categoría está "en riesgo" si su peor norma (en cualquier canal) cae en Alto/Crítico
    const peorCred = Math.max(0, ...enCat.map((f) => f.riesgo_credito));
    const peorRep = Math.max(0, ...enCat.map((f) => f.riesgo_reputacion));
    const bandaCred = traducirBanda(peorCred, bandas, "credito");
    const bandaRep = traducirBanda(peorRep, bandas, "reputacion");
    if (esAltoOCritico(bandaCred) || esAltoOCritico(bandaRep)) {
      categoriasEnRiesgo.push(cat);
    }
  }
  const nEnRiesgo = categoriasEnRiesgo.length;
  const multiplicadorSistemico = nEnRiesgo >= 3 ? 1.4 : nEnRiesgo === 2 ? 1.2 : 1.0;

  // 4) Aplicar tamaño + sistémico a cada canal, luego traducir a banda
  const construirCanal = (
    base: number,
    filasCanal: RiesgoNorma[],
    riesgo: (f: RiesgoNorma) => number,
    factorTamano: number,
    canal: Canal,
  ): ResultadoCanal => {
    const maxNorma = Math.max(0, ...filasCanal.map(riesgo));
    let score = base * multiplicadorSistemico * factorTamano;
    let banda = traducirBanda(score, bandas, canal);
    // Override duro: descalificante fuerza Crítico sin importar el promedio
    if (hayDescalificante) banda = "Crítico";
    return {
      score: Number(score.toFixed(4)),
      banda,
      score_base: Number(base.toFixed(4)),
      max_norma: Number(maxNorma.toFixed(4)),
      forzado_por_descalificante: hayDescalificante,
      multiplicador_sistemico: multiplicadorSistemico,
      factor_tamano: factorTamano,
    };
  };

  const credito = construirCanal(baseCred, filas, (f) => f.riesgo_credito, tamano.factor_credito, "credito");
  const reputacion = construirCanal(baseRep, filas, (f) => f.riesgo_reputacion, tamano.factor_reputacion, "reputacion");

  // 5) Indicador de gobernanza (separado, NO afecta score)
  const nAuto = filas.filter((f) => f.nivel_confianza === "autoreportado").length;
  const pctAuto = filas.length ? nAuto / filas.length : 0;

  return {
    credito,
    reputacion,
    pct_autoreportado: Number(pctAuto.toFixed(4)),
    categorias_en_riesgo: categoriasEnRiesgo,
    detalle: filas,
  };
}