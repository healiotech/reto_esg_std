import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';
import type { PerfilFinanciero, SimulacionFinanciera } from '../types';

// Capa de proyección financiera SOBRE una evaluación ya calculada: nunca
// re-evalúa el riesgo (el score permanece fijo). `perfilCustom` permite
// explorar supuestos distintos del cliente en vivo, sin persistir nada.
export async function simularFinanciero(
  evaluacionId: string,
  perfilCustom?: Partial<PerfilFinanciero>,
): Promise<SimulacionFinanciera> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/simular-financiero`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      evaluacion_id: evaluacionId,
      ...(perfilCustom ? { perfil_custom: perfilCustom } : {}),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'No se pudo simular el impacto financiero.');
  }
  return data as SimulacionFinanciera;
}
