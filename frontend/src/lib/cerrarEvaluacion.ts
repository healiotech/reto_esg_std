import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

export interface NormaPendiente {
  norma_titulo: string;
  fuente: string;
}

export class NormasPendientesError extends Error {
  normasPendientes: NormaPendiente[];

  constructor(message: string, normasPendientes: NormaPendiente[]) {
    super(message);
    this.name = 'NormasPendientesError';
    this.normasPendientes = normasPendientes;
  }
}

export type CerrarEvaluacionResultado =
  | { cerrada: true; evaluacionId: string; cerradaEn: string }
  | { cerrada: false; pctVerificado: number; mensaje: string };

export async function cerrarEvaluacion(
  evaluacionId: string,
  confirmarBajaConfianza = false,
): Promise<CerrarEvaluacionResultado> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cerrar-evaluacion`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ evaluacion_id: evaluacionId, confirmar_baja_confianza: confirmarBajaConfianza }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (res.status === 422 && Array.isArray(data?.normas_pendientes)) {
      throw new NormasPendientesError(
        data.error ?? 'Hay normas descalificantes sin verificación documental.',
        data.normas_pendientes,
      );
    }
    throw new Error(data?.error ?? 'No se pudo cerrar la evaluación.');
  }

  if (data?.requiere_confirmacion) {
    return { cerrada: false, pctVerificado: data.pct_verificado, mensaje: data.mensaje };
  }

  return { cerrada: true, evaluacionId: data.evaluacion_id, cerradaEn: data.cerrada_en };
}
