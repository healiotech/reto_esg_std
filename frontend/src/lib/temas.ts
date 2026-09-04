import type { TemaEsg } from '../types';
import { BANDA_COLOR } from './banda';

/** Etiqueta legible de cada tema ESG (`normas.tema`). Clasificación fina, más
 *  específica que la dimensión Ambiental/Social/Gobernanza. */
export const TEMA_LABEL: Record<TemaEsg, string> = {
  agua: 'Agua',
  uso_suelo: 'Uso de suelo',
  sanidad: 'Sanidad',
  biodiversidad: 'Biodiversidad',
  derechos_laborales: 'Derechos laborales',
  contaminacion: 'Contaminación',
  comunidades_tierra: 'Comunidades y tierra',
  salud_seguridad: 'Salud y seguridad',
  permisos_licencias: 'Permisos y licencias',
  cambio_climatico: 'Cambio climático',
  residuos: 'Residuos',
  etiquetado: 'Etiquetado',
  economia_circular: 'Economía circular',
  requisitos_exportacion: 'Requisitos de exportación',
};

/** Nivel de materialidad cualitativo de un tema (`coef_materialidad_tema.banda`). */
export const BANDA_TEMA_LABEL: Record<string, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
  categorico: 'Categórico',
};

export const BANDA_TEMA_COLOR: Record<string, string> = {
  critico: BANDA_COLOR.Crítico,
  alto: BANDA_COLOR.Alto,
  medio: BANDA_COLOR.Medio,
  bajo: BANDA_COLOR.Bajo,
  categorico: 'var(--doc-ink-500)',
};
