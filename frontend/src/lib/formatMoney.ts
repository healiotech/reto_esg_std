export function formatMiles(n: number): string {
  return Math.round(n).toLocaleString('es-MX');
}

export function formatPesos(mxn: number): string {
  // El signo va antes del "$" (no "$-123") — relevante para el simulador
  // financiero, donde el flujo de caja libre proyectado puede ser negativo.
  const signo = mxn < 0 ? '-' : '';
  const abs = Math.abs(mxn);
  if (abs >= 1_000_000) {
    return `${signo}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  return `${signo}$${formatMiles(abs)}`;
}

export function formatRangoPesos(min: number, max: number): string {
  return min === max ? formatPesos(min) : `${formatPesos(min)} – ${formatPesos(max)}`;
}

/** Múltiplo tipo "3.0x" (apalancamiento, cobertura de intereses). null/Infinity/NaN → "—". */
export function formatVeces(n: number | null): string {
  return typeof n === 'number' && Number.isFinite(n) ? `${n.toFixed(1)}x` : '—';
}

/** Formatea una fracción 0..1 como porcentaje, ej. 0.183 → "18.3%". */
export function formatPctFraccion(n: number, decimales = 1): string {
  return Number.isFinite(n) ? `${(n * 100).toFixed(decimales)}%` : '—';
}
