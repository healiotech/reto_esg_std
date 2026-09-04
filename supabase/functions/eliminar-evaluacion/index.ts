// ============================================================================
//  EDGE FUNCTION: eliminar-evaluacion
//  Despliegue:  supabase functions deploy eliminar-evaluacion
//  Invocación:  POST { evaluacion_id }
//
//  Borrado definitivo de una evaluación. `respuestas` cae en cascada solo
//  (FK on delete cascade, ver 01_esquema_riesgo.sql). NO se borra la fila de
//  `clientes` asociada: mantener el blast radius mínimo — el esquema permite
//  varias evaluaciones por cliente aunque hoy evaluar/index.ts siempre cree
//  un cliente nuevo por evaluación.
//
//  Usa SERVICE_ROLE (igual que cerrar-evaluacion): escritura sensible, no debe
//  pasar por el frontend con la key anon.
//
//  Regla: una evaluación 'cerrada' es inmutable, igual que cerrar-evaluacion
//  bloquea recerrar. El DELETE lleva `.neq("estado", "cerrada")` además del
//  chequeo previo, para cerrar la misma ventana de carrera que documenta
//  cerrar-evaluacion (otra pestaña pudo cerrar la evaluación entre el chequeo
//  y el borrado).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EliminarInput {
  evaluacion_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as Partial<EliminarInput>;
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
      .select("id, estado")
      .eq("id", evaluacionId)
      .maybeSingle();
    if (eEval) throw eEval;
    if (!evaluacion) {
      return json({ error: "Evaluación no encontrada" }, 404);
    }
    if (evaluacion.estado === "cerrada") {
      return json({ error: "No se puede eliminar una evaluación cerrada." }, 409);
    }

    const { data: borrada, error: eDel } = await supabase
      .from("evaluaciones")
      .delete()
      .eq("id", evaluacionId)
      .neq("estado", "cerrada")
      .select("id")
      .maybeSingle();
    if (eDel) throw eDel;
    if (!borrada) {
      return json(
        { error: "La evaluación cambió de estado antes de completar la eliminación. Vuelve a intentarlo." },
        409,
      );
    }

    return json({ evaluacion_id: evaluacionId, eliminada: true }, 200);
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
