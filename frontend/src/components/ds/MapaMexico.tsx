import { MEXICO_ESTADOS, MEXICO_VIEWBOX } from './mexico-geo';

// Localizador del estado de operación sobre un mapa de la República.
// Puramente presentacional: recibe el nombre del estado (jurisdiccionNombre),
// lo empareja con la geometría y resalta ese estado en el acento frío (sky).
// El resto del país queda en neutro. Sin rojo: esto es contexto, no alarma.

// Normaliza para emparejar: sin acentos, minúsculas, espacios simples.
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Nombres oficiales / largos de la BD que no coinciden 1:1 con los del mapa.
const ALIAS: Record<string, string> = {
  'ciudad de mexico': 'cmx',
  cdmx: 'cmx',
  'distrito federal': 'cmx',
  'estado de mexico': 'mex',
  mexico: 'mex',
  'michoacan de ocampo': 'mic',
  'coahuila de zaragoza': 'coa',
  'veracruz de ignacio de la llave': 'ver',
  'queretaro de arteaga': 'que',
};

/** Devuelve el id de estado del mapa para un nombre, o null si no hay match. */
function estadoIdDe(nombre: string): string | null {
  const n = norm(nombre);
  if (ALIAS[n]) return ALIAS[n];
  const hit = MEXICO_ESTADOS.find((e) => norm(e.nombre) === n);
  return hit ? hit.id : null;
}

interface MapaMexicoProps {
  /** Nombre del estado de operación. */
  estado: string;
  className?: string;
  /** Ancho del svg en px; el alto se deriva del viewBox (793 x 498). */
  ancho?: number;
}

export function MapaMexico({ estado, className, ancho = 200 }: MapaMexicoProps) {
  const activoId = estadoIdDe(estado);
  const alto = Math.round((ancho * 498) / 793);
  // El estado resaltado se pinta al final para que su contorno quede encima.
  const orden = activoId
    ? [
        ...MEXICO_ESTADOS.filter((e) => e.id !== activoId),
        ...MEXICO_ESTADOS.filter((e) => e.id === activoId),
      ]
    : MEXICO_ESTADOS;

  return (
    <svg
      viewBox={MEXICO_VIEWBOX}
      width={ancho}
      height={alto}
      className={className}
      style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label={activoId ? `Mapa de México con ${estado} resaltado` : 'Mapa de México'}
    >
      {orden.map((e) => {
        const activo = e.id === activoId;
        return (
          <path
            key={e.id}
            d={e.d}
            fill={activo ? 'var(--ctx-300)' : 'var(--doc-rule)'}
            stroke={activo ? 'var(--ctx-500)' : 'var(--doc-rule-strong)'}
            strokeWidth={activo ? 1.5 : 0.5}
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
