// ============================================================================
//  EDGE FUNCTION: obtener-evaluacion-para-editar
//  Despliegue:  supabase functions deploy obtener-evaluacion-para-editar
//  Invocación:  POST { evaluacion_id }
//
//  Trae los datos necesarios para reabrir el Cuestionario precargado: datos
//  del cliente + respuestas guardadas. Las respuestas se leen directo de la
//  tabla `respuestas` (no de resultado.detalle, que solo tiene norma_clave,
//  no norma_id — y ese contrato del motor de score no se toca).
//
//  Usa SERVICE_ROLE por la misma razón que el resto de las funciones sobre
//  evaluaciones: no hay política RLS para evaluaciones/clientes/respuestas.
//
//  Regla: bloquea si la evaluación ya está 'cerrada' (inmutable), para que el
//  formulario de edición ni se abra.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ObtenerInput {
  evaluacion_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as Partial<ObtenerInput>;
    const evaluacionId = body.evaluacion_id;
    if (!evaluacionId) {
      return json({ error: "Falta evaluacion_id" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: evaluacion, error: eEval } = await supabase
      .from("evaluaciones")
      .select("id, estado, cliente_id")
      .eq("id", evaluacionId)
      .maybeSingle();
    if (eEval) throw eEval;
    if (!evaluacion) {
      return json({ error: "Evaluación no encontrada" }, 404);
    }
    if (evaluacion.estado === "cerrada") {
      return json({ error: "No se puede editar una evaluación cerrada." }, 409);
    }

    const { data: cliente, error: eCli } = await supabase
      .from("clientes")
      .select(
        "numero_cliente, nombre, sector_id, jurisdiccion_id, perfil_tamano, subsector, es_exportador, en_zona_riesgo, zona_riesgo_nota, sectores(nombre), jurisdicciones(nombre)",
      )
      .eq("id", evaluacion.cliente_id)
      .single();
    if (eCli) throw eCli;

    const { data: respuestas, error: eResp } = await supabase
      .from("respuestas")
      .select("norma_id, estatus, nivel_confianza, documento_url")
      .eq("evaluacion_id", evaluacionId);
    if (eResp) throw eResp;

    const cli = cliente as unknown as {
      numero_cliente: string | null;
      nombre: string;
      sector_id: string;
      jurisdiccion_id: string | null;
      perfil_tamano: string;
      subsector: "ganaderia" | "agricultura" | null;
      es_exportador: boolean;
      en_zona_riesgo: boolean;
      zona_riesgo_nota: string | null;
      sectores: { nombre: string } | null;
      jurisdicciones: { nombre: string } | null;
    };

    return json({
      evaluacion_id: evaluacionId,
      cliente: {
        numero_cliente: cli.numero_cliente ?? "",
        nombre: cli.nombre,
        sector_id: cli.sector_id,
        // ClienteInput.jurisdiccion_id no es nullable en el frontend; filas
        // antiguas (previas a 05_jurisdicciones.sql, sin backfill) pueden
        // tener NULL acá. Se degrada a '' en vez de reventar el tipo.
        jurisdiccion_id: cli.jurisdiccion_id ?? "",
        perfil_tamano: cli.perfil_tamano,
        subsector: cli.subsector ?? "ganaderia",
        es_exportador: cli.es_exportador,
        en_zona_riesgo: cli.en_zona_riesgo,
        zona_riesgo_nota: cli.zona_riesgo_nota,
      },
      sectorNombre: cli.sectores?.nombre ?? "",
      jurisdiccionNombre: cli.jurisdicciones?.nombre ?? "Sin especificar",
      respuestas: respuestas ?? [],
    }, 200);
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
