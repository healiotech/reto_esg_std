// ============================================================================
//  EDGE FUNCTION: resumen-cartera
//  Despliegue:  supabase functions deploy resumen-cartera
//  Invocación:  POST {}
//
//  Agregados de cartera para la pantalla de Inicio: exposición regulatoria,
//  capital en riesgo, distribución por banda con capital, top de incumplimientos
//  normativos y el PIPELINE DE ESTRUCTURACIÓN de crédito (viables / reestructura
//  / FEGA / no bancables), corriendo la lógica del simulador financiero para la
//  ÚLTIMA evaluación de cada cliente.
//
//  Usa SERVICE_ROLE (igual que listar-evaluaciones / simular-financiero): no hay
//  RLS sobre evaluaciones/clientes.
//
//  Rendimiento: corre simularV2 por cliente en cada carga. Aceptable para la
//  cartera actual; los parámetros compartidos se cargan una sola vez.
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
} from "../simular-financiero/simulador_v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BANDAS = ["Bajo", "Medio", "Alto", "Crítico"] as const;
type Banda = typeof BANDAS[number];
const ORDEN_BANDA: Record<string, number> = { "Bajo": 0, "Medio": 1, "Alto": 2, "Crítico": 3 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Evaluaciones completas + su cliente. Nos quedamos con la ÚLTIMA por
    //    cliente_id (order desc + primera vista).
    const { data: evalsRaw, error: eEval } = await supabase
      .from("evaluaciones")
      .select("id, fecha, resultado, cliente_id, clientes!inner(subsector, perfil_tamano)")
      .not("resultado", "is", null)
      .order("fecha", { ascending: false });
    if (eEval) throw eEval;

    const totalEvaluaciones = (evalsRaw ?? []).length;
    const ultimaPorCliente = new Map<string, any>();
    for (const ev of evalsRaw ?? []) {
      if (!ultimaPorCliente.has((ev as any).cliente_id)) {
        ultimaPorCliente.set((ev as any).cliente_id, ev);
      }
    }
    const evals = [...ultimaPorCliente.values()];
    const totalClientes = evals.length;

    if (totalClientes === 0) {
      return json(vacio(totalEvaluaciones), 200);
    }

    // 2) Parámetros compartidos — una sola carga.
    const [{ data: coefRows }, { data: umaRow }, { data: pfRows }, { data: ibRows }, { data: intensRows }] =
      await Promise.all([
        supabase.from("coef_materialidad_tema").select("tema, coeficiente, banda, en_canal_operativo"),
        supabase.from("parametros_financieros").select("valor").eq("clave", "uma_diaria").maybeSingle(),
        supabase.from("perfil_financiero_agro").select("subsector, perfil_tamano, margen_ebitda, deuda_ebitda, tasa_interes, capex_pct_ingresos, amortizacion_anios"),
        supabase.from("ingresos_base_tamano").select("perfil_tamano, ingresos_anuales"),
        supabase.from("intensidad_escenario").select("escenario, intensidad"),
      ]);

    const coefMaterialidad: Record<string, number> = {};
    const bandaPorTema = new Map<string, string | null>();
    for (const c of coefRows ?? []) {
      coefMaterialidad[(c as any).tema] = (c as any).en_canal_operativo ? Number((c as any).coeficiente) : 0;
      bandaPorTema.set((c as any).tema, (c as any).banda ?? null);
    }
    const valorUma = umaRow?.valor ? Number(umaRow.valor) : 117.31;

    const pfPorClave = new Map<string, any>();
    for (const p of pfRows ?? []) {
      pfPorClave.set(`${(p as any).subsector}|${(p as any).perfil_tamano}`, p);
    }
    const ingresosPorTamano = new Map<string, number>();
    for (const r of ibRows ?? []) {
      ingresosPorTamano.set((r as any).perfil_tamano, Number((r as any).ingresos_anuales));
    }
    const intensidad = { ...INTENSIDAD_ESCENARIO_PLACEHOLDER };
    for (const r of intensRows ?? []) {
      (intensidad as any)[(r as any).escenario] = Number((r as any).intensidad);
    }

    // 3) Detalle por norma de todas las evaluaciones-última (una consulta).
    const evalIds = evals.map((e) => (e as any).id);
    const { data: vrnRows, error: eVrn } = await supabase
      .from("v_riesgo_norma")
      .select("evaluacion_id, norma_id, norma_titulo, tema, estatus, factor_incumplimiento, prob_fiscalizacion, multa_min, multa_max, multa_unidad, es_descalificante")
      .in("evaluacion_id", evalIds);
    if (eVrn) throw eVrn;

    const vrnPorEval = new Map<string, any[]>();
    for (const r of vrnRows ?? []) {
      const k = (r as any).evaluacion_id;
      if (!vrnPorEval.has(k)) vrnPorEval.set(k, []);
      vrnPorEval.get(k)!.push(r);
    }
    const normaIds = [...new Set((vrnRows ?? []).map((r: any) => r.norma_id))];
    const { data: normasMeta } = normaIds.length
      ? await supabase.from("normas").select("id, tema, severidad").in("id", normaIds)
      : { data: [] as any[] };
    const metaPorId = new Map((normasMeta ?? []).map((n: any) => [n.id, n]));

    const aMXN = (min: number | null, max: number | null, unidad: string | null): number => {
      if (min == null || max == null) return 0;
      const punto = (Number(min) + Number(max)) / 2;
      if (unidad === "UMA") return punto * valorUma;
      if (unidad === "MXN") return punto;
      return 0;
    };

    // 4) Agregar.
    let exposicionTotal = 0;
    let valorEnRiesgo = 0;
    const distribucion: Record<Banda, { clientes: number; exposicion_mxn: number }> = {
      "Bajo": { clientes: 0, exposicion_mxn: 0 },
      "Medio": { clientes: 0, exposicion_mxn: 0 },
      "Alto": { clientes: 0, exposicion_mxn: 0 },
      "Crítico": { clientes: 0, exposicion_mxn: 0 },
    };
    // Tema ESG → set de cliente_id con al menos una norma de ese tema en no_cumple.
    const temaNoCumpleClientes = new Map<string, Set<string>>();
    const pipeline = {
      viables: 0, con_greenium: 0, viables_reestructura: 0,
      requieren_fega: 0, no_bancables: 0, fuera_alcance: 0,
    };

    for (const ev of evals) {
      const res = (ev as any).resultado ?? {};
      const cli = (ev as any).clientes ?? {};
      const subsector: string = cli.subsector ?? "ganaderia";
      const perfilTamano: string = cli.perfil_tamano ?? "pyme";

      // Banda general = peor de crédito / reputación.
      const bandaCred: string = res?.credito?.banda ?? "Medio";
      const bandaRep: string = res?.reputacion?.banda ?? "Medio";
      const bandaReal: Banda =
        ((ORDEN_BANDA[bandaCred] ?? 1) >= (ORDEN_BANDA[bandaRep] ?? 1) ? bandaCred : bandaRep) as Banda;

      const expMax = Number(res?.exposicion?.exposicion_max_mxn ?? 0);
      exposicionTotal += expMax;
      if (bandaReal === "Alto" || bandaReal === "Crítico") valorEnRiesgo += expMax;
      if (distribucion[bandaReal]) {
        distribucion[bandaReal].clientes += 1;
        distribucion[bandaReal].exposicion_mxn += expMax;
      }

      // Simulación → pipeline de estructuración.
      const pf = pfPorClave.get(`${subsector}|${perfilTamano}`);
      let perfil: PerfilFinanciero = { ...PERFIL_BASE_AGRO_PLACEHOLDER };
      if (pf) {
        perfil = {
          ingresos_anuales: ingresosPorTamano.get(perfilTamano) ?? 50_000_000,
          margen_ebitda: Number(pf.margen_ebitda),
          deuda_ebitda: Number(pf.deuda_ebitda),
          tasa_interes: Number(pf.tasa_interes),
          capex_pct_ingresos: Number(pf.capex_pct_ingresos),
          amortizacion_anios: Number(pf.amortizacion_anios),
        };
      }

      const vrn = vrnPorEval.get((ev as any).id) ?? [];

      // Top de incumplimientos POR TEMA: se lee de v_riesgo_norma (join en vivo
      // con normas.tema), no del blob persistido, que en evaluaciones viejas no
      // trae `tema`. Un cliente cuenta una sola vez por tema.
      const clienteId: string = (ev as any).cliente_id;
      for (const d of vrn) {
        if ((d as any).estatus === "no_cumple" && (d as any).tema) {
          const t = (d as any).tema;
          if (!temaNoCumpleClientes.has(t)) temaNoCumpleClientes.set(t, new Set());
          temaNoCumpleClientes.get(t)!.add(clienteId);
        }
      }

      const filas: FilaSimulacion[] = vrn.map((d: any) => {
        const meta = metaPorId.get(d.norma_id) as any;
        const multaEsperada =
          aMXN(d.multa_min, d.multa_max, d.multa_unidad) *
          Number(d.factor_incumplimiento) *
          (Number(d.prob_fiscalizacion) / 5);
        return {
          norma_titulo: d.norma_titulo,
          tema: meta?.tema ?? "",
          severidad: Number(meta?.severidad ?? 1),
          factor_incumplimiento: Number(d.factor_incumplimiento),
          multa_esperada_mxn: multaEsperada,
        };
      });

      const sim = simularV2(filas, coefMaterialidad, perfil, intensidad);
      const estructura = estructurarDeuda(sim.actual, perfil);
      const spread = calcularSpread(bandaReal, sim.actual.indicadores.dscr, perfilTamano);

      // "bursatil" trae aplica=true solo para mostrar una tasa de referencia;
      // la estructuración de crédito FIRA sigue fuera de alcance para un emisor
      // listado, así que en el pipeline cuenta como fuera_alcance igual que
      // multinacional.
      if (!spread.aplica || spread.categoria === "bursatil") {
        pipeline.fuera_alcance += 1;
      } else if (estructura.bancable_base) {
        pipeline.viables += 1;
        if (spread.categoria === "A") pipeline.con_greenium += 1;
      } else if (estructura.reestructurable) {
        pipeline.viables_reestructura += 1;
      } else if (sim.actual.indicadores.dscr === null || sim.actual.estado_resultados.ebitda <= 0) {
        pipeline.no_bancables += 1;
      } else {
        pipeline.requieren_fega += 1;
      }
    }

    const topTemas = [...temaNoCumpleClientes.entries()]
      .map(([tema, set]) => ({ tema, n_clientes: set.size, materialidad: bandaPorTema.get(tema) ?? null }))
      .sort((a, b) => b.n_clientes - a.n_clientes)
      .slice(0, 3);

    return json({
      total_clientes: totalClientes,
      total_evaluaciones: totalEvaluaciones,
      exposicion_total_mxn: Math.round(exposicionTotal),
      valor_en_riesgo_mxn: Math.round(valorEnRiesgo),
      distribucion: BANDAS.map((b) => ({
        banda: b,
        clientes: distribucion[b].clientes,
        exposicion_mxn: Math.round(distribucion[b].exposicion_mxn),
      })),
      top_temas: topTemas,
      pipeline,
    }, 200);
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});

function vacio(totalEvaluaciones: number) {
  return {
    total_clientes: 0,
    total_evaluaciones: totalEvaluaciones,
    exposicion_total_mxn: 0,
    valor_en_riesgo_mxn: 0,
    distribucion: BANDAS.map((b) => ({ banda: b, clientes: 0, exposicion_mxn: 0 })),
    top_temas: [] as { tema: string; n_clientes: number; materialidad: string | null }[],
    pipeline: {
      viables: 0, con_greenium: 0, viables_reestructura: 0,
      requieren_fega: 0, no_bancables: 0, fuera_alcance: 0,
    },
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
