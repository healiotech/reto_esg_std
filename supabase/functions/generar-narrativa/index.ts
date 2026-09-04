// ============================================================================
//  EDGE FUNCTION: generar-narrativa
//  Despliegue:  supabase functions deploy generar-narrativa
//  Invocación:  POST { evaluacion_id }
//  Secret requerido: OPENAI_API_KEY (Supabase → Settings → Edge Functions → Secrets)
//
//  Genera un RESUMEN EJECUTIVO narrativo del análisis de un cliente, bajo demanda,
//  y lo persiste. La IA TRADUCE el resultado determinista a prosa estructurada —
//  NO calcula, NO inventa. Todos los números y hechos vienen del motor.
//
//  Modelo: gpt-4o-mini (barato, suficiente para traducir datos a prosa).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ----------------------------------------------------------------------------
//  SYSTEM PROMPT — el corazón de la narrativa. Define rol, estilo, estructura y
//  las reglas anti-alucinación. Cuidado para que la prosa tenga el nivel de
//  entendimiento de un analista de riesgo ESG de banca, no un texto genérico.
// ----------------------------------------------------------------------------
const SYSTEM_PROMPT = `Eres un analista senior de riesgos ESG de banca de desarrollo agropecuario. Redactas el RESUMEN EJECUTIVO de un dictamen de riesgo regulatorio para un cliente que solicita crédito. Tu lector es un comité de crédito y riesgos de Santander.

TU TAREA: traducir un análisis ya calculado (que recibes como datos estructurados) en una narrativa ejecutiva clara, en español, con la profundidad de entendimiento de un profesional del sector. NO calculas nada: todos los números, bandas, montos y hechos ya están en los datos. Los tejes en una historia coherente.

REGLAS INVIOLABLES (anti-alucinación):
- Usa ÚNICAMENTE los datos que se te entregan. No inventes cifras, normas, fechas ni hechos.
- No contradigas el veredicto. Si el nivel de riesgo es Crítico, la narrativa refleja gravedad; no la suavices ni la exageres.
- Para el riesgo operacional, usa SOLO los mecanismos operacionales que se te proporcionan por tema. No inventes otros mecanismos.
- No des asesoría legal específica ni interpretes la ley. Recomiendas gestión de riesgo y estructura de crédito, no interpretaciones jurídicas.
- Si un dato no está presente, no lo menciones. No rellenes huecos con supuestos.

ESTILO:
- Prosa profesional, natural y concisa. Nada de listas con viñetas dentro de las secciones: redacta en oraciones que fluyan.
- Nivel ejecutivo: preciso, sin relleno, sin adjetivos vacíos. Cada oración aporta.
- Cuenta una HISTORIA con lógica causal: el riesgo ESG amenaza la operación, la operación afecta las finanzas, las finanzas determinan la bancabilidad. Ese hilo causal debe sentirse.
- Cita cifras concretas cuando las tengas (montos, DSCR, spread, % de EBITDA), integradas en la prosa.

ESTRUCTURA — tres secciones, cada una con su encabezado en negrita seguido de " | " y luego el texto. Usa exactamente estos encabezados:

**Contexto de la operación** | Quién es el cliente, subsector, dónde opera, y el contexto geográfico relevante (p. ej. estrés hídrico del estado). Cierra con el nivel de riesgo general. 2 a 3 oraciones.

**Riesgos ESG y operacionales** | Síntesis fusionada de tres cosas, en una narrativa continua con hilo causal (NO una oración por cada una por separado): (a) las dimensiones/temas ESG concretos en los que el cliente incumple y por qué son materiales para su sector; (b) el mecanismo por el que ese incumplimiento amenaza la continuidad del negocio — usa los mecanismos operacionales provistos por tema (interrupción productiva, pérdida de certificación/mercado, clausura, etc.); (c) la exposición regulatoria estimada en pesos y cómo ese riesgo operacional se traduce en deterioro de los indicadores financieros (EBITDA, DSCR, etc.). Debe leerse como una sola cadena causal (incumplimiento → operación → dinero), no como tres bloques pegados. 3 a 5 oraciones en total.

**Bancabilidad y recomendación** | El veredicto crediticio (DSCR actual, si es sujeto de crédito, si requiere reestructuración de plazo o respaldo de garantía FEGA, y el spread actual frente al de cumplimiento) seguido de la recomendación concreta y accionable para el comité: qué verificar, cómo condicionar o estructurar el crédito, qué mitigar. 3 a 4 oraciones.

El resumen completo debe leerse en 20-30 segundos — denso pero breve, sin relleno. No repitas información entre secciones.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { evaluacion_id } = await req.json() as { evaluacion_id: string };
    if (!evaluacion_id) return json({ error: "Falta evaluacion_id" }, 400);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OPENAI_API_KEY no configurada" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Traer todo el contexto del análisis (ya calculado, determinista).
    const { data: ev, error: eEv } = await supabase
      .from("evaluaciones")
      .select("id, resultado, clientes(nombre, subsector, perfil_tamano, es_exportador, jurisdiccion_id, jurisdicciones(nombre, contexto_riesgo), sectores(nombre))")
      .eq("id", evaluacion_id)
      .maybeSingle();
    if (eEv) throw eEv;
    if (!ev) return json({ error: "Evaluación no encontrada" }, 404);

    const cli = (ev as any).clientes ?? {};
    const resultado = (ev as any).resultado ?? {};

    // 2) Detalle por norma (temas en riesgo) + mecanismos operacionales.
    const { data: detalle } = await supabase
      .from("v_riesgo_norma")
      .select("norma_titulo, tema, estatus, factor_incumplimiento, es_descalificante")
      .eq("evaluacion_id", evaluacion_id);

    const temasEnRiesgo = [...new Set((detalle ?? [])
      .filter((d: any) => Number(d.factor_incumplimiento) > 0)
      .map((d: any) => d.tema))];

    const { data: mecanismos } = await supabase
      .from("mecanismo_operacional_tema")
      .select("tema, mecanismo")
      .in("tema", temasEnRiesgo.length ? temasEnRiesgo : ["__none__"]);

    // 3) Simulación financiera (exposición, DSCR, spread, estructura) — se
    //    obtiene llamando a la función simular-financiero para consistencia.
    let sim: any = null;
    try {
      const simResp = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/simular-financiero`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ evaluacion_id }),
        },
      );
      if (simResp.ok) sim = await simResp.json();
    } catch (_) { /* si falla, la narrativa se genera sin la parte financiera */ }

    // 4) Armar el objeto de datos que se le da a la IA (todo ya calculado).
    const datos = {
      cliente: {
        nombre: cli.nombre,
        subsector: cli.subsector,
        tamano: cli.perfil_tamano,
        exporta: cli.es_exportador,
        sector: cli.sectores?.nombre,
        opera_en: cli.jurisdicciones?.nombre,
        contexto_estado: cli.jurisdicciones?.contexto_riesgo,
      },
      riesgo: {
        credito: resultado.credito ?? null,
        reputacion: resultado.reputacion ?? null,
        pct_autoreportado: resultado.pct_autoreportado ?? null,
      },
      normas_en_riesgo: (detalle ?? [])
        .filter((d: any) => Number(d.factor_incumplimiento) > 0)
        .map((d: any) => ({
          norma: d.norma_titulo, tema: d.tema, estatus: d.estatus,
          descalificante: d.es_descalificante,
        })),
      mecanismos_operacionales: mecanismos ?? [],
      financiero: sim ? {
        exposicion: sim.exposicion ?? null,
        actual: {
          indicadores: sim.actual?.indicadores,
          spread: sim.spread?.actual,
          estructura: sim.estructura_deuda?.actual,
        },
        cumple: {
          indicadores: sim.escenarios?.find((e: any) => e.vista === "cumple")?.indicadores,
          spread: sim.spread?.escenarios?.find((e: any) => e.vista === "cumple"),
          estructura: sim.estructura_deuda?.cumple,
        },
        perfil: sim.perfil_meta,
      } : null,
    };

    // 5) Llamar a OpenAI.
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,  // algo de naturalidad, pero controlado
        max_tokens: 500,   // 3 secciones cortas, no 6 — antes 900 se quedaba corto de sobra
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: "Datos del análisis (ya calculados). Redacta el resumen ejecutivo:\n\n" + JSON.stringify(datos, null, 2) },
        ],
      }),
    });

    if (!completion.ok) {
      const errTxt = await completion.text();
      return json({ error: "Error de OpenAI: " + errTxt }, 502);
    }
    const data = await completion.json();
    const resumen = data.choices?.[0]?.message?.content?.trim();
    if (!resumen) return json({ error: "OpenAI no devolvió contenido" }, 502);

    // 6) Persistir el resumen (evita regenerar y gastar créditos).
    const ahora = new Date().toISOString();
    await supabase
      .from("evaluaciones")
      .update({ resumen_ejecutivo: resumen, resumen_generado_en: ahora })
      .eq("id", evaluacion_id);

    return json({ evaluacion_id, resumen_ejecutivo: resumen, generado_en: ahora }, 200);
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