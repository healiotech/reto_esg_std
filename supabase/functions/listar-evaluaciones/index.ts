// ============================================================================
//  EDGE FUNCTION: listar-evaluaciones
//  Despliegue:  supabase functions deploy listar-evaluaciones
//  Invocación:  POST {}
//
//  Lectura de TODA la cartera de evaluaciones para la pantalla Cartera.
//  Usa SERVICE_ROLE (igual que evaluar/cerrar-evaluacion): no hay política RLS
//  para evaluaciones/clientes, así que el acceso pasa por acá y no por la key
//  anon directo desde el frontend.
//
//  Filtra evaluaciones sin `resultado` (borradores nunca terminados, incluidas
//  las 2 filas semilla insertadas por SQL directo en 01_esquema_riesgo.sql que
//  jamás pasaron por evaluar/index.ts) para no romper el mapeo a
//  EvaluacionSesion en el frontend, que asume `resultado` siempre presente.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FilaEvaluacion {
  id: string;
  fecha: string;
  resultado: unknown;
  cliente_id: string;
  estado: string;
  cerrada_en: string | null;
  cerrada_por: string | null;
  resumen_ejecutivo: string | null;
  resumen_generado_en: string | null;
  clientes: {
    numero_cliente: string | null;
    nombre: string;
    sector_id: string;
    jurisdiccion_id: string | null;
    perfil_tamano: string;
    es_exportador: boolean;
    en_zona_riesgo: boolean;
    zona_riesgo_nota: string | null;
    sectores: { nombre: string } | null;
    jurisdicciones: { nombre: string } | null;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("evaluaciones")
      .select(`
        id, fecha, resultado, cliente_id, estado, cerrada_en, cerrada_por,
        resumen_ejecutivo, resumen_generado_en,
        clientes!inner (
          numero_cliente, nombre, sector_id, jurisdiccion_id, perfil_tamano, es_exportador,
          en_zona_riesgo, zona_riesgo_nota,
          sectores ( nombre ),
          jurisdicciones ( nombre )
        )
      `)
      .not("resultado", "is", null)
      .order("fecha", { ascending: false });
    if (error) throw error;

    const filas = (data ?? []) as unknown as FilaEvaluacion[];

    const evaluaciones = filas.map((f) => ({
      id: f.id,
      cliente: {
        numero_cliente: f.clientes.numero_cliente ?? "",
        nombre: f.clientes.nombre,
        sector_id: f.clientes.sector_id,
        jurisdiccion_id: f.clientes.jurisdiccion_id,
        perfil_tamano: f.clientes.perfil_tamano,
        es_exportador: f.clientes.es_exportador,
        en_zona_riesgo: f.clientes.en_zona_riesgo,
        zona_riesgo_nota: f.clientes.zona_riesgo_nota,
      },
      sectorNombre: f.clientes.sectores?.nombre ?? "",
      jurisdiccionNombre: f.clientes.jurisdicciones?.nombre ?? "Sin especificar",
      // El JSON persistido en `resultado` (escrito por evaluar/calcular-score)
      // no incluye estas columnas — viven en la fila de `evaluaciones`, no en
      // el blob. El tipo `ResultadoEvaluacion` del frontend las requiere
      // (las usa el estado de cierre y ahora también el simulador financiero,
      // que necesita evaluacion_id para llamar a `simular-financiero`).
      resultado: {
        ...(f.resultado as object),
        evaluacion_id: f.id,
        cliente_id: f.cliente_id,
        estado: f.estado,
        cerrada_en: f.cerrada_en,
        cerrada_por: f.cerrada_por,
        resumen_ejecutivo: f.resumen_ejecutivo,
        resumen_generado_en: f.resumen_generado_en,
      },
      fecha: f.fecha,
    }));

    return json(evaluaciones, 200);
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
