// ============================================================================
//  EDGE FUNCTION: buscar-cliente
//  Despliegue:  supabase functions deploy buscar-cliente
//  Invocación:  POST { numero_cliente }
//
//  Búsqueda de un cliente por su número de cliente del banco
//  (clientes.numero_cliente, UNIQUE). La usa el formulario de nueva evaluación
//  para deduplicar: si el número ya existe, la evaluación se VINCULA a ese
//  cliente (1 cliente → muchas evaluaciones) en vez de crear una fila nueva.
//
//  Usa SERVICE_ROLE por la misma razón que el resto de funciones sobre
//  clientes/evaluaciones: no hay política RLS para esas tablas.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BuscarInput {
  numero_cliente: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as Partial<BuscarInput>;
    const numeroCliente = body.numero_cliente?.trim();
    if (!numeroCliente) {
      return json({ error: "Falta numero_cliente" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("clientes")
      .select(`
        id, nombre, sector_id, jurisdiccion_id, perfil_tamano, subsector,
        es_exportador, en_zona_riesgo, zona_riesgo_nota,
        sectores ( nombre ),
        jurisdicciones ( nombre )
      `)
      .eq("numero_cliente", numeroCliente)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      return json({ existe: false }, 200);
    }

    const c = data as unknown as {
      id: string;
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
      existe: true,
      cliente: {
        id: c.id,
        numero_cliente: numeroCliente,
        nombre: c.nombre,
        sector_id: c.sector_id,
        jurisdiccion_id: c.jurisdiccion_id ?? "",
        perfil_tamano: c.perfil_tamano,
        subsector: c.subsector ?? "ganaderia",
        es_exportador: c.es_exportador,
        en_zona_riesgo: c.en_zona_riesgo,
        zona_riesgo_nota: c.zona_riesgo_nota,
        sectorNombre: c.sectores?.nombre ?? "",
        jurisdiccionNombre: c.jurisdicciones?.nombre ?? "Sin especificar",
      },
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
