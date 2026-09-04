import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { evaluar } from '../lib/evaluar';
import { TEMA_LABEL } from '../lib/temas';
import { ZonaHeader } from '../components/ds/ZonaHeader';
import { Button } from '../components/ds/Button';
import { Input } from '../components/ds/Input';
import { SantanderLogo } from '../components/SantanderLogo';
import { NAVBAR_HEIGHT } from '../components/Navbar';
import type {
  Categoria,
  ClienteInput,
  Estatus,
  NivelConfianza,
  NormaAplicable,
  PerfilTamano,
  ResultadoEvaluacion,
  RespuestaInput,
  SubsectorAgro,
} from '../types';

const CATEGORIA_ORDEN: Categoria[] = ['ambiental', 'social', 'jurisdiccional_documental'];
const CATEGORIA_LABEL: Record<Categoria, string> = {
  ambiental: 'Ambiental',
  social: 'Social',
  jurisdiccional_documental: 'Gobernanza',
};
// Tinte por categoría en el rótulo de su franja — igual que DIMENSION_TINTE de
// la caja de cristal (sección 04 de Resultados). Tonos claros: leen sobre el
// gris oscuro de la franja de zona.
const CATEGORIA_TINTE: Record<Categoria, string> = {
  ambiental: '#7cc6a0',
  social: '#f0cf7a',
  jurisdiccional_documental: '#a9d0e0',
};
// Misma familia de color por categoría pero LEGIBLE sobre fondo claro — para la
// etiqueta de tema ESG dentro de las tarjetas de norma.
const CATEGORIA_FLAG_COLOR: Record<Categoria, string> = {
  ambiental: 'var(--ok-fg)', // verde
  social: 'var(--warn-fg)', // ámbar
  jurisdiccional_documental: 'var(--ctx-500)', // azul
};

const PERFIL_LABEL: Record<PerfilTamano, string> = {
  pyme: 'PyME',
  mediana: 'Mediana empresa',
  cotiza_bolsa: 'Cotiza en bolsa',
  multinacional: 'Multinacional',
};
const SUBSECTOR_LABEL: Record<SubsectorAgro, string> = {
  ganaderia: 'Ganadería',
  agricultura: 'Agricultura',
};

// Etiqueta visible por norma: la capa de aplicabilidad
// (internacional/federal/estatal) que devuelve la RPC.
const NIVEL_LABEL: Record<string, string> = {
  internacional: 'Internacional',
  federal: 'Federal',
  estatal: 'Estatal',
  municipal: 'Municipal',
};

const ESTATUS_OPCIONES: { value: Estatus; label: string }[] = [
  { value: 'cumple', label: 'Cumple' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'no_cumple', label: 'No cumple' },
  { value: 'desconocido', label: 'Desconocido' },
];

// Color semántico del estatus seleccionado (mismos tonos que ESTATUS_META de la
// caja de cristal). fg = texto + borde + filete; bg = fondo del botón activo.
const ESTATUS_UI: Record<Estatus, { fg: string; bg: string }> = {
  cumple: { fg: 'var(--ok-fg)', bg: 'var(--ok-bg)' },
  parcial: { fg: 'var(--warn-fg)', bg: 'var(--warn-bg)' },
  no_cumple: { fg: 'var(--red-700)', bg: 'var(--red-100)' },
  desconocido: { fg: 'var(--doc-ink-500)', bg: 'var(--doc-paper-tint)' },
  // No se ofrece como opción de cumplimiento (se llega a 'no_aplica' vía la
  // pregunta de aplicabilidad, no vía ESTATUS_OPCIONES). Entrada solo por
  // completitud del tipo.
  no_aplica: { fg: 'var(--doc-ink-500)', bg: 'var(--doc-paper-tint)' },
};

interface RespuestaLocal {
  estatus: Estatus;
  nivel_confianza: NivelConfianza;
  documento_url: string;
  /**
   * Solo para normas `condicional_actividad`. Marcador LOCAL de UI — no viaja
   * en el payload de `evaluar` (RespuestaInput no lo incluye). `undefined` =
   * aún no se respondió "¿aplica?"; `true` = sí (se pide cumplimiento);
   * `false` = no (ya quedó `estatus: 'no_aplica'`).
   */
  aplica?: boolean;
}

