import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';
import type { PerfilTamano, SubsectorAgro } from '../types';

/** Cliente ya registrado, tal como lo devuelve `buscar-cliente` cuando el número existe. */
export interface ClienteEncontrado {
  id: string;
  numero_cliente: string;
  nombre: string;
  sector_id: string;
  jurisdiccion_id: string;
  perfil_tamano: PerfilTamano;
  subsector: SubsectorAgro;
  es_exportador: boolean;
  en_zona_riesgo: boolean;
  zona_riesgo_nota: string | null;
  sectorNombre: string;
  jurisdiccionNombre: string;
}

export type ResultadoBusquedaCliente =
  | { existe: false }
  | { existe: true; cliente: ClienteEncontrado };

export async function buscarCliente(numeroCliente: string): Promise<ResultadoBusquedaCliente> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/buscar-cliente`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ numero_cliente: numeroCliente }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'No se pudo buscar el cliente.');
  }
  return data as ResultadoBusquedaCliente;
}
