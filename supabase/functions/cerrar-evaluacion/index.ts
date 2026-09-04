// ============================================================================
//  EDGE FUNCTION: cerrar-evaluacion
//  Despliegue:  supabase functions deploy cerrar-evaluacion
//  Invocación:  POST { evaluacion_id, cerrada_por?, confirmar_baja_confianza? }
//
//  Transición 'completa' -> 'cerrada'. Es un acto de aprobación humana, no de
//  cálculo: no toca engine.ts ni recalcula nada. El resultado ya quedó
//  persistido por evaluar/index.ts cuando la evaluación pasó a 'completa';
//  aquí solo se firma la transición de estado.
//
//  Usa SERVICE_ROLE (igual que evaluar): es una escritura sensible, no debe
//  pasar por el frontend con la key anon.
//
//  Reglas:
//   1) Solo se puede cerrar una evaluación en estado 'completa'
//      (no un borrador, no recerrar una ya cerrada).
//   2) BLOQUEO DURO: ninguna norma descalificante puede quedar autoreportada,
//      sin importar su estatus (cumple o no_cumple) — lo crítico siempre debe
//      estar verificado documentalmente antes de firmar. Esto no se puede
//      saltar con confirmar_baja_confianza.
//   3) ALERTA SUAVE: si menos del 85% de las normas de la evaluación están
//      verificadas, se exige una confirmación explícita del analista
//      (confirmar_baja_confianza: true) antes de cerrar.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UMBRAL_CONFIANZA_MINIMO = 85;

interface CerrarInput {
  evaluacion_id: string;
  cerrada_por?: string;
  confirmar_baja_confianza?: boolean;
}

interface FilaRiesgoNorma {
  norma_titulo: string;
  fuente: string;
  es_descalificante: boolean;
  nivel_confianza: "verificado" | "autoreportado";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as Partial<CerrarInput>;
    const evaluacionId = body.evaluacion_id;
    const cerradaPor = body.cerrada_por;
    const confirmarBajaConfianza = body.confirmar_baja_confianza === true;

    if (!evaluacionId) {
      return json({ error: "Falta evaluacion_id" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Validar estado de origen.
    const { data: evaluacion, error: eEval } = await supabase
      .from("evaluaciones")
      .select("id, estado")
      .eq("id", evaluacionId)
      .maybeSingle();
    if (eEval) throw eEval;
    if (!evaluacion) {
      return json({ error: "Evaluación no encontrada" }, 404);
    }
    if (evaluacion.estado !== "completa") {
      return json(
        { error: "Solo se pueden cerrar evaluaciones en estado 'completa'" },
        409,
      );
    }

    // 2) Traer el detalle por norma una sola vez: sirve tanto para el
    //    bloqueo duro (descalificantes sin verificar) como para el % de
    //    confianza global — evita una segunda consulta redundante.
    const { data: filas, error: eFilas } = await supabase
      .from("v_riesgo_norma")
      .select("norma_titulo, fuente, es_descalificante, nivel_confianza")
      .eq("evaluacion_id", evaluacionId);
    if (eFilas) throw eFilas;

    const detalle = (filas ?? []) as FilaRiesgoNorma[];

    // BLOQUEO DURO — cualquier descalificante autoreportada (sin importar su
    // estatus) impide el cierre. Innegociable: confirmar_baja_confianza no
    // lo salta.
    const descalificantesSinVerificar = detalle.filter(
      (f) => f.es_descalificante && f.nivel_confianza === "autoreportado",
    );
    if (descalificantesSinVerificar.length > 0) {
      return json(
        {
          error:
            "Hay normas descalificantes sin verificación documental. No se puede cerrar la evaluación hasta verificarlas.",
          normas_pendientes: descalificantesSinVerificar.map((f) => ({
            norma_titulo: f.norma_titulo,
            fuente: f.fuente,
          })),
        },
        422,
      );
    }

    // 3) ALERTA SUAVE — confianza global baja.
    //    Sin filas no hay nada que alertar (no debería pasar en la práctica:
    //    llegar a 'completa' implica que evaluar() ya insertó respuestas).
    const totalNormas = detalle.length;
    const pctVerificado = totalNormas === 0
      ? 100
      : Math.round(
        (detalle.filter((f) => f.nivel_confianza === "verificado").length / totalNormas) * 100,
      );

    if (pctVerificado < UMBRAL_CONFIANZA_MINIMO && !confirmarBajaConfianza) {
      const pctAutoreportado = 100 - pctVerificado;
      return json(
        {
          requiere_confirmacion: true,
          pct_verificado: pctVerificado,
          mensaje:
            `Esta evaluación se apoya en ${pctAutoreportado}% de datos autoreportados sin verificar. Confirma que la cierras bajo tu criterio.`,
        },
        200,
      );
    }

    // 4) Cerrar. No se recalcula ni se toca el resultado — ya está
    //    persistido desde que la evaluación pasó a 'completa'.
    //    `.eq("estado", "completa")` en el UPDATE (no solo en la lectura de
    //    arriba) evita una condición de carrera: si otra solicitud cerró la
    //    evaluación entre la validación y este punto, la actualización no
    //    afecta filas y lo tratamos como conflicto en vez de cerrar dos veces.
    const ahora = new Date().toISOString();
    const cambios: Record<string, unknown> = { estado: "cerrada", cerrada_en: ahora };
    if (cerradaPor) cambios.cerrada_por = cerradaPor;

    const { data: cerrada, error: eUpd } = await supabase
      .from("evaluaciones")
      .update(cambios)
      .eq("id", evaluacionId)
      .eq("estado", "completa")
      .select("id")
      .maybeSingle();
    if (eUpd) throw eUpd;
    if (!cerrada) {
      return json(
        { error: "La evaluación cambió de estado antes de completar el cierre. Vuelve a intentarlo." },
        409,
      );
    }

    return json({ evaluacion_id: evaluacionId, estado: "cerrada", cerrada_en: ahora }, 200);
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
