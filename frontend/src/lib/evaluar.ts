import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';
import type { ClienteInput, ResultadoEvaluacion, RespuestaInput } from '../types';

export async function evaluar(
  cliente: ClienteInput,
  respuestas: RespuestaInput[],
  evaluacionId?: string,
): Promise<ResultadoEvaluacion> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/evaluar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cliente, respuestas, evaluacion_id: evaluacionId }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'No se pudo calcular el riesgo.');
  }
  return data as ResultadoEvaluacion;
}
