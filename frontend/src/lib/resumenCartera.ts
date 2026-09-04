import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';
import type { ResumenCartera } from '../types';

export async function resumenCartera(): Promise<ResumenCartera> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/resumen-cartera`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'No se pudo cargar el resumen de cartera.');
  }
  return data as ResumenCartera;
}
