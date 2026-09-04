import type { ReactNode } from 'react';
import { NAVBAR_HEIGHT } from './Navbar';
import { SantanderLogo } from './SantanderLogo';

export type Seccion = 'inicio' | 'cartera';

interface NavItem {
  key: Seccion;
  label: string;
  icon: ReactNode;
}

const ICON_PROPS = { viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true } as const;
// strokeWidth 2.0 en todos los iconos (peso consistente, ver design-taste-frontend
// Rule 1) — antes en 1.6 los glifos delgados (personas, flecha) leían más
// livianos/pequeños que la casa, aunque compartían el mismo viewBox.
const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const NAV_ITEMS: NavItem[] = [
  {
    key: 'inicio',
    label: 'Inicio',
    icon: (
      <svg {...ICON_PROPS}>
        <path {...stroke} d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    key: 'cartera',
    label: 'Cartera',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="7.3" cy="6.3" r="2.7" {...stroke} />
        <path {...stroke} d="M2.2 16.3c0-2.9 2.3-4.6 5.1-4.6s5.1 1.7 5.1 4.6" />
        <circle cx="14.4" cy="6.7" r="2.2" {...stroke} />
        <path {...stroke} d="M12.7 12c2.5.2 4.3 1.9 4.3 4.5" />
      </svg>
    ),
  },
];

const PLUS_ICON = (
  <svg width={18} height={18} viewBox="0 0 20 20" fill="none" aria-hidden>
    <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M10 4.5v11M4.5 10h11" />
  </svg>
);

// Ease-out exponencial: la expansión del riel es una acción del usuario
// (hover), no un evento del sistema — sale rápido y frena suave, sin el
// arranque simétrico de una curva ease-in-out.
const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';

interface SidebarProps {
  activo: Seccion;
  onNavegar: (seccion: Seccion) => void;
  onNuevaEvaluacion: () => void;
}

export function Sidebar({ activo, onNavegar, onNuevaEvaluacion }: SidebarProps) {
  return (
    // Placeholder de 80px siempre reservado en el flex-row de App.tsx: el riel
    // visual vive adentro, position:absolute, para que expandirse al hover no
    // empuje el contenido — solo se superpone por encima (overlay).
    // sticky + altura fija (100dvh menos los 24px de margen vertical) para que
    // el panel NO crezca con el alto de la página — antes se estiraba (align-
    // items:stretch del flex-row) hasta el alto del contenido más largo.
    // z-30 en el propio <aside>, no solo en el riel interno: al ser
    // position:sticky, el <aside> ya crea su propio contexto de apilamiento
    // aunque no tenga z-index — así que el zIndex:20 del riel interno solo
    // compite puertas adentro. Hacia afuera, sin z-index propio, el <aside>
    // se trata como z-index:auto y pierde contra CUALQUIER elemento con
    // z-index explícito en el resto de la página (p.ej. el z-10 del detalle
    // blur de ScoreCard), aunque ese valor sea menor que 20.
    <aside
      className="relative z-30 hidden md:sticky md:my-3 md:ml-3 md:block md:w-20 md:flex-shrink-0"
      style={{ top: NAVBAR_HEIGHT + 12, height: `calc(100dvh - ${NAVBAR_HEIGHT + 24}px)` }}
    >
      <div
        className="group absolute inset-y-0 left-0 flex w-20 flex-col overflow-hidden px-3 py-4 transition-[width,box-shadow] duration-300 hover:w-64 hover:shadow-[var(--shadow-raised)]"
        style={{
          background: 'var(--neutral-100)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-l)',
          boxShadow: 'var(--shadow-card)',
          transitionTimingFunction: EASE_OUT_EXPO,
          zIndex: 20,
        }}
      >
        <div className="flex flex-col gap-2.5">
          {/* w-full + justify-center (estático, nunca alterna) en vez de dejar
              el botón de 40px con ancho fijo suelto en un contenedor que
              hace stretch por defecto — así queda centrado de verdad en vez
              de pegado a la izquierda. */}
          <div className="flex w-full justify-center">
            <button
              type="button"
              onClick={() => onNavegar('inicio')}
              aria-label="Ir a inicio — Santander Riesgo ESG"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none"
              style={{ borderRadius: 'var(--radius-m)' }}
            >
              <SantanderLogo variant="mark" className="h-7 w-7" color="var(--color-brand)" />
            </button>
          </div>

          <NavIconButton icon={PLUS_ICON} label="Nueva evaluación" variant="brand" onClick={onNuevaEvaluacion} className="mb-3" />

          <nav className="flex flex-col gap-3">
            {NAV_ITEMS.map((item) => (
              <NavIconButton
                key={item.key}
                icon={item.icon}
                label={item.label}
                activo={item.key === activo}
                onClick={() => onNavegar(item.key)}
              />
            ))}
          </nav>
        </div>
      </div>
    </aside>
  );
}

