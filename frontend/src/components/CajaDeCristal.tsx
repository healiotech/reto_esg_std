import { useMemo } from 'react';
import type { Categoria, DetalleNorma, Estatus } from '../types';
import { formatMiles, formatPesos } from '../lib/formatMoney';
import { TEMA_LABEL } from '../lib/temas';
import { ZonaHeader } from './ds/ZonaHeader';

// Dimensión ESG para agrupar la evidencia (paso 1 del rediseño: reagrupa por
// dimensión en vez de por canal crédito/reputación — el aporte a cada canal
// se conserva por norma, solo cambia el agrupamiento primario).
type Dimension = 'Ambiental' | 'Social' | 'Gobernanza';

const DIMENSION_DE: Record<Categoria, Dimension> = {
  ambiental: 'Ambiental',
  social: 'Social',
  jurisdiccional_documental: 'Gobernanza',
};

const DIMENSION_ORDEN: Dimension[] = ['Ambiental', 'Social', 'Gobernanza'];

// Distinción de color LIGERA por dimensión, solo en el rótulo de su franja
// (por pedido explícito, exclusivo de este bloque). Tonos suaves que leen
// sobre el gris oscuro de la franja; no son colores de banda de riesgo.
const DIMENSION_TINTE: Record<Dimension, string> = {
  Ambiental: '#7cc6a0', // verde
  Social: '#f0cf7a', // amarillo
  Gobernanza: '#a9d0e0', // azul
};

// Tema ESG (normas.tema): clasificación fina, más específica que la dimensión.
// Es metadato descriptivo, no señal de riesgo: por eso va en azul de contexto,
// nunca en el rojo de las marcas de escalada (Descalificante / Gatilla crítico).
// La tabla de etiquetas vive en lib/temas.ts (compartida con el panorama de cartera).

const ESTATUS_META: Record<Estatus, { label: string; bg: string; fg: string }> = {
  cumple: { label: 'Cumple', bg: '#E4F5EA', fg: 'var(--state-success)' },
  parcial: { label: 'Parcial', bg: '#FBF0DD', fg: 'var(--state-warning)' },
  no_cumple: { label: 'No cumple', bg: 'var(--red-100)', fg: 'var(--red-700)' },
  desconocido: { label: 'Desconocido', bg: 'var(--neutral-100)', fg: 'var(--text-tertiary)' },
  // No debería llegar acá: v_riesgo_norma excluye 'no_aplica' del cálculo.
  // Entrada solo por completitud del tipo.
  no_aplica: { label: 'No aplica', bg: 'var(--neutral-100)', fg: 'var(--text-tertiary)' },
};

// Valor UMA 2026 (INEGI). TODO: leer de parametros_financieros.
const VALOR_UMA_2026 = 117.31;

interface CajaDeCristalProps {
  detalle: DetalleNorma[];
}

