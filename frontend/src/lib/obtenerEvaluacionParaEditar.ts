import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';
import type { EvaluacionParaEditar } from '../types';

export async function obtenerEvaluacionParaEditar(evaluacionId: string): Promise<EvaluacionParaEditar> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/obtener-evaluacion-para-editar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ evaluacion_id: evaluacionId }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'No se pudo cargar la evaluación para editar.');
  }
  return data as EvaluacionParaEditar;
}
