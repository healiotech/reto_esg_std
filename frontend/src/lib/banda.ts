import type { Banda, ResultadoEvaluacion } from '../types';

export const BANDA_COLOR: Record<Banda, string> = {
  Bajo: '#00bf63',
  Medio: '#ffbd59',
  Alto: '#ec0100',
  Crítico: '#b00000',
};

export const BANDA_RANGO: Record<Banda, number> = { Bajo: 0, Medio: 1, Alto: 2, Crítico: 3 };

// Bajo y Medio son colores claros/saturados y necesitan texto oscuro para
// contraste legible; Alto y Crítico son suficientemente oscuros para texto blanco.
export const BANDA_TEXT_ON: Record<Banda, string> = {
  Bajo: '#04331b',
  Medio: '#3a2600',
  Alto: '#ffffff',
  Crítico: '#ffffff',
};

function rgbOf(banda: Banda): [number, number, number] {
  const hex = BANDA_COLOR[banda].replace('#', '');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

// Para CSS (fondos translúcidos sobre cualquier superficie).
export function bandaSoftBg(banda: Banda, alpha = 0.14): string {
  const [r, g, b] = rgbOf(banda);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Para jsPDF (no soporta alpha en fill): mezcla sólida con blanco al mismo ratio.
export function bandaSoftHex(banda: Banda, ratio = 0.14): string {
  const [r, g, b] = rgbOf(banda);
  const mix = (c: number) => Math.round(c * ratio + 255 * (1 - ratio));
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// Nivel de riesgo ESG general = peor banda de los canales crédito/reputación.
// Compartido por Clientes.tsx (cards de cartera) e Inicio.tsx (recientes),
// mismo criterio que la sección 1 de Resultados.
export function peorBandaGeneral(r: Pick<ResultadoEvaluacion, 'credito' | 'reputacion'>): Banda {
  return BANDA_RANGO[r.credito.banda] >= BANDA_RANGO[r.reputacion.banda] ? r.credito.banda : r.reputacion.banda;
}

export function normasEnRegla(r: Pick<ResultadoEvaluacion, 'detalle'>): number {
  return r.detalle.filter((d) => d.estatus === 'cumple').length;
}