interface CuestionarioProps {
  cliente: ClienteInput;
  sectorNombre: string;
  jurisdiccionNombre: string;
  evaluacionId?: string;
  respuestasIniciales?: RespuestaInput[];
  onCompletado: (resultado: ResultadoEvaluacion) => void;
  onCancelar: () => void;
}

export function Cuestionario({
  cliente,
  sectorNombre,
  jurisdiccionNombre,
  evaluacionId,
  respuestasIniciales,
  onCompletado,
  onCancelar,
}: CuestionarioProps) {
  const [normas, setNormas] = useState<NormaAplicable[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, RespuestaLocal>>(() => {
    if (!respuestasIniciales) return {};
    const seed: Record<string, RespuestaLocal> = {};
    for (const r of respuestasIniciales) {
      seed[r.norma_id] = {
        estatus: r.estatus,
        nivel_confianza: r.nivel_confianza,
        documento_url: r.documento_url ?? '',
        // Si esta norma es condicional_actividad, esto determina si se
        // reabre en la vista de "no aplica" o en la de cumplimiento. Para
        // normas 'directa' este campo simplemente no se usa al renderizar.
        aplica: r.estatus !== 'no_aplica',
      };
    }
    return seed;
  });
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('normas_aplicables', {
        p_sector_id: cliente.sector_id,
        p_jurisdiccion_id: cliente.jurisdiccion_id,
        p_es_exportador: cliente.es_exportador,
        p_perfil_tamano: cliente.perfil_tamano,
      });
      if (cancelado) return;
      if (rpcError) {
        setError('No se pudieron cargar las normas aplicables.');
      } else {
        setNormas((data as NormaAplicable[]) ?? []);
      }
      setCargando(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [cliente.sector_id, cliente.jurisdiccion_id, cliente.es_exportador, cliente.perfil_tamano]);

  const normasPorCategoria = useMemo(() => {
    const grupos = new Map<Categoria, NormaAplicable[]>();
    for (const norma of normas) {
      const lista = grupos.get(norma.categoria) ?? [];
      lista.push(norma);
      grupos.set(norma.categoria, lista);
    }
    return grupos;
  }, [normas]);

  const totalRespondidas = Object.keys(respuestas).length;
  const progreso = normas.length > 0 ? totalRespondidas / normas.length : 0;

  function actualizar(normaId: string, cambios: Partial<RespuestaLocal>) {
    setRespuestas((prev) => ({
      ...prev,
      [normaId]: {
        estatus: prev[normaId]?.estatus ?? 'desconocido',
        nivel_confianza: prev[normaId]?.nivel_confianza ?? 'autoreportado',
        documento_url: prev[normaId]?.documento_url ?? '',
        aplica: prev[normaId]?.aplica,
        ...cambios,
      },
    }));
  }

  async function handleCalcular() {
    setEnviando(true);
    setErrorEnvio(null);
    const payload: RespuestaInput[] = normas.map((norma) => {
      const r = respuestas[norma.norma_id];
      return {
        norma_id: norma.norma_id,
        estatus: r?.estatus ?? 'desconocido',
        nivel_confianza: r?.nivel_confianza ?? 'autoreportado',
        documento_url: r?.documento_url?.trim() ? r.documento_url.trim() : null,
      };
    });

    try {
      const resultado = await evaluar(cliente, payload, evaluacionId);
      onCompletado(resultado);
    } catch (e) {
      setErrorEnvio(e instanceof Error ? e.message : 'No se pudo calcular el riesgo.');
    } finally {
      setEnviando(false);
    }
  }

  const perfilFilas: [string, string][] = [
    ['Número de cliente', cliente.numero_cliente || '—'],
    ['Sector', sectorNombre || '—'],
    ['Estado de operación', jurisdiccionNombre || '—'],
    ['Perfil de tamaño', PERFIL_LABEL[cliente.perfil_tamano] ?? cliente.perfil_tamano],
    ['Subsector', cliente.subsector ? SUBSECTOR_LABEL[cliente.subsector] ?? cliente.subsector : '—'],
    ['Exporta a la UE', cliente.es_exportador ? 'Sí' : 'No'],
    ['Zona sensible', cliente.en_zona_riesgo ? cliente.zona_riesgo_nota?.trim() || 'Sí' : 'No'],
  ];

  return (
    <div className="resultados-root flex min-h-full flex-col" style={{ background: 'var(--doc-paper-sunk)' }}>
      <div className="mx-auto w-full max-w-[900px] flex-1 px-4 py-8 sm:px-8">
        <button
          type="button"
          onClick={onCancelar}
          className="bg-transparent p-0 text-[13px]"
          style={{ color: 'var(--doc-ink-500)' }}
        >
          ← Volver
        </button>

        <div className="mt-3">
          <div className="ds-eyebrow">{evaluacionId ? 'Editar evaluación' : 'Nueva evaluación'}</div>
          <h1 className="ds-title m-0 mt-1" style={{ fontSize: 'var(--title-page)', color: 'var(--doc-ink-900)' }}>
            {cliente.nombre}
          </h1>
          <p className="m-0 mt-1.5 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
            Cliente {cliente.numero_cliente || '—'} · {sectorNombre} · {jurisdiccionNombre}
          </p>
        </div>

        {/* ── Parte 1 · Perfil del cliente ─────────────────────────────── */}
        <div className="ds-panel ds-rise mt-6">
          <ZonaHeader nivel="seccion" numero={1} headingLevel={2}>
            Perfil del cliente
          </ZonaHeader>
          <dl className="m-0 grid grid-cols-2 gap-x-8 gap-y-4 p-[var(--pad-x)] sm:grid-cols-3">
            {perfilFilas.map(([label, valor]) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="ds-eyebrow">{label}</dt>
                <dd className="m-0 text-[14px] font-medium" style={{ color: 'var(--doc-ink-900)' }}>
                  {valor}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Progreso — sticky justo debajo del Navbar (no en top:0, que quedaría
            tapado detrás de él). */}
        <div
          className="sticky z-10 mt-6 px-4 py-3 backdrop-blur"
          style={{
            top: NAVBAR_HEIGHT,
            background: 'var(--doc-paper)',
            borderTop: '1px solid var(--doc-rule)',
            borderBottom: '1px solid var(--doc-rule)',
          }}
        >
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-medium" style={{ color: 'var(--doc-ink-900)' }}>
              {totalRespondidas} de {normas.length} normas respondidas
            </span>
            <span style={{ color: 'var(--doc-ink-500)' }}>{Math.round(progreso * 100)}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden" style={{ background: 'var(--doc-paper-tint)', borderRadius: 999 }}>
            <div
              className="h-full"
              style={{
                width: `${progreso * 100}%`,
                background: 'var(--doc-ink-900)',
                borderRadius: 999,
                transition: 'width 300ms ease-out',
              }}
            />
          </div>
        </div>

        {cargando && (
          <div className="mt-8 flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse"
                style={{ background: 'var(--doc-rule)', borderRadius: 'var(--radius-panel)' }}
              />
            ))}
          </div>
        )}

        {error && (
          <p
            className="m-0 mt-8 px-4 py-3 text-[13px]"
            style={{ color: 'var(--red-700)', background: 'var(--red-100)', borderRadius: 'var(--radius-control)' }}
          >
            {error}
          </p>
        )}

        {!cargando && !error && (
          <>
            {/* ── Parte 2 · Normas aplicables ───────────────────────────── */}
            <div className="ds-panel ds-rise mt-6">
              <ZonaHeader nivel="seccion" numero={2} headingLevel={2}>
                Normas aplicables
              </ZonaHeader>
              {CATEGORIA_ORDEN.filter((cat) => normasPorCategoria.has(cat)).map((categoria) => {
                const lista = normasPorCategoria.get(categoria)!;
                return (
                  <div key={categoria}>
                    <ZonaHeader
                      nivel="sub"
                      headingLevel={3}
                      meta={`${lista.length} ${lista.length === 1 ? 'norma' : 'normas'}`}
                    >
                      <span style={{ color: CATEGORIA_TINTE[categoria] }}>{CATEGORIA_LABEL[categoria]}</span>
                    </ZonaHeader>
                    <div className="flex flex-col gap-3 px-[var(--pad-x)] py-4">
                      {lista.map((norma) => (
                        <PreguntaNorma
                          key={norma.norma_id}
                          norma={norma}
                          respuesta={respuestas[norma.norma_id]}
                          onChange={(cambios) => actualizar(norma.norma_id, cambios)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {errorEnvio && (
              <p
                className="m-0 mt-4 px-4 py-3 text-[13px]"
                style={{ color: 'var(--red-700)', background: 'var(--red-100)', borderRadius: 'var(--radius-control)' }}
              >
                {errorEnvio}
              </p>
            )}

            <div className="mt-6 flex justify-end pt-6" style={{ borderTop: '1px solid var(--doc-rule)' }}>
              <Button variant="primary" size="l" disabled={enviando || normas.length === 0} onClick={handleCalcular}>
                {evaluacionId
                  ? enviando
                    ? 'Guardando…'
                    : 'Guardar cambios'
                  : enviando
                    ? 'Calculando…'
                    : 'Calcular riesgo'}
              </Button>
            </div>
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

function PreguntaNorma({
  norma,
  respuesta,
  onChange,
}: {
  norma: NormaAplicable;
  respuesta?: RespuestaLocal;
  onChange: (cambios: Partial<RespuestaLocal>) => void;
}) {
  const estatus = respuesta?.estatus;
  const nivelConfianza = respuesta?.nivel_confianza ?? 'autoreportado';
  const documentoUrl = respuesta?.documento_url ?? '';
  const mostrarPista = estatus === 'cumple' && documentoUrl.trim().length === 0;

  // condicional_actividad: primero se pregunta "¿aplica?"; solo si "Sí" se
  // pide el estatus de cumplimiento. Si "No", queda estatus='no_aplica' y no
  // se pide nada más. directa (y condicional_perfil, que nunca llega acá)
  // van directo a la pregunta de cumplimiento, como siempre.
  const esCondicional = norma.tipo_aplicabilidad === 'condicional_actividad';
  const aplica = respuesta?.aplica;
  const noAplica = esCondicional && aplica === false;
  const mostrarCumplimiento = !esCondicional || aplica === true;

  return (
    <div
      className="p-4 sm:p-5"
      style={{
        border: '1px solid var(--doc-rule)',
        borderRadius: 'var(--radius-control)',
        background: 'var(--doc-paper-sunk)',
        opacity: noAplica ? 0.6 : 1,
        transition: 'opacity 160ms ease',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]"
            style={{ background: 'var(--doc-paper-tint)', color: 'var(--doc-ink-700)', borderRadius: 3 }}
          >
            {NIVEL_LABEL[norma.jurisdiccion_nivel] ?? norma.jurisdiccion_nivel}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em]"
            style={{ color: CATEGORIA_FLAG_COLOR[norma.categoria] }}
          >
            <span
              className="h-3 w-1"
              style={{ background: CATEGORIA_FLAG_COLOR[norma.categoria] }}
              aria-hidden="true"
            />
            {TEMA_LABEL[norma.tema] ?? norma.tema}
          </span>
        </div>

        {/* Aplicabilidad — siempre visible, arriba a la derecha: "Aplicabilidad
            Directa" (ámbar) en directa/condicional_perfil, "Condicional"
            (contexto) cuando requiere la pregunta de aplicabilidad. Ayuda al
            analista a entender por qué algunas normas preguntan "¿aplica?"
            primero. */}
        <span
          className="inline-flex flex-shrink-0 items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]"
          style={
            esCondicional
              ? { background: 'var(--ctx-100)', color: 'var(--ctx-500)', borderRadius: 3 }
              : { background: 'var(--warn-bg)', color: 'var(--warn-fg)', borderRadius: 3 }
          }
        >
          {esCondicional ? 'Condicional' : 'Aplicabilidad Directa'}
        </span>
      </div>

      <p className="m-0 mt-1.5 text-[12px]" style={{ color: 'var(--doc-ink-500)' }}>
        {norma.norma_titulo} · {norma.norma_clave}
      </p>

      {esCondicional && (
        <div className="mt-3">
          <p className="m-0 text-[14px] font-medium" style={{ color: 'var(--doc-ink-900)' }}>
            {norma.pregunta_aplicabilidad}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => onChange({ aplica: true })}
              className="px-3 py-1.5 text-[13px] font-medium"
              style={{
                borderRadius: 'var(--radius-control)',
                border: `1px solid ${aplica === true ? 'var(--doc-ink-900)' : 'var(--doc-rule)'}`,
                background: aplica === true ? 'var(--doc-ink-900)' : 'var(--doc-paper)',
                color: aplica === true ? 'var(--doc-paper)' : 'var(--doc-ink-700)',
                transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
              }}
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => onChange({ aplica: false, estatus: 'no_aplica' })}
              className="px-3 py-1.5 text-[13px] font-medium"
              style={{
                borderRadius: 'var(--radius-control)',
                border: `1px solid ${aplica === false ? 'var(--doc-ink-900)' : 'var(--doc-rule)'}`,
                background: aplica === false ? 'var(--doc-ink-900)' : 'var(--doc-paper)',
                color: aplica === false ? 'var(--doc-paper)' : 'var(--doc-ink-700)',
                transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
              }}
            >
              No
            </button>
          </div>
          {noAplica && (
            <p className="m-0 mt-2 text-[12px] font-medium" style={{ color: 'var(--doc-ink-500)' }}>
              No aplica a este cliente.
            </p>
          )}
        </div>
      )}

      {mostrarCumplimiento && (
        <div
          className={esCondicional ? 'mt-4 pt-4' : ''}
          style={esCondicional ? { borderTop: '1px solid var(--doc-rule)' } : undefined}
        >
          <p className="m-0 text-[14px] font-medium" style={{ color: 'var(--doc-ink-900)' }}>
            {norma.pregunta_evaluacion}
          </p>

          {norma.evidencia && (
            <details className="mt-2">
              <summary className="ds-summary">
                <svg className="ds-summary-chev" width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Evidencia sugerida
              </summary>
              <p className="m-0 mt-1.5 text-[12px] leading-relaxed" style={{ color: 'var(--doc-ink-500)' }}>
                {norma.evidencia}
              </p>
            </details>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {ESTATUS_OPCIONES.map((opcion) => {
              const activo = estatus === opcion.value;
              const ui = ESTATUS_UI[opcion.value];
              return (
                <button
                  key={opcion.value}
                  type="button"
                  onClick={() => onChange({ estatus: opcion.value })}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px]"
                  style={{
                    borderRadius: 'var(--radius-control)',
                    border: `1px solid ${activo ? ui.fg : 'var(--doc-rule)'}`,
                    background: activo ? ui.bg : 'var(--doc-paper)',
                    color: activo ? ui.fg : 'var(--doc-ink-700)',
                    fontWeight: activo ? 600 : 500,
                    transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
                  }}
                >
                  {activo && <span className="h-3 w-1" style={{ background: ui.fg }} aria-hidden="true" />}
                  {opcion.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex items-center gap-2">
              <span className="ds-eyebrow">Confianza</span>
              <div
                className="inline-flex p-0.5 text-[12px]"
                style={{ border: '1px solid var(--doc-rule)', borderRadius: 'var(--radius-control)' }}
              >
                <button
                  type="button"
                  onClick={() => onChange({ nivel_confianza: 'autoreportado' })}
                  className="px-2.5 py-1.5 font-medium"
                  style={{
                    borderRadius: 3,
                    background: nivelConfianza === 'autoreportado' ? 'var(--doc-paper-tint)' : 'transparent',
                    color: nivelConfianza === 'autoreportado' ? 'var(--doc-ink-900)' : 'var(--doc-ink-500)',
                  }}
                >
                  Autoreportado
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ nivel_confianza: 'verificado' })}
                  className="px-2.5 py-1.5 font-medium"
                  style={{
                    borderRadius: 3,
                    background: nivelConfianza === 'verificado' ? 'var(--ok-bg)' : 'transparent',
                    color: nivelConfianza === 'verificado' ? 'var(--ok-fg)' : 'var(--doc-ink-500)',
                  }}
                >
                  Verificado
                </button>
              </div>
            </div>

            <Input
              id={`doc-${norma.norma_id}`}
              placeholder="Documento de soporte (URL o referencia, opcional)"
              value={documentoUrl}
              onChange={(v) => onChange({ documento_url: v })}
            />
          </div>

          {mostrarPista && (
            <p className="m-0 mt-2.5 text-[12px]" style={{ color: 'var(--warn-ink)' }}>
              Un cumplimiento sin documento de soporte se considera de baja confianza.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
