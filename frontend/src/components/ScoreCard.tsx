import type { CanalResultado } from '../types';
import { BANDA_COLOR, BANDA_RANGO } from '../lib/banda';
import { ZonaHeader } from './ds/ZonaHeader';

export { BANDA_RANGO };

const BANDAS_ORDEN: CanalResultado['banda'][] = ['Bajo', 'Medio', 'Alto', 'Crítico'];

interface ScoreCardProps {
  titulo: string;
  resultado: CanalResultado;
  /** Opcional: si no se pasa, la tarjeta no renderiza la sección "Análisis:"
   *  (p.ej. cuando ese texto se reubica en otro bloque de la pantalla). */
  analisis?: string;
}

export function ScoreCard({ titulo, resultado, analisis }: ScoreCardProps) {
  const { score, banda, score_base, max_norma, forzado_por_descalificante, multiplicador_sistemico, factor_tamano } = resultado;
  const posicion = BANDA_RANGO[banda];
  const gaugeColor = BANDA_COLOR[banda];
  // Rojo dosificado: el score toma el color de banda solo cuando el riesgo es
  // real (Alto/Crítico). En Bajo/Medio va en neutro y es la escala de bandas
  // de abajo la que comunica el nivel.
  const grave = banda === 'Alto' || banda === 'Crítico';
  const scoreColor = grave ? gaugeColor : 'var(--doc-ink-900)';

  return (
    <div className="relative flex flex-col h-full" style={{ background: 'var(--doc-paper)' }}>
      <ZonaHeader nivel="sub" headingLevel={3}>
        {titulo}
      </ZonaHeader>
      <div className="z-10 relative flex flex-col flex-1 px-[var(--pad-x)] py-5">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="ds-figure" style={{ fontSize: 'var(--figure-2xl)', color: scoreColor }}>
                {score.toFixed(3)}
              </span>
              <span className="text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
                Nivel {banda}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div
            className="relative h-1.5"
            style={{
              background: `linear-gradient(90deg, ${BANDA_COLOR.Bajo} 0%, ${BANDA_COLOR.Bajo} 25%, ${BANDA_COLOR.Medio} 25%, ${BANDA_COLOR.Medio} 50%, ${BANDA_COLOR.Alto} 50%, ${BANDA_COLOR.Alto} 75%, ${BANDA_COLOR.Crítico} 75%, ${BANDA_COLOR.Crítico} 100%)`,
            }}
          >
            <div
              className="top-1/2 absolute w-3 h-3"
              style={{
                left: `${(posicion + 0.5) * 25}%`,
                transform: 'translate(-50%, -50%)',
                background: '#fff',
                border: `2px solid ${gaugeColor}`,
                boxShadow: '0 0 0 3px var(--doc-paper)',
              }}
            />
          </div>
          {/* Etiquetas centradas bajo el centro de cada segmento, para que el
              marcador apunte a su banda. */}
          <div className="grid grid-cols-4 mt-2 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--doc-ink-500)' }}>
            {BANDAS_ORDEN.map((b) => (
              <span
                key={b}
                className="text-center"
                style={b === banda ? { color: 'var(--doc-ink-900)', fontWeight: 700 } : undefined}
              >
                {b}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div
            className="grid grid-cols-3"
            style={{
              gap: '1px',
              background: 'var(--doc-rule)',
              border: '1px solid var(--doc-rule)',
              borderRadius: 'var(--radius-control)',
              overflow: 'clip',
            }}
          >
            <Stat label="Base normativa" valor={score_base.toFixed(3)} />
            <Stat label="P. máximo norma" valor={max_norma.toFixed(2)} />
            <Stat label="Factor tamaño" valor={`×${factor_tamano}`} />
          </div>
        </div>

        {analisis && (
          <div className="mt-5">
            <h4 className="m-0 font-bold text-[13px]" style={{ color: 'var(--doc-ink-900)' }}>
              Análisis
            </h4>
            <p className="m-0 mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--doc-ink-500)' }}>
              {analisis}
            </p>
          </div>
        )}
      </div>

      {forzado_por_descalificante && (
        <Aviso texto={
          <>
            <strong className="font-semibold">Norma descalificante incumplida.</strong> Este canal se fuerza a su banda máxima, sin importar
            el resto del puntaje.
          </>
        } />
      )}
      {multiplicador_sistemico > 1 && (
        <Aviso
          texto={
            <>
              Riesgo detectado en múltiples categorías.{' '}
              <a href="#evidencia-esg" className="whitespace-nowrap ds-link">
                Revisar<span aria-hidden="true"></span>
              </a>
            </>
          }
        />
      )}
    </div>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="px-3 py-2.5" style={{ background: 'var(--doc-paper)' }}>
      {/* min-h de 2 líneas: labels como "P. máximo norma" envuelven a 2 líneas
          mientras "Base normativa"/"Factor tamaño" caben en 1 — sin esta altura
          fija, el valor de abajo queda a distinta altura por columna. */}
      <div className="mb-1.5 min-h-[26px] leading-[13px] ds-eyebrow">{label}</div>
      <div className="ds-figure" style={{ fontSize: '0.9375rem', color: 'var(--doc-ink-900)' }}>
        {valor}
      </div>
    </div>
  );
}

function Aviso({ texto }: { texto: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 px-[var(--pad-x)] py-3.5 text-[13px]"
      style={{ color: 'var(--doc-ink-900)', borderTop: '1px solid var(--doc-rule)' }}
    >
      <AlertBadge />
      <span>{texto}</span>
    </div>
  );
}

// Distintivo de alarma: círculo rojo sólido con signo de admiración blanco.
// Marca riesgo real (norma descalificante, patrón sistémico), no contexto
// informativo. El rojo de banda (#ec0100), no el de marca.
export function AlertBadge({ size = 26 }: { size?: number }) {
  return (
    <span
      className="inline-flex flex-shrink-0 justify-center items-center"
      style={{ width: size, height: size, borderRadius: 999, background: 'var(--risk-alto)' }}
      aria-hidden="true"
    >
      <svg width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} viewBox="0 0 24 24" fill="none">
        <path d="M12 5.25v8.5" stroke="#ffffff" strokeWidth="2.75" strokeLinecap="round" />
        <circle cx="12" cy="18.5" r="1.55" fill="#ffffff" />
      </svg>
    </span>
  );
}

export function AlertIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5" aria-hidden="true">
      <path d="M12 3L2 20h20L12 3z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
