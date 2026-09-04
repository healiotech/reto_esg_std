import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

export interface NarrativaResultado {
  evaluacion_id: string;
  resumen_ejecutivo: string;
  generado_en: string;
}

/**
 * Genera (y persiste) el resumen ejecutivo narrativo de una evaluación vía la
 * edge function `generar-narrativa` (IA que traduce el análisis determinista a
 * prosa; no altera ningún número). Tarda unos segundos — es una llamada a un
 * modelo. Vuelve a llamarla regenera y consume otra llamada de IA.
 */
export async function generarNarrativa(evaluacionId: string): Promise<NarrativaResultado> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generar-narrativa`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ evaluacion_id: evaluacionId }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'No se pudo generar el resumen ejecutivo.');
  }
  return data as NarrativaResultado;
}
