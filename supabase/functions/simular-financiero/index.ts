// ============================================================================
//  EDGE FUNCTION: simular-financiero
//  Despliegue:  supabase functions deploy simular-financiero
//  Invocación:  POST { evaluacion_id, perfil_custom? }
//
//  Corre el simulador financiero sobre una evaluación ya calculada. Es una
//  proyección INTERACTIVA y separada del score: el usuario puede pasar un
//  'perfil_custom' para explorar supuestos distintos y ver el impacto en vivo,
//  sin re-evaluar el riesgo (que permanece fijo).
//
//  Lee de la base los parámetros (perfil base, intensidades, coeficientes),
//  las normas de la evaluación (con su tema, severidad, incumplimiento y multa),
//  y devuelve los tres escenarios comparados. NO modifica el score ni persiste
//  nada por defecto (es exploratorio); persistir es decisión aparte.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  simularV2,
  estructurarDeuda,
  calcularSpread,
  type FilaSimulacion,
  type PerfilFinanciero,
  PERFIL_BASE_AGRO_PLACEHOLDER,
  INTENSIDAD_ESCENARIO_PLACEHOLDER,
} from "./simulador_v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { evaluacion_id, perfil_custom } = await req.json() as {
      evaluacion_id: string;
      perfil_custom?: Partial<PerfilFinanciero>;
    };
    if (!evaluacion_id) return json({ error: "Falta evaluacion_id" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) La evaluación y su cliente. Necesitamos subsector + tamaño para elegir
    //    el perfil financiero FIRA correcto, y el resultado persistido para la
    //    banda de riesgo ESG REAL del cliente (usada en el spread del escenario Actual).
    const { data: ev, error: eEv } = await supabase
      .from("evaluaciones")
      .select("id, cliente_id, resultado, clientes(sector_id, subsector, perfil_tamano)")
      .eq("id", evaluacion_id)
      .maybeSingle();
    if (eEv) throw eEv;
    if (!ev) return json({ error: "Evaluación no encontrada" }, 404);
    const cli = (ev as any).clientes ?? {};
    const subsector: string = cli.subsector ?? "ganaderia";      // default ganadería
    const perfilTamano: string = cli.perfil_tamano ?? "pyme";    // default PyME

    // Banda de riesgo ESG real del cliente (del scoring persistido). El resultado
    // guarda credito.banda y reputacion.banda; el nivel general es el PEOR de los
    // dos (misma lógica del máximo que usa el frontend). Fallback "Medio".
    const resPersistido = (ev as any).resultado ?? {};
    const ordenBanda: Record<string, number> = { "Bajo": 0, "Medio": 1, "Alto": 2, "Crítico": 3 };
    const bandaCred: string = resPersistido?.credito?.banda ?? "Medio";
    const bandaRep: string = resPersistido?.reputacion?.banda ?? "Medio";
    const bandaRealCliente: string =
      (ordenBanda[bandaCred] ?? 1) >= (ordenBanda[bandaRep] ?? 1) ? bandaCred : bandaRep;

    // 2) Detalle por norma: tema, severidad, incumplimiento y multa estimada.
    //    La multa por norma la reconstruimos igual que la exposición:
    //    multa_mxn × factor_incumplimiento × (prob_fisc/5). Reusamos la vista.
    const { data: detalle, error: eDet } = await supabase
      .from("v_riesgo_norma")
      .select("norma_titulo, factor_incumplimiento, prob_fiscalizacion, multa_min, multa_max, multa_unidad, es_descalificante, norma_id")
      .eq("evaluacion_id", evaluacion_id);
    if (eDet) throw eDet;

    // Traer el tema y severidad de cada norma (no están en la vista de riesgo).
    const normaIds = (detalle ?? []).map((d: any) => d.norma_id);
    const { data: normasMeta, error: eMeta } = await supabase
      .from("normas")
      .select("id, tema, severidad")
      .in("id", normaIds);
    if (eMeta) throw eMeta;
    const metaPorId = new Map((normasMeta ?? []).map((n: any) => [n.id, n]));

    // 3) Parámetros desde las tablas editables.
    const { data: coefRows } = await supabase
      .from("coef_materialidad_tema").select("tema, coeficiente, en_canal_operativo");
    const coefMaterialidad: Record<string, number> = {};
    for (const c of coefRows ?? []) {
      coefMaterialidad[(c as any).tema] = (c as any).en_canal_operativo ? Number((c as any).coeficiente) : 0;
    }

    const { data: umaRow } = await supabase
      .from("parametros_financieros").select("valor").eq("clave", "uma_diaria").maybeSingle();
    const valorUma = umaRow?.valor ? Number(umaRow.valor) : 117.31;

    // Perfil financiero FIRA por subsector × tamaño (fallback: ganadería PyME).
    let perfil: PerfilFinanciero = { ...PERFIL_BASE_AGRO_PLACEHOLDER };
    const { data: pf } = await supabase
      .from("perfil_financiero_agro")
      .select("margen_ebitda, deuda_ebitda, tasa_interes, capex_pct_ingresos, amortizacion_anios, dias_cuentas_cobrar, dias_inventario, dias_cuentas_pagar")
      .eq("subsector", subsector)
      .eq("perfil_tamano", perfilTamano)
      .maybeSingle();
    // Ingresos base según el tamaño (supuesto de escala, editable).
    const { data: ib } = await supabase
      .from("ingresos_base_tamano")
      .select("ingresos_anuales")
      .eq("perfil_tamano", perfilTamano)
      .maybeSingle();
    if (pf) {
      perfil = {
        ingresos_anuales: ib?.ingresos_anuales ? Number(ib.ingresos_anuales) : 50_000_000,
        margen_ebitda: Number(pf.margen_ebitda),
        deuda_ebitda: Number(pf.deuda_ebitda),
        tasa_interes: Number(pf.tasa_interes),
        capex_pct_ingresos: Number(pf.capex_pct_ingresos),
        amortizacion_anios: Number(pf.amortizacion_anios),
        // Días del ciclo de efectivo (migración 32). Fallback al placeholder si
        // la fila aún no los tiene cargados.
        dias_cuentas_cobrar: pf.dias_cuentas_cobrar != null ? Number(pf.dias_cuentas_cobrar) : PERFIL_BASE_AGRO_PLACEHOLDER.dias_cuentas_cobrar,
        dias_inventario: pf.dias_inventario != null ? Number(pf.dias_inventario) : PERFIL_BASE_AGRO_PLACEHOLDER.dias_inventario,
        dias_cuentas_pagar: pf.dias_cuentas_pagar != null ? Number(pf.dias_cuentas_pagar) : PERFIL_BASE_AGRO_PLACEHOLDER.dias_cuentas_pagar,
      };
    }
    // El usuario puede sobreescribir cualquier campo para explorar supuestos.
    if (perfil_custom) perfil = { ...perfil, ...perfil_custom };

    // Intensidades.
    const { data: intensRows } = await supabase
      .from("intensidad_escenario").select("escenario, intensidad");
    const intensidad = { ...INTENSIDAD_ESCENARIO_PLACEHOLDER };
    for (const r of intensRows ?? []) {
      (intensidad as any)[(r as any).escenario] = Number((r as any).intensidad);
    }

    // 4) Construir las filas de simulación.
    const aMXN = (min: number|null, max: number|null, unidad: string|null): number => {
      if (min == null || max == null) return 0;
      const punto = (Number(min) + Number(max)) / 2;
      if (unidad === "UMA") return punto * valorUma;
      if (unidad === "MXN") return punto;
      return 0; // PCT_INGRESOS y otros no entran al canal directo cuantificable
    };

    const filas: FilaSimulacion[] = (detalle ?? []).map((d: any) => {
      const meta = metaPorId.get(d.norma_id) as any;
      const multaEsperada = aMXN(d.multa_min, d.multa_max, d.multa_unidad)
        * Number(d.factor_incumplimiento)
        * (Number(d.prob_fiscalizacion) / 5);
      return {
        norma_titulo: d.norma_titulo,
        tema: meta?.tema ?? "",
        severidad: Number(meta?.severidad ?? 1),
        factor_incumplimiento: Number(d.factor_incumplimiento),
        multa_esperada_mxn: multaEsperada,
      };
    });

    // 5) Simular (v2: Actual + escenarios, con CAPEX y estados financieros).
    const resultado = simularV2(filas, coefMaterialidad, perfil, intensidad);

    // Auto-estructuración de deuda (goal seek) para los dos escenarios de
    // decisión de crédito: el estado real (Actual) y el de cumplimiento (Cumple).
    // No aplica a Parcial/Incumple (hipotéticos de deterioro, no de préstamo).
    const cumpleVista = resultado.escenarios.find((e: any) => e.vista === "cumple");
    const estructura_deuda = {
      actual: estructurarDeuda(resultado.actual, perfil),
      cumple: cumpleVista ? estructurarDeuda(cumpleVista, perfil) : null,
    };

    // Spread crediticio por escenario (scorecard ESG × capacidad de pago).
    // ACTUAL usa la banda ESG REAL del cliente (del scoring). Los escenarios
    // hipotéticos mapean su banda: cumple→Bajo, parcial→Medio, incumple→Crítico
    // (coherente con la definición de las categorías del scorecard).
    const bandaPorEscenario: Record<string, string> = {
      cumple: "Bajo", parcial: "Medio", incumple: "Crítico",
    };
    const spread = {
      actual: calcularSpread(bandaRealCliente, resultado.actual.indicadores.dscr, perfilTamano),
      escenarios: resultado.escenarios.map((e: any) => ({
        vista: e.vista,
        ...calcularSpread(bandaPorEscenario[e.vista] ?? "Medio", e.indicadores.dscr, perfilTamano),
      })),
    };

    // Metadata del perfil usado, para que el frontend lo muestre y sea trazable.
    const perfil_meta = {
      subsector,
      perfil_tamano: perfilTamano,
      fuente: pf ? "FIRA red de valor + comparables BMV" : "fallback (ganadería PyME)",
    };

    return json({ evaluacion_id, perfil_meta, estructura_deuda, spread, ...resultado }, 200);
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}