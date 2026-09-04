import { useEffect, useState } from 'react';
import { SantanderLogo } from './SantanderLogo';

// Alto fijo del header. Sidebar.tsx calcula su offset sticky y su altura a
// partir de este mismo valor (los dos deben moverse juntos si esto cambia).
export const NAVBAR_HEIGHT = 64;

interface NavbarProps {
  /** Ir a Inicio. En mobile (Sidebar oculto) es la única forma de volver ahí. */
  onIrAInicio: () => void;
}

// Barra simple: blanca y plana en reposo. Al desplazar, se vuelve translúcida
// con blur detrás — así el contenido que pasa debajo queda legible sin que la
// barra necesite una sombra dura para separarse de él.
export function Navbar({ onIrAInicio }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-40 flex flex-shrink-0 items-center justify-center transition-[background-color,box-shadow,border-color] duration-300"
      style={{
        height: NAVBAR_HEIGHT,
        background: scrolled ? 'rgba(255, 255, 255, 0.72)' : 'var(--doc-paper)',
        backdropFilter: scrolled ? 'blur(10px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(10px)' : 'none',
        borderBottom: `1px solid ${scrolled ? 'var(--doc-rule-strong)' : 'var(--doc-rule)'}`,
        boxShadow: scrolled ? '0 2px 8px rgba(0, 0, 0, 0.05)' : 'none',
      }}
    >
      <button
        type="button"
        onClick={onIrAInicio}
        aria-label="Ir a inicio — Análisis de Riesgos ESG"
        className="flex items-center gap-2.5 bg-transparent p-0 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
      >
        <SantanderLogo variant="mark" className="h-6 w-6" color="var(--color-brand)" />
        <span
          className="text-[13px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: 'var(--doc-ink-900)', fontFamily: 'var(--font-sans)' }}
        >
          Análisis de Riesgos ESG
        </span>
      </button>
    </header>
  );
}