interface NavIconButtonProps {
  icon: ReactNode;
  label: string;
  ariaLabel?: string;
  activo?: boolean;
  variant?: 'subtle' | 'brand';
  onClick?: () => void;
  className?: string;
}

function NavIconButton({ icon, label, ariaLabel, activo = false, variant = 'subtle', onClick, className = '' }: NavIconButtonProps) {
  const brandFill = variant === 'brand';
  const hoverable = !activo && !brandFill;

  // Inline `style` siempre gana sobre clases `hover:`, así que background/color
  // solo pueden fijarse por style cuando NO hay estado :hover que deba
  // sobreescribirlos — el caso "hoverable" delega esas dos propiedades a
  // clases (base + hover:) para que la cascada de CSS sí pueda alternarlas.
  const colorStyle = hoverable
    ? {}
    : {
        background: brandFill ? 'var(--color-brand)' : 'var(--color-brand-soft)',
        color: brandFill ? 'var(--text-on-brand)' : 'var(--color-brand)',
      };

  return (
    <span className={`group/item relative block ${className}`}>
      {/* El <button> es el área clickeable (toda la fila, para que también se
          pueda hacer clic sobre el label revelado) pero es puramente un
          contenedor de layout — sin fondo propio. Todo el color/fondo vive en
          el "chip" interno de tamaño fijo (40x40), así el botón visible nunca
          se ve ancho/desproporcionado y queda centrado con un padding fijo en
          vez de justify-content (que no es animable y saltaba de golpe). */}
      <button
        type="button"
        aria-label={ariaLabel ?? label}
        aria-current={activo ? 'page' : undefined}
        onClick={onClick}
        className="group/btn flex w-full flex-shrink-0 cursor-pointer items-center gap-3 pl-2 focus:outline-none"
      >
        <span
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center transition-transform duration-150 group-active/btn:scale-95 group-focus-visible/btn:shadow-[var(--shadow-focus)] ${
            hoverable
              ? '[background:transparent] [color:var(--text-tertiary)] group-hover/btn:[background:var(--neutral-0)] group-hover/btn:[color:var(--text-primary)]'
              : ''
          }`}
          style={{
            borderRadius: brandFill ? 'var(--radius-pill)' : 'var(--radius-m)',
            ...colorStyle,
          }}
        >
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{icon}</span>
        </span>
        <span
          className="max-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm font-medium opacity-0 transition-[max-width,opacity] duration-300 group-hover:max-w-[165px] group-hover:opacity-100"
          style={{ fontFamily: 'var(--font-sans)', transitionTimingFunction: EASE_OUT_EXPO }}
        >
          {label}
        </span>
      </button>

      {/* Tooltip solo para navegación por teclado: al expandirse por hover el
          label ya queda visible inline, así que el mouse nunca necesita esto. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-10 ml-3 -translate-y-1/2 scale-95 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium opacity-0 transition-[opacity,transform] group-focus-within/item:scale-100 group-focus-within/item:opacity-100"
        style={{
          background: 'var(--neutral-900)',
          color: 'var(--text-on-dark)',
          fontFamily: 'var(--font-sans)',
          transitionDuration: 'var(--duration-fast)',
          transitionTimingFunction: 'var(--ease-standard)',
        }}
      >
        {label}
      </span>
    </span>
  );
}