export function CajaDeCristal({ detalle }: CajaDeCristalProps) {
  const grupos = useMemo(() => {
    const porDimension = new Map<Dimension, DetalleNorma[]>();
    for (const fila of detalle) {
      const dim = DIMENSION_DE[fila.categoria];
      if (!porDimension.has(dim)) porDimension.set(dim, []);
      porDimension.get(dim)!.push(fila);
    }
    for (const filas of porDimension.values()) {
      filas.sort((a, b) => b.riesgo_credito + b.riesgo_reputacion - (a.riesgo_credito + a.riesgo_reputacion));
    }
    return DIMENSION_ORDEN.filter((d) => porDimension.has(d)).map((dimension) => ({
      dimension,
      filas: porDimension.get(dimension)!,
    }));
  }, [detalle]);

  return (
    <div className="ds-panel">
      <div className="overflow-x-auto">
        {/* Una sola tabla con `table-layout: fixed` + colgroup: así las
            columnas quedan alineadas entre todas las dimensiones (antes cada
            grupo era su propia tabla y las columnas se desajustaban). Cada
            dimensión es un <tbody> con su franja como fila a todo el ancho. */}
        <table className="w-full min-w-[860px] border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col />
            <col style={{ width: 132 }} />
            <col style={{ width: 132 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1.5px solid var(--doc-rule-strong)' }}>
              <Th className="pl-6">Norma</Th>
              <Th>Estatus</Th>
              <Th>Verificado</Th>
              <Th className="text-right">Aporte crédito</Th>
              <Th className="pr-6 text-right">Aporte reputación</Th>
            </tr>
          </thead>
          {grupos.map(({ dimension, filas }, i) => (
            <DimensionGrupo key={dimension} dimension={dimension} filas={filas} primero={i === 0} />
          ))}
        </table>
      </div>
    </div>
  );
}

function DimensionGrupo({
  dimension,
  filas,
  primero = false,
}: {
  dimension: Dimension;
  filas: DetalleNorma[];
  primero?: boolean;
}) {
  return (
    <tbody>
      <tr>
        <td colSpan={5} className="p-0" style={primero ? undefined : { borderTop: '1px solid var(--doc-rule)' }}>
          <ZonaHeader
            nivel="sub"
            headingLevel={3}
            meta={`${filas.length} ${filas.length === 1 ? 'norma' : 'normas'}`}
          >
            <span style={{ color: DIMENSION_TINTE[dimension] }}>{dimension}</span>
          </ZonaHeader>
        </td>
      </tr>
      {filas.map((fila) => (
        <tr key={fila.norma_clave} style={{ borderBottom: '1px solid var(--doc-rule)' }}>
          <td className="py-3 pr-4 pl-6 align-top">
            <div className="font-medium text-[13px] leading-snug" style={{ color: 'var(--doc-ink-900)' }}>
              {fila.norma_titulo}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {fila.fuente_url ? (
                <a
                  href={fila.fuente_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] font-medium underline underline-offset-2 transition-colors"
                  style={{ color: 'var(--doc-ink-700)' }}
                >
                  {fila.fuente}
                </a>
              ) : (
                <span className="text-[12px]" style={{ color: 'var(--doc-ink-400)' }}>
                  {fila.fuente}
                </span>
              )}
              <TemaFlag>{TEMA_LABEL[fila.tema] ?? fila.tema}</TemaFlag>
              {fila.es_descalificante && <Flag>Descalificante</Flag>}
              {fila.gatilla_critico && <Flag>Gatilla crítico</Flag>}
            </div>
            <MultaInfo fila={fila} />
          </td>
          <td className="px-3 py-3 align-top">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
              style={{ background: ESTATUS_META[fila.estatus].bg, color: ESTATUS_META[fila.estatus].fg, borderRadius: 3 }}
            >
              <span className="w-1 h-3" style={{ background: ESTATUS_META[fila.estatus].fg }} aria-hidden="true" />
              {ESTATUS_META[fila.estatus].label}
            </span>
          </td>
          <td className="px-3 py-3 align-top">
            <span
              className="inline-flex items-center gap-1.5 font-medium text-[12px]"
              style={{ color: fila.nivel_confianza === 'verificado' ? 'var(--state-success)' : 'var(--doc-ink-400)' }}
            >
              <span
                className="rounded-full w-1.5 h-1.5"
                style={{ background: fila.nivel_confianza === 'verificado' ? 'var(--state-success)' : 'var(--doc-ink-400)' }}
              />
              {fila.nivel_confianza === 'verificado' ? 'Verificado' : 'Autoreportado'}
            </span>
          </td>
          <td className="px-3 py-3 text-right align-top">
            <div className="ds-figure" style={{ fontSize: 'var(--figure-m)', color: 'var(--doc-ink-900)' }}>
              +{fila.riesgo_credito.toFixed(2)}
            </div>
            <div className="ds-eyebrow mt-1" style={{ fontSize: '0.625rem' }}>
              peso {fila.peso_crediticio}%
            </div>
          </td>
          <td className="py-3 pr-6 pl-3 text-right align-top">
            <div className="ds-figure" style={{ fontSize: 'var(--figure-m)', color: 'var(--doc-ink-900)' }}>
              +{fila.riesgo_reputacion.toFixed(2)}
            </div>
            <div className="ds-eyebrow mt-1" style={{ fontSize: '0.625rem' }}>
              peso {fila.peso_reputacional}%
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`ds-eyebrow px-3 py-2 align-bottom text-left ${className}`} style={{ fontSize: '0.625rem' }}>
      {children}
    </th>
  );
}

// Referencia informativa sobre la norma, no un cálculo del modelo: no
// participa en riesgo_credito/riesgo_reputacion ni en ningún total.
function MultaInfo({ fila }: { fila: DetalleNorma }) {
  const { multa_min, multa_max, multa_unidad, multa_nota } = fila;

  if (multa_unidad === 'UMA' && (multa_min !== null || multa_max !== null)) {
    const min = multa_min ?? multa_max!;
    const max = multa_max ?? multa_min!;
    const rangoUma = min === max ? `${formatMiles(min)} UMA` : `${formatMiles(min)} – ${formatMiles(max)} UMA`;
    const rangoPesos =
      min === max
        ? formatPesos(min * VALOR_UMA_2026)
        : `${formatPesos(min * VALOR_UMA_2026)} – ${formatPesos(max * VALOR_UMA_2026)}`;
    return (
      <p className="m-0 mt-1.5 text-[12px]" style={{ color: 'var(--doc-ink-400)' }} title={multa_nota ?? undefined}>
        Sanción potencial: {rangoUma} (≈ {rangoPesos} MXN)
      </p>
    );
  }

  if (multa_nota) {
    return (
      <p className="m-0 mt-1.5 max-w-[260px] text-[12px] truncate" style={{ color: 'var(--doc-ink-400)' }} title={multa_nota}>
        Sanción potencial: {multa_nota}
      </p>
    );
  }

  return (
    <p className="m-0 mt-1.5 text-[12px]" style={{ color: 'var(--doc-ink-400)' }}>
      Sanción no cuantificada
    </p>
  );
}

// Etiqueta de tema ESG: misma forma que Flag (barra + texto), pero en azul de
// contexto (--ctx-500) para que se lea como clasificación, no como alerta.
function TemaFlag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 font-bold text-[10px] uppercase tracking-[0.06em]"
      style={{ color: 'var(--ctx-500)' }}
    >
      <span className="w-1 h-3" style={{ background: 'var(--ctx-500)' }} aria-hidden="true" />
      {children}
    </span>
  );
}

// Marcas de escalada de riesgo real (norma descalificante / gatilla crítico):
// van en rojo de BANDA (#b00000), no en el rojo de marca — es señal de riesgo.
function Flag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 font-bold text-[10px] uppercase tracking-[0.06em]"
      style={{ color: 'var(--risk-critico)' }}
    >
      <span className="w-1 h-3" style={{ background: 'var(--risk-critico)' }} aria-hidden="true" />
      {children}
    </span>
  );
}
