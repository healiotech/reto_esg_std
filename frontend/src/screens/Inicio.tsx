import { useEffect, useState } from 'react';
import type { Banda, EvaluacionSesion, ResultadoEvaluacion, ResumenCartera } from '../types';
import { Button } from '../components/ds/Button';
import { SantanderLogo } from '../components/SantanderLogo';
import { ZonaHeader } from '../components/ds/ZonaHeader';
import { BANDA_COLOR, normasEnRegla, peorBandaGeneral } from '../lib/banda';
import { formatPesos } from '../lib/formatMoney';
import { resumenCartera } from '../lib/resumenCartera';
import { TEMA_LABEL, BANDA_TEMA_LABEL, BANDA_TEMA_COLOR } from '../lib/temas';

const BANDAS: Banda[] = ['Bajo', 'Medio', 'Alto', 'Crítico'];

interface InicioProps {
  evaluaciones: EvaluacionSesion[];
  onNuevaEvaluacion: () => void;
  onVerCartera: () => void;
  onVerEvaluacion: (evaluacion: EvaluacionSesion) => void;
}

export function Inicio({ evaluaciones, onNuevaEvaluacion, onVerCartera, onVerEvaluacion }: InicioProps) {
  const [resumen, setResumen] = useState<ResumenCartera | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(true);
  const [errorResumen, setErrorResumen] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargandoResumen(true);
    setErrorResumen(null);
    resumenCartera()
      .then((r) => {
        if (!cancelado) setResumen(r);
      })
      .catch((e) => {
        if (!cancelado) setErrorResumen(e instanceof Error ? e.message : 'No se pudo cargar el panorama de cartera.');
      })
      .finally(() => {
        if (!cancelado) setCargandoResumen(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const sinCartera = evaluaciones.length === 0;

  return (
    <div className="resultados-root flex min-h-full flex-col" style={{ background: 'var(--doc-paper-sunk)' }}>
      <div className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ds-eyebrow">Panorama de cartera</div>
            <h1 className="ds-title m-0 mt-1" style={{ fontSize: 'var(--title-page)', color: 'var(--doc-ink-900)' }}>
              Inicio
            </h1>
          </div>
          <Button variant="primary" size="m" onClick={onNuevaEvaluacion}>
            Nueva evaluación
          </Button>
        </div>

        {sinCartera ? (
          <div className="ds-panel ds-rise mt-6 p-8">
            <p className="m-0 text-[14px]" style={{ color: 'var(--doc-ink-500)' }}>
              Aún no hay evaluaciones registradas.
            </p>
            <div className="mt-4">
              <Button variant="primary" size="m" onClick={onNuevaEvaluacion}>
                Nueva evaluación
              </Button>
            </div>
          </div>
        ) : (
          <>
            {errorResumen && (
              <div
                className="ds-panel ds-rise mt-6 px-4 py-3 text-[13px]"
                style={{ color: 'var(--state-danger)' }}
              >
                {errorResumen}
              </div>
            )}

            {cargandoResumen && !resumen && (
              <div className="ds-panel ds-rise mt-6 px-4 py-8 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
                Calculando panorama de cartera…
              </div>
            )}

            {resumen && (
              <>
                <ExposicionYRiesgo resumen={resumen} className="mt-6" />
                <TopVulnerabilidades resumen={resumen} className="mt-4" />
                <PipelineEstructuracion resumen={resumen} className="mt-4" />
              </>
            )}

            <Recientes evaluaciones={evaluaciones} onVerEvaluacion={onVerEvaluacion} onVerCartera={onVerCartera} className="mt-4" />
          </>
        )}
      </div>

      <div
        className="mt-8 flex items-center gap-2.5 px-4 py-4 sm:px-8"
        style={{ background: 'var(--zone-bg)', color: 'var(--zone-fg-dim)' }}
      >
        <SantanderLogo variant="mark" className="h-4 w-4" color="var(--zone-fg-dim)" />
        <span className="text-[12px]">Banco Santander · Modelo de riesgo ESG</span>
      </div>
    </div>
  );
}

// ── Bloque 1 · Exposición y riesgo de la cartera ────────────────────────────
function ExposicionYRiesgo({ resumen, className = '' }: { resumen: ResumenCartera; className?: string }) {
  const { exposicion_total_mxn, valor_en_riesgo_mxn, total_clientes, distribucion } = resumen;
  const pctEnRiesgo = exposicion_total_mxn > 0 ? Math.round((valor_en_riesgo_mxn / exposicion_total_mxn) * 100) : 0;
  const clientesEnRiesgo = distribucion
    .filter((d) => d.banda === 'Alto' || d.banda === 'Crítico')
    .reduce((s, d) => s + d.clientes, 0);

  // El anillo se dimensiona por exposición; si toda la cartera está en $0, cae
  // a proporción por nº de clientes para no quedar vacío.
  const porExposicion = exposicion_total_mxn > 0;
  const valorDe = (d: { clientes: number; exposicion_mxn: number }) => (porExposicion ? d.exposicion_mxn : d.clientes);
  const totalBase = distribucion.reduce((s, d) => s + valorDe(d), 0);

  return (
    <div className={`ds-panel ds-rise ${className}`}>
      <ZonaHeader nivel="seccion" numero={1} headingLevel={2}>
        Exposición y riesgo de la cartera
      </ZonaHeader>
      <div className="flex flex-col gap-y-6 sm:flex-row sm:items-stretch">
        {/* Lado financiero — el "cuánto" */}
        <div className="min-w-0 px-[var(--pad-x)] pb-6 pt-5 sm:flex-1 sm:pr-8">
          <div className="ds-eyebrow">Exposición regulatoria potencial</div>
          <div className="ds-figure mt-2" style={{ fontSize: 'var(--figure-hero)', color: 'var(--doc-ink-900)' }}>
            {formatPesos(exposicion_total_mxn)}
          </div>
          <p className="m-0 mt-2 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
            Suma de la multa máxima estimada · {total_clientes} {total_clientes === 1 ? 'cliente' : 'clientes'}
          </p>

          <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--doc-rule)' }}>
            <div className="ds-eyebrow">Capital en riesgo · banda alta o crítica</div>
            <div className="ds-figure mt-2" style={{ fontSize: 'var(--figure-xl)', color: 'var(--risk-alto)' }}>
              {formatPesos(valor_en_riesgo_mxn)}
            </div>
            <p className="m-0 mt-2 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
              {clientesEnRiesgo} {clientesEnRiesgo === 1 ? 'cliente' : 'clientes'} · {pctEnRiesgo}% de la exposición total
            </p>
          </div>
        </div>

        {/* Lado ESG — el "por qué" */}
        <div
          className="min-w-0 px-[var(--pad-x)] pb-6 pt-5 sm:flex-1 sm:pl-8"
          style={{ borderTop: '1px solid var(--doc-rule)' }}
        >
          <div className="ds-eyebrow">Distribución del riesgo</div>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
            <AnilloRiesgo
              distribucion={distribucion}
              valorDe={valorDe}
              totalBase={totalBase}
              centroValor={porExposicion ? formatPesos(exposicion_total_mxn) : String(total_clientes)}
              centroEtiqueta={porExposicion ? 'exposición total' : 'clientes'}
            />
            <ul className="m-0 flex w-full min-w-0 flex-1 list-none flex-col gap-2.5 p-0">
              {BANDAS.map((banda) => {
                const d = distribucion.find((x) => x.banda === banda) ?? { clientes: 0, exposicion_mxn: 0 };
                const pct = totalBase > 0 ? Math.round((valorDe(d) / totalBase) * 100) : 0;
                return (
                  <li key={banda} className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0"
                      style={{ background: BANDA_COLOR[banda], borderRadius: 2 }}
                      aria-hidden="true"
                    />
                    <span className="w-14 flex-shrink-0 text-[12px] font-medium" style={{ color: 'var(--doc-ink-700)' }}>
                      {banda}
                    </span>
                    <span className="flex-1 text-[12px] tabular-nums" style={{ color: 'var(--doc-ink-500)' }}>
                      {pct}%
                    </span>
                    <span className="flex-shrink-0 text-right text-[12px] tabular-nums" style={{ color: 'var(--doc-ink-700)' }}>
                      {d.clientes} · {formatPesos(d.exposicion_mxn)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Anillo (donut) de distribución del riesgo. Segmentos con la paleta de banda
// (verde → ámbar → rojo), separados por un hueco fino que deja ver el track.
function AnilloRiesgo({
  distribucion,
  valorDe,
  totalBase,
  centroValor,
  centroEtiqueta,
}: {
  distribucion: { banda: Banda; clientes: number; exposicion_mxn: number }[];
  valorDe: (d: { clientes: number; exposicion_mxn: number }) => number;
  totalBase: number;
  centroValor: string;
  centroEtiqueta: string;
}) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const GAP = 1.5;
  let acc = 0;
  const segmentos = BANDAS.map((banda) => {
    const d = distribucion.find((x) => x.banda === banda) ?? { clientes: 0, exposicion_mxn: 0 };
    const frac = totalBase > 0 ? valorDe(d) / totalBase : 0;
    const seg = { banda, frac, offset: acc };
    acc += frac;
    return seg;
  }).filter((s) => s.frac > 0);

  return (
    <div className="relative flex-shrink-0" style={{ width: 220, height: 220 }}>
      <svg viewBox="0 0 100 100" width="220" height="220" role="img" aria-label="Distribución del riesgo de la cartera">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--doc-paper-tint)" strokeWidth="15" />
        <g transform="rotate(-90 50 50)">
          {segmentos.map((s) => (
            <circle
              key={s.banda}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={BANDA_COLOR[s.banda]}
              strokeWidth="15"
              strokeLinecap="butt"
              strokeDasharray={`${Math.max(0, s.frac * C - GAP)} ${C}`}
              strokeDashoffset={-s.offset * C}
            />
          ))}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="ds-figure" style={{ fontSize: 'var(--figure-l)', color: 'var(--doc-ink-900)' }}>
          {centroValor}
        </div>
        <div className="ds-eyebrow" style={{ fontSize: '0.5625rem' }}>
          {centroEtiqueta}
        </div>
      </div>
    </div>
  );
}

// ── Bloque 2 · Principales incumplimientos por tema ESG ────────────────────
function TopVulnerabilidades({ resumen, className = '' }: { resumen: ResumenCartera; className?: string }) {
  const { top_temas } = resumen;
  return (
    <div className={`ds-panel ds-rise ${className}`}>
      <ZonaHeader nivel="sub" headingLevel={3}>
        Principales incumplimientos por tema ESG
      </ZonaHeader>
      <div className="px-[var(--pad-x)] pb-5 pt-4">
        {top_temas.length === 0 ? (
          <p className="m-0 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
            Sin incumplimientos registrados en la cartera.
          </p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {top_temas.map((t, i) => {
              const colorMat = t.materialidad ? BANDA_TEMA_COLOR[t.materialidad] ?? 'var(--doc-ink-500)' : null;
              return (
                <li key={t.tema} className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                  <span className="ds-figure flex-shrink-0" style={{ fontSize: 'var(--figure-m)', color: 'var(--doc-ink-400)' }}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-[14px] font-medium" style={{ color: 'var(--doc-ink-900)' }}>
                    {TEMA_LABEL[t.tema] ?? t.tema}
                  </span>
                  {t.materialidad && colorMat && (
                    <span
                      className="inline-flex flex-shrink-0 items-center gap-1.5 self-center px-2 py-0.5 font-semibold text-[11px] uppercase tracking-[0.03em]"
                      style={{ background: `${colorMat}1F`, color: colorMat, borderRadius: 3 }}
                      title="Nivel de materialidad del tema"
                    >
                      <span className="h-3 w-1" style={{ background: colorMat }} aria-hidden="true" />
                      {BANDA_TEMA_LABEL[t.materialidad] ?? t.materialidad}
                    </span>
                  )}
                  <span
                    className="flex-shrink-0 text-[13px] tabular-nums"
                    style={{ color: i === 0 ? 'var(--risk-alto)' : 'var(--doc-ink-500)' }}
                  >
                    {t.n_clientes} {t.n_clientes === 1 ? 'cliente' : 'clientes'}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── Bloque 3 · Pipeline de estructuración ──────────────────────────────────
function PipelineEstructuracion({ resumen, className = '' }: { resumen: ResumenCartera; className?: string }) {
  const { pipeline, total_clientes } = resumen;
  const filas = [
    {
      n: pipeline.viables,
      color: 'var(--ok-fg)',
      label: 'Viables',
      glosa:
        pipeline.con_greenium > 0
          ? `Sujetos de crédito. ${pipeline.con_greenium} acceden al greenium (riesgo bajo).`
          : 'Sujetos de crédito en su estructura actual.',
    },
    {
      n: pipeline.viables_reestructura,
      color: 'var(--warn-fg)',
      label: 'Viables con reestructura',
      glosa: 'Bancables ampliando el plazo de la deuda.',
    },
    {
      n: pipeline.requieren_fega,
      color: 'var(--risk-alto)',
      label: 'Requieren garantía FEGA',
      glosa: 'Flujo insuficiente; necesitan respaldo FEGA de FIRA.',
    },
    {
      n: pipeline.no_bancables,
      color: 'var(--risk-critico)',
      label: 'No bancables',
      glosa: 'Insolvencia operativa; fuera de política de crédito.',
    },
  ];
  const maxN = Math.max(1, ...filas.map((f) => f.n));

  return (
    <div className={`ds-panel ds-rise ${className}`}>
      <ZonaHeader nivel="seccion" numero={2} headingLevel={2}>
        Pipeline de estructuración
      </ZonaHeader>
      <div className="flex flex-col">
        {filas.map((f, i) => (
          <div
            key={f.label}
            className="flex items-center gap-4 px-[var(--pad-x)] py-4"
            style={i > 0 ? { borderTop: '1px solid var(--doc-rule)' } : undefined}
          >
            <span
              className="ds-figure w-12 flex-shrink-0 text-right"
              style={{ fontSize: 'var(--figure-xl)', color: f.n > 0 ? f.color : 'var(--doc-ink-400)' }}
            >
              {f.n}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold" style={{ color: 'var(--doc-ink-900)' }}>
                {f.label}
              </div>
              <p className="m-0 mt-0.5 text-[12px]" style={{ color: 'var(--doc-ink-500)' }}>
                {f.glosa}
              </p>
              <div
                className="mt-2 h-1.5 overflow-hidden"
                style={{ background: 'var(--doc-paper-tint)', borderRadius: 2, maxWidth: 320 }}
              >
                <div className="h-full" style={{ width: `${(f.n / maxN) * 100}%`, background: f.color, borderRadius: 2 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      {pipeline.fuera_alcance > 0 && (
        <div
          className="px-[var(--pad-x)] py-3 text-[12px]"
          style={{ borderTop: '1px solid var(--doc-rule)', color: 'var(--doc-ink-500)' }}
        >
          {pipeline.fuera_alcance}{' '}
          {pipeline.fuera_alcance === 1 ? 'perfil corporativo' : 'perfiles corporativos'} fuera del alcance del scorecard
          PyME FIRA (fondeo vía mercado de capitales).
        </div>
      )}
      <div
        className="px-[var(--pad-x)] py-2.5 text-[11px]"
        style={{ borderTop: '1px solid var(--doc-rule)', color: 'var(--doc-ink-400)' }}
      >
        {total_clientes} {total_clientes === 1 ? 'cliente' : 'clientes'} · última evaluación de cada uno.
      </div>
    </div>
  );
}

// ── Bloque 4 · Evaluaciones recientes ─────────────────────────────────────
function Recientes({
  evaluaciones,
  onVerEvaluacion,
  onVerCartera,
  className = '',
}: {
  evaluaciones: EvaluacionSesion[];
  onVerEvaluacion: (e: EvaluacionSesion) => void;
  onVerCartera: () => void;
  className?: string;
}) {
  const recientes = evaluaciones.slice(0, 5);
  return (
    <div className={`ds-panel ds-rise ${className}`}>
      <ZonaHeader nivel="sub" headingLevel={3} meta={`${evaluaciones.length}`}>
        Evaluaciones recientes
      </ZonaHeader>
      <div className="flex flex-col">
        {recientes.map((ev, i) => (
          <button
            key={ev.id}
            type="button"
            onClick={() => onVerEvaluacion(ev)}
            className="flex flex-wrap items-center justify-between gap-3 bg-transparent px-[var(--pad-x)] py-3.5 text-left"
            style={i > 0 ? { borderTop: '1px solid var(--doc-rule)' } : undefined}
          >
            <div className="min-w-0">
              <p className="m-0 text-[14px] font-semibold" style={{ color: 'var(--doc-ink-900)' }}>
                {ev.cliente.nombre}
              </p>
              <p className="m-0 mt-0.5 text-[12px]" style={{ color: 'var(--doc-ink-500)' }}>
                Cliente {ev.cliente.numero_cliente || '—'} · {ev.sectorNombre}
              </p>
            </div>
            <RiesgoEsgMini resultado={ev.resultado} />
          </button>
        ))}
      </div>
      <div className="px-[var(--pad-x)] py-3" style={{ borderTop: '1px solid var(--doc-rule)' }}>
        <button type="button" onClick={onVerCartera} className="ds-link bg-transparent p-0 text-[13px]">
          Ver cartera completa
        </button>
      </div>
    </div>
  );
}

// Nivel de riesgo ESG general + conteo de normas en regla, mismo criterio y
// estilo que la sección 1 de Resultados y las cards de Clientes.tsx.
function RiesgoEsgMini({ resultado }: { resultado: ResultadoEvaluacion }) {
  const bandaGlobal = peorBandaGeneral(resultado);
  const total = resultado.detalle.length;
  const enRegla = normasEnRegla(resultado);
  const colorBanda = BANDA_COLOR[bandaGlobal];

  return (
    <div className="flex items-center gap-5">
      <div className="flex flex-col items-end gap-1">
        <span className="ds-eyebrow" style={{ fontSize: '0.5625rem' }}>
          Riesgo ESG
        </span>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 font-semibold text-[11px] uppercase tracking-[0.03em]"
          style={{ background: `${colorBanda}1F`, color: colorBanda, borderRadius: 3 }}
        >
          <span className="h-3 w-1" style={{ background: colorBanda }} aria-hidden="true" />
          {bandaGlobal}
        </span>
      </div>
      {total > 0 && (
        <div className="flex flex-col items-end gap-1">
          <span className="ds-eyebrow" style={{ fontSize: '0.5625rem' }}>
            Normas en regla
          </span>
          <span className="ds-figure text-[15px]" style={{ color: 'var(--doc-ink-900)' }}>
            {enRegla}
            <span style={{ color: 'var(--doc-ink-400)' }}>/{total}</span>
          </span>
        </div>
      )}
    </div>
  );
}
