import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';
import type { EvaluacionSesion } from '../types';

export async function listarEvaluaciones(): Promise<EvaluacionSesion[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/listar-evaluaciones`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'No se pudieron cargar las evaluaciones.');
  }
  return data as EvaluacionSesion[];
}
