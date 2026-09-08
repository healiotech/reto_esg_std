// ============================================================================
//  EDGE FUNCTION: evaluar  (v3 — score + exposición financiera + persistencia)
//  Despliegue:  supabase functions deploy evaluar
//  Invocación:  POST { cliente: {...}, respuestas: [...] }
//
//  Cambios vs. v2:
//   · Calcula además la EXPOSICIÓN FINANCIERA ESPERADA (capa complementaria,
//     no toca el score) con exposicion.ts, y la incluye/persiste en 'resultado'.
//   · Lee el valor UMA vigente de parametros_financieros (no hardcodeado).
//
//  La exposición es estimación orientativa: rango min–max, descalificantes
//  categóricas listadas aparte. El score de riesgo sigue siendo el producto
//  de decisión; la exposición solo orienta.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calcularScore, type Banda, type RiesgoNorma, type FactorTamano } from "./engine.ts";
import { calcularExposicion, type FilaExposicion } from "./exposicion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RespuestaInput {
  norma_id: string;
  estatus: "cumple" | "parcial" | "no_cumple" | "desconocido" | "no_aplica";
  nivel_confianza: "verificado" | "autoreportado";
  documento_url?: string | null;
}
interface ClienteInput {
  /** Número de cliente del banco (clientes.numero_cliente, UNIQUE). Clave de dedup. */
  numero_cliente?: string;
  /** ID de un cliente ya existente al que se VINCULA la evaluación (resuelto por buscar-cliente). */
  cliente_id?: string;
  nombre: string;
  sector_id: string;
  jurisdiccion_id: string;
  perfil_tamano: "pyme" | "mediana" | "cotiza_bolsa" | "multinacional";
  subsector?: "ganaderia" | "agricultura";
  es_exportador?: boolean;
  en_zona_riesgo?: boolean;
  zona_riesgo_nota?: string | null;
  /**
   * Actividad PROHIBIDA por la política ESG del Grupo Santander. Si viene, el
   * cliente es NO EVALUABLE: se persiste una evaluación con estado
   * 'no_evaluable' y sin respuestas/score/exposición.
   */
  actividad_prohibida_id?: string | null;
}

// Cuando evaluacion_id viene presente, es un re-cálculo desde "editar" en
// Cartera: se actualiza la misma fila de clientes/evaluaciones en vez de
// insertar filas nuevas. Sin evaluacion_id, comportamiento idéntico al
// original (crea cliente + evaluación nuevos).

