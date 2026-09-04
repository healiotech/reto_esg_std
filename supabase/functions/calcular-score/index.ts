// ============================================================================
//  EDGE FUNCTION: calcular-score
//  Despliegue:  supabase functions deploy calcular-score
//  Invocación:  POST { "evaluacion_id": "..." }
//
//  El handler NO calcula: solo trae los datos que la vista v_riesgo_norma ya
//  dejó listos, resuelve tamaño/bandas, y delega en el motor puro (engine.ts).
//  Toda la matemática vive en engine.ts — testeable sin red ni despliegue.
//
//  Usa SERVICE_ROLE: se salta RLS por diseño (las tablas de cliente están
//  cerradas al frontend; el cálculo pasa siempre por aquí).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calcularScore, type Banda, type RiesgoNorma, type FactorTamano } from "./engine.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { evaluacion_id } = await req.json();
    if (!evaluacion_id) {
      return json({ error: "Falta evaluacion_id" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Detalle por norma (la vista ya hizo el cálculo crudo por canal)
    const { data: filas, error: e1 } = await supabase
      .from("v_riesgo_norma")
      .select("*")
      .eq("evaluacion_id", evaluacion_id);
    if (e1) throw e1;
    if (!filas || filas.length === 0) {
      return json({ error: "Evaluación sin respuestas o inexistente" }, 404);
    }

    // 2) Perfil de tamaño del cliente → factores
    const { data: ev, error: e2 } = await supabase
      .from("evaluaciones")
      .select("cliente_id, clientes(perfil_tamano)")
      .eq("id", evaluacion_id)
      .single();
    if (e2) throw e2;

    const perfil = (ev as any).clientes.perfil_tamano as string;
    const { data: ft, error: e3 } = await supabase
      .from("factores_tamano")
      .select("factor_credito, factor_reputacion")
      .eq("perfil", perfil)
      .single();
    if (e3) throw e3;

    // 3) Bandas
    const { data: bandas, error: e4 } = await supabase
      .from("bandas")
      .select("canal, etiqueta, limite_inferior, limite_superior")
      .order("orden");
    if (e4) throw e4;

    // 4) Motor puro
    const resultado = calcularScore(
      filas as RiesgoNorma[],
      bandas as Banda[],
      ft as FactorTamano,
    );

    return json(resultado, 200);
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}