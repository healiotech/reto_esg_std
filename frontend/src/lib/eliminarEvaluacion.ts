import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

export async function eliminarEvaluacion(evaluacionId: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/eliminar-evaluacion`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ evaluacion_id: evaluacionId }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data?.error ?? 'No se pudo eliminar la evaluación.');
  }
}