const UMA_FALLBACK = 117.31; // por si parametros_financieros no responde

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { cliente, respuestas, evaluacion_id } = await req.json() as {
      cliente: ClienteInput; respuestas: RespuestaInput[]; evaluacion_id?: string;
    };
    const esNoEvaluable = Boolean(cliente?.actividad_prohibida_id);
    if (!cliente || (!esNoEvaluable && !respuestas?.length)) {
      return json({ error: "Falta cliente o respuestas" }, 400);
    }
    // El número de cliente es obligatorio al crear (es la clave de dedup).
    // En edición (evaluacion_id presente) ya existe el cliente y viaja igual.
    if (!evaluacion_id && !cliente.numero_cliente?.trim()) {
      return json({ error: "Falta el número de cliente" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let cli: { id: string };
    let ev: { id: string };

    if (evaluacion_id) {
      // EDIT PATH — reutiliza la misma fila de cliente + evaluación.
      const { data: evExistente, error: eEvSel } = await supabase
        .from("evaluaciones")
        .select("id, estado, cliente_id")
        .eq("id", evaluacion_id)
        .maybeSingle();
      if (eEvSel) throw eEvSel;
      if (!evExistente) {
        return json({ error: "Evaluación no encontrada" }, 404);
      }
      if (evExistente.estado === "cerrada") {
        return json({ error: "No se puede editar una evaluación cerrada." }, 409);
      }

      const { error: eCliUpd } = await supabase
        .from("clientes")
        .update({
          numero_cliente: cliente.numero_cliente ?? undefined, // undefined => no se toca
          nombre: cliente.nombre, sector_id: cliente.sector_id,
          jurisdiccion_id: cliente.jurisdiccion_id, perfil_tamano: cliente.perfil_tamano,
          subsector: cliente.subsector ?? "ganaderia",
          es_exportador: cliente.es_exportador ?? false,
          en_zona_riesgo: cliente.en_zona_riesgo ?? false,
          zona_riesgo_nota: cliente.zona_riesgo_nota ?? null,
        })
        .eq("id", evExistente.cliente_id);
      if (eCliUpd) throw eCliUpd;

      cli = { id: evExistente.cliente_id };
      ev = { id: evaluacion_id };

      // Reemplaza respuestas: delete-then-reinsert respeta el
      // unique(evaluacion_id, norma_id) sin necesitar upsert con target.
      const { error: eDelResp } = await supabase
        .from("respuestas")
        .delete()
        .eq("evaluacion_id", ev.id);
      if (eDelResp) throw eDelResp;
    } else {
      // CREATE-OR-LINK PATH. Deduplicación por numero_cliente: un cliente puede
      // tener muchas evaluaciones. La evaluación SÍ es nueva siempre acá; lo que
      // se decide es si el cliente se reutiliza o se crea.
      // 1) Resolver el cliente
      if (cliente.cliente_id) {
        // El formulario ya lo resolvió con buscar-cliente: vincular sin tocar
        // la fila de clientes (el registro guardado manda).
        cli = { id: cliente.cliente_id };
      } else {
        const numero = cliente.numero_cliente!.trim();
        const { data: cliExistente, error: eBuscar } = await supabase
          .from("clientes")
          .select("id")
          .eq("numero_cliente", numero)
          .maybeSingle();
        if (eBuscar) throw eBuscar;

        if (cliExistente) {
          cli = { id: cliExistente.id };
        } else {
          const { data: cliNuevo, error: eCli } = await supabase
            .from("clientes")
            .insert({
              numero_cliente: numero,
              nombre: cliente.nombre, sector_id: cliente.sector_id,
              jurisdiccion_id: cliente.jurisdiccion_id, perfil_tamano: cliente.perfil_tamano,
              subsector: cliente.subsector ?? "ganaderia",
              es_exportador: cliente.es_exportador ?? false,
              en_zona_riesgo: cliente.en_zona_riesgo ?? false,
              zona_riesgo_nota: cliente.zona_riesgo_nota ?? null,
            }).select("id").single();
          if (eCli) {
            // Carrera: otra pestaña insertó el mismo numero_cliente entre el
            // lookup y este insert. El UNIQUE(numero_cliente) lo rechaza;
            // re-buscar y vincular en vez de reventar.
            const { data: cliCarrera, error: eReBuscar } = await supabase
              .from("clientes")
              .select("id")
              .eq("numero_cliente", numero)
              .maybeSingle();
            if (eReBuscar) throw eReBuscar;
            if (!cliCarrera) throw eCli;
            cli = { id: cliCarrera.id };
          } else {
            cli = cliNuevo;
          }
        }
      }

      // 2) Evaluación (nueva)
      const { data: evNueva, error: eEv } = await supabase
        .from("evaluaciones")
        .insert({ cliente_id: cli.id, evaluador: "frontend", estado: "borrador" })
        .select("id").single();
      if (eEv) throw eEv;
      ev = evNueva;
    }

    // 2-bis) Cliente NO EVALUABLE por actividad prohibida: se marca el cliente,
    // se persiste la evaluación con estado 'no_evaluable' y un resultado mínimo
    // (shape-compatible para que ningún consumidor reviente), y se corta acá —
    // sin respuestas, sin score, sin exposición.
    if (esNoEvaluable) {
      const { error: eMarca } = await supabase
        .from("clientes")
        .update({ actividad_prohibida_id: cliente.actividad_prohibida_id })
        .eq("id", cli.id);
      if (eMarca) throw eMarca;

      const { data: actividad, error: eAct } = await supabase
        .from("actividades_prohibidas")
        .select("id, clave, etiqueta, clausula_politica, descripcion")
        .eq("id", cliente.actividad_prohibida_id!)
        .maybeSingle();
      if (eAct) throw eAct;
      if (!actividad) return json({ error: "Actividad prohibida no encontrada" }, 400);

      const CANAL_CERO = {
        score: 0, banda: "Bajo", score_base: 0, max_norma: 0,
        forzado_por_descalificante: false, multiplicador_sistemico: 1, factor_tamano: 1,
      };
      const resultadoNoEvaluable = {
        no_evaluable: true,
        actividad_prohibida: actividad,
        credito: CANAL_CERO,
        reputacion: CANAL_CERO,
        pct_autoreportado: 0,
        categorias_en_riesgo: [] as string[],
        detalle: [] as unknown[],
        exposicion: {
          exposicion_min_mxn: 0, exposicion_max_mxn: 0, valor_uma: 0,
          detalle_cuantificable: [], no_cuantificables: [], hay_no_cuantificable: false,
        },
      };
      const ahoraNE = new Date().toISOString();
      let qNE = supabase
        .from("evaluaciones")
        .update({ resultado: resultadoNoEvaluable, calculado_en: ahoraNE, estado: "no_evaluable" })
        .eq("id", ev.id);
      if (evaluacion_id) qNE = qNE.neq("estado", "cerrada");
      const { data: neAct, error: eNE } = await qNE.select("id").maybeSingle();
      if (eNE) throw eNE;
      if (evaluacion_id && !neAct) {
        return json({ error: "La evaluación cambió de estado antes de guardar los cambios. Vuelve a intentarlo." }, 409);
      }

      return json(
        { evaluacion_id: ev.id, cliente_id: cli.id, estado: "no_evaluable", ...resultadoNoEvaluable },
        200,
      );
    }

    // 3) Respuestas
    const { error: eResp } = await supabase.from("respuestas").insert(
      respuestas.map((r) => ({
        evaluacion_id: ev.id, norma_id: r.norma_id, estatus: r.estatus,
        nivel_confianza: r.nivel_confianza, documento_url: r.documento_url ?? null,
      })),
    );
    if (eResp) throw eResp;

    // 4) Traer detalle (incluye multas y prob_fiscalizacion desde la vista)
    const { data: detalle, error: e1 } = await supabase
      .from("v_riesgo_norma").select("*").eq("evaluacion_id", ev.id);
    if (e1) throw e1;

    const { data: ft, error: e2 } = await supabase
      .from("factores_tamano")
      .select("factor_credito, factor_reputacion").eq("perfil", cliente.perfil_tamano).single();
    if (e2) throw e2;

    const { data: bandas, error: e3 } = await supabase
      .from("bandas").select("canal, etiqueta, limite_inferior, limite_superior").order("orden");
    if (e3) throw e3;

    // 4b) Valor UMA vigente (parametrizado, no hardcodeado)
    let valorUma = UMA_FALLBACK;
    const { data: pUma } = await supabase
      .from("parametros_financieros").select("valor").eq("clave", "uma_diaria").maybeSingle();
    if (pUma?.valor) valorUma = Number(pUma.valor);

    // 5) Score (motor determinista)
    const resultado = calcularScore(
      detalle as RiesgoNorma[], bandas as Banda[], ft as FactorTamano,
    );

    // 5b) Exposición financiera (capa complementaria; NO modifica el score)
    const filasExp: FilaExposicion[] = (detalle as any[]).map((d) => ({
      norma_titulo: d.norma_titulo,
      factor_incumplimiento: Number(d.factor_incumplimiento),
      prob_fiscalizacion: Number(d.prob_fiscalizacion),
      multa_min: d.multa_min == null ? null : Number(d.multa_min),
      multa_max: d.multa_max == null ? null : Number(d.multa_max),
      multa_unidad: d.multa_unidad,
      es_descalificante: d.es_descalificante,
    }));
    const exposicion = calcularExposicion(filasExp, valorUma);

    // Resultado combinado (score + exposición como sección aparte)
    const resultadoCompleto = { ...resultado, exposicion };

    // 6) Persistir resultado + snapshot + estado 'completa'
    const ahora = new Date().toISOString();
    let query = supabase
      .from("evaluaciones")
      .update({
        resultado: resultadoCompleto,
        snapshot_parametros: {
          factores_tamano: ft, bandas, perfil_tamano: cliente.perfil_tamano,
          valor_uma: valorUma, generado_en: ahora,
        },
        calculado_en: ahora,
        estado: "completa",
      })
      .eq("id", ev.id);
    // En edición, cierra la misma ventana de carrera que cerrar-evaluacion:
    // si otra pestaña cerró la evaluación entre la validación y este punto,
    // el UPDATE no afecta filas y se trata como conflicto.
    if (evaluacion_id) query = query.neq("estado", "cerrada");

    const { data: actualizada, error: eUpd } = await query.select("id").maybeSingle();
    if (eUpd) throw eUpd;
    if (evaluacion_id && !actualizada) {
      return json(
        { error: "La evaluación cambió de estado antes de guardar los cambios. Vuelve a intentarlo." },
        409,
      );
    }

    return json({ evaluacion_id: ev.id, cliente_id: cli.id, estado: "completa", ...resultadoCompleto }, 200);
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