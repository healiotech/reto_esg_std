import type { ReactNode } from 'react';

// Encabezado de zona — el "letrero" que rotula cada sección y subsección de
// un documento del banco (Dirección de diseño "Santander institucional").
// Neutro oscuro por defecto; `master` es la franja de marca (roja), que solo
// se usa una vez, arriba del todo. Puramente presentacional.
interface ZonaHeaderProps {
  children: ReactNode;
  /** 'seccion' = franja principal (#1a1a1a). 'sub' = subsección (#333). 'master' = anclaje de marca (rojo). */
  nivel?: 'seccion' | 'sub' | 'master';
  /** Número de sección; se muestra atenuado a la izquierda del rótulo. */
  numero?: number;
  /** Texto/nodo alineado a la derecha, atenuado (p. ej. un conteo o una fecha). */
  meta?: ReactNode;
  /** Si se pasa, el rótulo expone semántica de encabezado (role=heading) a lectores de pantalla. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
  id?: string;
}

const NIVEL_CLASS: Record<NonNullable<ZonaHeaderProps['nivel']>, string> = {
  seccion: '',
  sub: 'ds-zone--sub',
  master: 'ds-zone--master',
};

export function ZonaHeader({ children, nivel = 'sub', numero, meta, headingLevel, className = '', id }: ZonaHeaderProps) {
  return (
    <div id={id} className={`ds-zone ${NIVEL_CLASS[nivel]} ${className}`.trim()}>
      {numero != null && <span className="ds-zone__num">{String(numero).padStart(2, '0')}</span>}
      <span
        className="ds-zone__label"
        role={headingLevel ? 'heading' : undefined}
        aria-level={headingLevel}
      >
        {children}
      </span>
      {meta != null && <span className="ds-zone__meta">{meta}</span>}
    </div>
  );
}
