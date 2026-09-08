import { useEffect, useMemo, useState } from 'react';
import type {
  Banda,
  Categoria,
  ClienteInput,
  DetalleNorma,
  Estatus,
  EstructuraDeuda,
  Exposicion,
  PerfilFinanciero,
  PerfilTamano,
  ResultadoEvaluacion,
  Spread,
  SubsectorAgro,
  SimulacionFinanciera,
  TemaEsg,
  VistaFinanciera,
  VistaSimulada,
} from '../types';
import { Button } from '../components/ds/Button';
import { Input } from '../components/ds/Input';
import { ZonaHeader } from '../components/ds/ZonaHeader';
import { MapaMexico } from '../components/ds/MapaMexico';
import { AlertBadge, AlertIcon, BANDA_RANGO, ScoreCard } from '../components/ScoreCard';
import { SantanderLogo } from '../components/SantanderLogo';
import { CajaDeCristal } from '../components/CajaDeCristal';
import { BANDA_COLOR } from '../lib/banda';
import { TEMA_LABEL, BANDA_TEMA_LABEL, BANDA_TEMA_COLOR } from '../lib/temas';
import { supabase } from '../lib/supabase';
import { cerrarEvaluacion, NormasPendientesError, type NormaPendiente } from '../lib/cerrarEvaluacion';
import { formatPesos, formatRangoPesos, formatVeces } from '../lib/formatMoney';
import { simularFinanciero } from '../lib/simularFinanciero';
import { generarNarrativa } from '../lib/generarNarrativa';
import { exportarInformePdf } from '../lib/exportarInformePdf';

// Banner de guía accionable del mock antiguo: se deja deshabilitado en vez de
// borrarlo, por si se reactiva más adelante.
const MOSTRAR_BANNER_ACCIONABLE = false;

const CATEGORIA_LABEL: Record<Categoria, string> = {
  ambiental: 'Ambiental',
  social: 'Social',
  jurisdiccional_documental: 'Gobernanza',
};

// Tinte por categoría para los chips de "Categorías en riesgo" (inicio del
// bloque 4). Coincide con DIMENSION_TINTE de CajaDeCristal — cada categoría
// mapea a su dimensión ESG en la tabla de abajo: ambiental→Ambiental,
// social→Social, jurisdiccional_documental→Gobernanza.
const CATEGORIA_TINTE: Record<Categoria, string> = {
  ambiental: '#3ba277',
  social: '#c99a2e',
  jurisdiccional_documental: '#3f8fb0',
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

const ACCIONABLE_BANDA: Record<Banda, string> = {
  Bajo: 'Riesgo controlado. Puede continuar el proceso con seguimiento estándar.',
  Medio: 'Revise las normas pendientes antes de avanzar con el cliente.',
  Alto: 'Requiere revisión detallada antes de continuar el proceso.',
  Crítico: 'Requiere aprobación de un comité de riesgo antes de continuar.',
};


const VISTA_LABEL: Record<VistaSimulada, string> = {
  actual: 'Actual',
  cumple: 'Cumple',
  parcial: 'Parcial',
  incumple: 'Incumple',
};

// "Actual" es el ancla (la mezcla real del cliente) — se distingue con el
// color de marca, no con la paleta de bandas. Los tres escenarios de
// referencia SÍ reutilizan la paleta de bandas del sistema (mismo lenguaje
// visual que crédito/reputación); no implica que sean la misma banda de
// riesgo del veredicto, es solo el mismo código de color "peor que esto".
const VISTA_COLOR: Record<VistaSimulada, string> = {
  actual: 'var(--color-brand)',
  cumple: BANDA_COLOR.Bajo,
  parcial: BANDA_COLOR.Medio,
  incumple: BANDA_COLOR.Alto,
};

function vistaDe(sim: SimulacionFinanciera, vista: VistaSimulada): VistaFinanciera {
  if (vista === 'actual') return sim.actual;
  return sim.escenarios.find((e) => e.vista === vista) ?? sim.escenarios[0];
}

// "Actual" es la referencia de comparación para los tres escenarios hipotéticos
// (no hay un "base" fijo aparte, como en v1).
//
// Chip de variación vs. Actual. El signo es el cambio matemático real (+ sube,
// − baja); el COLOR es semáforo financiero, no el signo: verde tenue si el
// cambio es favorable, rojo quemado si es adverso. `peorEsMayor` dice de qué
// lado está lo malo (p. ej. Deuda/EBITDA: más es peor, así que bajar es verde;
// Cobertura o DSCR: más es mejor, así que subir es verde).
function DeltaChip({
  delta,
  formato,
  peorEsMayor,
  size = 'lg',
}: {
  delta: number;
  formato: (n: number) => string;
  peorEsMayor: boolean;
  size?: 'lg' | 'sm';
}) {
  if (delta === 0) return null;
  const sube = delta > 0;
  const favorable = peorEsMayor ? !sube : sube;
  const color = favorable ? 'var(--ok-fg)' : 'var(--risk-critico)';
  const signo = sube ? '+' : '−';
  if (size === 'sm') {
    return (
      <span className="font-semibold tabular-nums text-[12px]" style={{ color }}>
        {signo}
        {formato(Math.abs(delta))}
      </span>
    );
  }
  return (
    <span className="ds-figure" style={{ fontSize: 'var(--figure-m)', color }}>
      {signo}
      {formato(Math.abs(delta))}
    </span>
  );
}

// "Actual: X" en la esquina superior derecha de una card (solo cuando la vista
// es un escenario). Tinta media, discreta.
function EsquinaActual({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular-nums text-[11px]" style={{ color: 'var(--doc-ink-700)' }}>
      Actual: {children}
    </span>
  );
}

interface PerfilFormState {
  ingresos_anuales: string;
  margen_ebitda: string; // %, no fracción
  deuda_ebitda: string; // x
  tasa_interes: string; // %
  capex_pct_ingresos: string; // %
}

function perfilAForm(p: PerfilFinanciero): PerfilFormState {
  return {
    ingresos_anuales: String(Math.round(p.ingresos_anuales)),
    margen_ebitda: (p.margen_ebitda * 100).toFixed(1),
    deuda_ebitda: p.deuda_ebitda.toFixed(1),
    tasa_interes: (p.tasa_interes * 100).toFixed(1),
    capex_pct_ingresos: (p.capex_pct_ingresos * 100).toFixed(1),
  };
}

function formAPerfilCustom(f: PerfilFormState): Partial<PerfilFinanciero> {
  return {
    ingresos_anuales: Number(f.ingresos_anuales) || 0,
    margen_ebitda: (Number(f.margen_ebitda) || 0) / 100,
    deuda_ebitda: Number(f.deuda_ebitda) || 0,
    tasa_interes: (Number(f.tasa_interes) || 0) / 100,
    capex_pct_ingresos: (Number(f.capex_pct_ingresos) || 0) / 100,
  };
}

type CierreEstado =
  | { tipo: 'idle' }
  | { tipo: 'enviando' }
  | { tipo: 'confirmando'; pctVerificado: number; mensaje: string; enviando: boolean }
  | { tipo: 'cerrada'; cerradaEn: string }
  | { tipo: 'bloqueada'; mensaje: string; normasPendientes: NormaPendiente[] }
  | { tipo: 'error'; mensaje: string };

interface ResultadosProps {
  cliente: ClienteInput;
  sectorNombre: string;
  jurisdiccionNombre: string;
  resultado: ResultadoEvaluacion;
  onEvaluacionCerrada: (evaluacionId: string, cerradaEn: string) => void;
  onVolverAClientes: () => void;
}

export function Resultados({
  cliente,
  sectorNombre,
  jurisdiccionNombre,
  resultado,
  onEvaluacionCerrada,
  onVolverAClientes,
}: ResultadosProps) {
  const [cierre, setCierre] = useState<CierreEstado>(
    resultado.estado === 'cerrada' ? { tipo: 'cerrada', cerradaEn: resultado.cerrada_en ?? '' } : { tipo: 'idle' },
  );

  // Tip cualitativo del estado (no modula el score) — lectura pública directa
  // a jurisdicciones, así funciona igual venga de crear una evaluación nueva
  // o de abrir una ya existente desde Cartera.
  const [contextoRiesgo, setContextoRiesgo] = useState<string | null>(null);
  // Recomendación accionable de la jurisdicción (jurisdicciones.accionables) —
  // distinta de contexto_riesgo: contexto_riesgo es la lectura de la
  // situación ("Consideraciones"); accionables es qué hacer al respecto.
  const [accionables, setAccionables] = useState<string | null>(null);

  // Simulación financiera con el PERFIL POR DEFECTO (no el editable), la
  // única versión que va al PDF — se llena cuando `SimuladorFinanciero`
  // termina de cargar. Si el usuario ajusta supuestos en pantalla, el PDF
  // sigue mostrando esta versión de referencia, sin re-fetch adicional aquí.
  const [simulacionParaPdf, setSimulacionParaPdf] = useState<SimulacionFinanciera | null>(null);

  // Resumen ejecutivo IA — automático. Se siembra del `resultado` (viene de
  // listar-evaluaciones si ya se generó y persistió); si no, se genera solo al
  // entrar (una vez por evaluación, luego queda cacheado en `evaluaciones`).
  const [resumen, setResumen] = useState<string | null>(resultado.resumen_ejecutivo ?? null);
  const [resumenEn, setResumenEn] = useState<string | null>(resultado.resumen_generado_en ?? null);
  // Arranca en `true` cuando aún no hay resumen persistido: el useEffect de
  // abajo lo dispara automáticamente, así que el primer render ya debe
  // mostrar "generando" en vez de parpadear el botón manual por un frame.
  const [generandoResumen, setGenerandoResumen] = useState(() => !resultado.resumen_ejecutivo);
  const [errorResumen, setErrorResumen] = useState<string | null>(null);

  async function handleGenerarResumen() {
    setGenerandoResumen(true);
    setErrorResumen(null);
    try {
      const r = await generarNarrativa(resultado.evaluacion_id);
      setResumen(r.resumen_ejecutivo);
      setResumenEn(r.generado_en);
    } catch (e) {
      console.error('[Resultados] generar-narrativa falló:', e);
      setErrorResumen(e instanceof Error ? e.message : 'No se pudo generar el resumen.');
    } finally {
      setGenerandoResumen(false);
    }
  }

  useEffect(() => {
    if (resultado.resumen_ejecutivo) return;
    let cancelado = false;
    async function generarAuto() {
      setGenerandoResumen(true);
      setErrorResumen(null);
      try {
        const r = await generarNarrativa(resultado.evaluacion_id);
        if (cancelado) return;
        setResumen(r.resumen_ejecutivo);
        setResumenEn(r.generado_en);
      } catch (e) {
        if (cancelado) return;
        console.error('[Resultados] generar-narrativa (auto) falló:', e);
        setErrorResumen(e instanceof Error ? e.message : 'No se pudo generar el resumen.');
      } finally {
        if (!cancelado) setGenerandoResumen(false);
      }
    }
    generarAuto();
    return () => {
      cancelado = true;
    };
  }, [resultado.evaluacion_id, resultado.resumen_ejecutivo]);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      // Nota: la columna en la base es `accionable` (singular). El estado y
      // las props del lado del frontend se quedan en plural (`accionables`)
      // porque leen mejor como etiqueta ("Accionables"); es solo el nombre
      // de la variable local, no tiene que calcar el de la columna.
      const { data, error } = await supabase
        .from('jurisdicciones')
        .select('contexto_riesgo, accionable')
        .eq('id', cliente.jurisdiccion_id)
        .maybeSingle();
      if (error) {
        console.error('[Resultados] No se pudo leer jurisdicciones.contexto_riesgo/accionable:', error);
      }
      if (!cancelado) {
        setContextoRiesgo(data?.contexto_riesgo ?? null);
        setAccionables(data?.accionable ?? null);
      }
    }
    if (cliente.jurisdiccion_id) cargar();
    return () => {
      cancelado = true;
    };
  }, [cliente.jurisdiccion_id]);

  const pctVerificado = Math.round((1 - resultado.pct_autoreportado) * 100);
  const pctAutoreportado = Math.round(resultado.pct_autoreportado * 100);

  const bandaGlobal =
    BANDA_RANGO[resultado.credito.banda] >= BANDA_RANGO[resultado.reputacion.banda] ? resultado.credito.banda : resultado.reputacion.banda;
  const esCritico = bandaGlobal === 'Crítico';

  async function handleCerrar(confirmarBajaConfianza = false) {
    setCierre((prev) => (prev.tipo === 'confirmando' ? { ...prev, enviando: true } : { tipo: 'enviando' }));
    try {
      const res = await cerrarEvaluacion(resultado.evaluacion_id, confirmarBajaConfianza);
      if (res.cerrada) {
        setCierre({ tipo: 'cerrada', cerradaEn: res.cerradaEn });
        onEvaluacionCerrada(res.evaluacionId, res.cerradaEn);
      } else {
        setCierre({ tipo: 'confirmando', pctVerificado: res.pctVerificado, mensaje: res.mensaje, enviando: false });
      }
    } catch (e) {
      if (e instanceof NormasPendientesError) {
        setCierre({ tipo: 'bloqueada', mensaje: e.message, normasPendientes: e.normasPendientes });
      } else {
        setCierre({ tipo: 'error', mensaje: e instanceof Error ? e.message : 'No se pudo cerrar la evaluación.' });
      }
    }
  }

  return (
    <div className="min-h-full resultados-root" style={{ background: 'var(--doc-paper-sunk)' }}>
      <div className="mx-auto px-3 sm:px-6 py-8 pb-16 max-w-[1080px]">
        {/* Chrome de navegación — fuera del documento. */}
        <button
          type="button"
          onClick={onVolverAClientes}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-[12px] uppercase tracking-[0.06em] transition-colors"
          style={{ background: 'transparent', color: 'var(--doc-ink-500)', border: '1px solid var(--doc-rule)', borderRadius: 'var(--radius-control)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--doc-ink-900)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--doc-ink-500)')}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M12.5 15 7 10l5.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Clientes
        </button>

        {/* ================ Documento del banco ================
            Anclaje de marca (única franja roja) → cabecera de
            expediente → 7 secciones rotuladas → pie institucional.
            Todo contiguo: un documento, no tarjetas flotando. */}
        <div className="mt-4 overflow-hidden ds-panel ds-rise">
          <div className="ds-zone ds-zone--master">
            <span className="inline-flex items-center gap-3 ds-zone__label">
              <SantanderLogo variant="mark" className="w-[22px] h-[22px]" color="#ffffff" />
              <span className="text-[18px]">Santander</span>
            </span>
            <span className="ds-zone__meta" style={{ color: 'rgba(255,255,255,0.82)' }}>
              
            </span>
          </div>

          <div className="px-[var(--pad-x)] pt-5 pb-5" style={{ borderBottom: '1px solid var(--doc-rule)' }}>
            <div className="ds-eyebrow">Análisis de riesgo ESG</div>
            <h1
              className="m-0 mt-1.5 ds-title"
              style={{ fontSize: 'var(--title-page)', lineHeight: 1.08, color: 'var(--doc-ink-900)' }}
            >
              {cliente.nombre}
            </h1>
          </div>

        {/* ---- 1 · Dictamen de riesgo -------------------------------------
            El titular: nivel general + los dos canales + banderas críticas.
            Un analista debe entender el veredicto mirando solo este bloque. */}
        <SeccionNumerada numero={1} titulo="Dictamen de riesgo" subtitulo="Niveles de riesgo y canales que lo componen.">
          {MOSTRAR_BANNER_ACCIONABLE && (
            <div
              className="flex flex-1 items-center gap-3.5 mb-6 px-6 py-[18px] rounded-[20px]"
              style={{ background: esCritico ? BANDA_COLOR.Crítico : `${BANDA_COLOR[bandaGlobal]}24`, minWidth: 260 }}
            >
              <span
                className="flex flex-shrink-0 justify-center items-center rounded-full w-9 h-9"
                style={{ background: esCritico ? 'rgba(255,255,255,0.22)' : 'var(--surface-card)' }}
              >
                <AlertIcon size={18} color={esCritico ? '#ffffff' : BANDA_COLOR[bandaGlobal]} />
              </span>
              <p className="m-0 min-w-0 text-[15px]" style={{ color: esCritico ? '#ffffff' : 'var(--text-primary)' }}>
                <strong style={{ color: esCritico ? '#ffffff' : BANDA_COLOR[bandaGlobal] }}>Nivel de riesgo global: {bandaGlobal}.</strong>{' '}
                <br /> {ACCIONABLE_BANDA[bandaGlobal]}
              </p>
            </div>
          )}

          {/* La firma: el veredicto (nivel general) domina; los dos canales
              que lo componen quedan debajo como soporte, cada uno bajo su
              propio encabezado de zona NEUTRO — un dictamen, no tres tarjetas
              sueltas. El filete superior del panel toma el color de la banda:
              es el borde del instrumento, no una franja lateral decorativa. */}
          <div className="ds-panel" style={{ borderTop: `3px solid ${BANDA_COLOR[bandaGlobal]}` }}>
            <NivelRiesgoGeneral banda={bandaGlobal} detalle={resultado.detalle} />
            <div
              className="grid grid-cols-1 lg:grid-cols-2"
              style={{ gap: '1px', background: 'var(--doc-rule)', borderTop: '1px solid var(--doc-rule)' }}
            >
              <ScoreCard titulo="Riesgo crediticio" resultado={resultado.credito} />
              <ScoreCard titulo="Riesgo reputacional" resultado={resultado.reputacion} />
            </div>
          </div>
        </SeccionNumerada>

        {/* ---- 2 · Perfil y contexto del cliente --------------------------
            El marco, no el protagonista: quién es, dónde opera, qué contexto
            cualitativo rodea la operación, y cuánta confianza tiene el dato. */}
        <SeccionNumerada numero={2} titulo="Perfil y contexto del cliente" subtitulo="">
          <div className="flex flex-col gap-4">
            <div
              className="grid grid-cols-1 sm:grid-cols-2"
              style={{
                gap: '1px',
                background: 'var(--doc-rule)',
                border: '1px solid var(--doc-rule)',
                borderRadius: 'var(--radius-panel)',
                overflow: 'clip',
              }}
            >
              <PerfilCliente
                sectorNombre={sectorNombre}
                perfilTamano={cliente.perfil_tamano}
                esExportador={cliente.es_exportador}
              />
              <ConfianzaChip pctVerificado={pctVerificado} pctAutoreportado={pctAutoreportado} />
            </div>

            <UbicacionOperacion
              jurisdiccionNombre={jurisdiccionNombre}
              contextoRiesgo={contextoRiesgo}
              accionables={accionables}
              enZonaRiesgo={cliente.en_zona_riesgo}
              zonaRiesgoNota={cliente.zona_riesgo_nota}
            />
          </div>
        </SeccionNumerada>

        {/* ---- 3 · Dimensiones materiales en riesgo ------------------------
            Cruce materialidad × cumplimiento real: solo lo que le importa al
            sector Y donde este cliente tiene un problema. */}
        <SeccionNumerada
          numero={3}
          titulo="Dimensiones materiales en riesgo"
          subtitulo=""
        >
          <DimensionesEnRiesgo sectorNombre={sectorNombre} detalle={resultado.detalle} />
        </SeccionNumerada>

        {/* ---- 4 · Evidencia por dimensión ESG -----------------------------
            La caja de cristal: cómo se construyó el puntaje, norma por
            norma, agrupada por dimensión (Ambiental/Social/Gobernanza). */}
        <SeccionNumerada
          numero={4}
          titulo="Composición de puntaje ESG"
          subtitulo="Trazabilidad de normas, puntajes, estatus y verificación."
          id="evidencia-esg"
        >
          {resultado.categorias_en_riesgo.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <AlertBadge size={20} />
              <span className="mr-0.5 ds-eyebrow">Categorías en riesgo</span>
              {resultado.categorias_en_riesgo.map((categoria) => (
                <span
                  key={categoria}
                  className="inline-flex items-center gap-1.5 px-2 py-1 font-semibold text-[11px] uppercase tracking-[0.04em]"
                  style={{
                    border: '1px solid var(--doc-rule)',
                    borderRadius: 'var(--radius-control)',
                    color: 'var(--doc-ink-700)',
                  }}
                >
                  <span
                    className="rounded-full w-1.5 h-1.5"
                    style={{ background: CATEGORIA_TINTE[categoria] }}
                    aria-hidden="true"
                  />
                  {CATEGORIA_LABEL[categoria]}
                </span>
              ))}
            </div>
          )}
          <CajaDeCristal detalle={resultado.detalle} />
        </SeccionNumerada>

        {/* ---- 5 · Impacto financiero --------------------------------------
            Traducción a dinero: exposición (multas potenciales) + simulador
            (Actual vs. escenarios, estados financieros, CAPEX). */}
        <SeccionNumerada numero={5} titulo="Impacto financiero" subtitulo="Traducción del riesgo regulatorio a dinero: exposición y proyección.">
          <div className="flex flex-col gap-4">
            <ExposicionFinanciera exposicion={resultado.exposicion} />
            <SimuladorFinanciero evaluacionId={resultado.evaluacion_id} onDefaultCargado={setSimulacionParaPdf} />
          </div>
        </SeccionNumerada>

        {/* ---- Síntesis del análisis (IA) -------------------------------
            Cierre narrativo: llega después de que el lector vio toda la
            evidencia. Se genera al montar la pantalla, así que para cuando
            baja hasta acá ya está lista. La única sección con IA. */}
        <ResumenEjecutivo
          resumen={resumen}
          resumenEn={resumenEn}
          generando={generandoResumen}
          error={errorResumen}
          onGenerar={handleGenerarResumen}
        />

        {/* ---- 6 · Acciones -----------------------------------------------
            Exportar PDF y verificar/cerrar — el cierre de la pantalla. La
            "Recomendación" vive en la Síntesis del análisis, justo arriba. */}
        <SeccionNumerada numero={6} titulo="Acciones" subtitulo="Exportar el informe o cerrar la evaluación.">
          {cierre.tipo === 'confirmando' && (
            <div
              className="flex flex-wrap justify-between items-center gap-4 mb-4 px-4 py-3.5"
              style={{ background: 'var(--warn-bg)', borderRadius: 'var(--radius-control)' }}
            >
              <div className="flex items-start gap-3 min-w-0">
                <AlertIcon size={18} color="var(--warn-fg)" />
                <p className="m-0 text-[14px]" style={{ color: 'var(--warn-ink)' }}>
                  {cierre.mensaje}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <Button variant="ghost" size="s" disabled={cierre.enviando} onClick={() => setCierre({ tipo: 'idle' })}>
                  Cancelar
                </Button>
                <Button variant="primary" size="s" disabled={cierre.enviando} onClick={() => handleCerrar(true)}>
                  {cierre.enviando ? 'Cerrando…' : 'Cerrar de todas formas'}
                </Button>
              </div>
            </div>
          )}

          {cierre.tipo === 'bloqueada' && (
            <div className="mb-4 px-4 py-3.5" style={{ background: 'var(--red-100)', borderRadius: 'var(--radius-control)' }}>
              <div className="flex items-start gap-3">
                <AlertIcon size={18} color="var(--red-700)" />
                <div className="min-w-0">
                  <p className="m-0 font-medium text-[14px]" style={{ color: 'var(--red-700)' }}>
                    {cierre.mensaje}
                  </p>
                  <ul className="flex flex-col gap-1 m-0 mt-2.5 p-0 list-none">
                    {cierre.normasPendientes.map((n) => (
                      <li key={n.norma_titulo} className="text-[13px]" style={{ color: 'var(--red-700)' }}>
                        <span className="font-semibold">{n.norma_titulo}</span> — {n.fuente}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              size="m"
              onClick={() =>
                exportarInformePdf({
                  cliente,
                  sectorNombre,
                  jurisdiccionNombre,
                  resultado,
                  contextoRiesgo,
                  simulacionFinanciera: simulacionParaPdf,
                  resumenEjecutivo: resumen,
                  resumenGeneradoEn: resumenEn,
                })
              }
            >
              Exportar informe (PDF)
            </Button>
            {cierre.tipo === 'cerrada' ? (
              <CerradaBadge cerradaEn={cierre.cerradaEn} />
            ) : (
              cierre.tipo !== 'confirmando' &&
              cierre.tipo !== 'bloqueada' && (
                <Button variant="primary" size="m" disabled={cierre.tipo === 'enviando'} onClick={() => handleCerrar()}>
                  {cierre.tipo === 'enviando' ? 'Verificando…' : 'Verificar y cerrar evaluación'}
                </Button>
              )
            )}
          </div>
          {cierre.tipo === 'error' && (
            <p className="m-0 mt-2 max-w-[420px] font-medium text-[13px]" style={{ color: 'var(--state-danger)' }}>
              {cierre.mensaje}
            </p>
          )}
        </SeccionNumerada>

          {/* Pie institucional — cierra el encuadre del documento. */}
          <div className="flex items-center gap-2.5 px-[var(--pad-x)] py-3.5" style={{ background: 'var(--zone-bg)' }}>
            <SantanderLogo variant="mark" className="w-3.5 h-3.5" color="rgba(255,255,255,0.7)" />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em' }}>
              Banco Santander · Modelo de riesgo ESG
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// El veredicto — la firma del documento. El nivel general como una sola
// palabra a tamaño de titular (Ubuntu), sobre un lavado del color de banda.
// El acento de color lo lleva el filete SUPERIOR del panel (ver bloque 1):
// es el borde del instrumento, no una franja lateral decorativa. El color
// lo pone la banda de riesgo (verde/ámbar/rojo según nivel), no la marca.
function NivelRiesgoGeneral({ banda, detalle }: { banda: Banda; detalle: DetalleNorma[] }) {
  const color = BANDA_COLOR[banda];
  const grave = banda === 'Alto' || banda === 'Crítico';

  // Conteo de cumplimiento derivado del detalle por norma que ya está en el
  // frontend (el mismo que consumen la caja de cristal y las dimensiones
  // materiales). Puramente presentacional: agrupa por estatus, no recalcula
  // nada del modelo. Los cuatro conteos suman el total de normas aplicables.
  // no_aplica no debería llegar acá (v_riesgo_norma ya la excluye del score),
  // pero se incluye para que Estatus siga siendo exhaustivo.
  const conteo = { no_cumple: 0, parcial: 0, cumple: 0, desconocido: 0, no_aplica: 0 };
  for (const d of detalle) conteo[d.estatus]++;
  const total = detalle.length;
  // Numerador = normas EN REGLA (estatus 'cumple'). Parcial y desconocido no
  // cuentan como en regla; se ven en el desglose de abajo.
  const enRegla = conteo.cumple;
  const desglose = [
    { n: conteo.no_cumple, label: 'no cumple', dot: 'var(--risk-alto)' },
    { n: conteo.parcial, label: 'parcial', dot: 'var(--risk-medio)' },
    { n: conteo.cumple, label: 'cumple', dot: 'var(--risk-bajo)' },
    { n: conteo.desconocido, label: 'desconocido', dot: 'var(--doc-ink-500)' },
  ];

  return (
    <div className="px-[var(--pad-x)] py-6 sm:py-7" style={{ background: `${color}14` }}>
      <div className="flex sm:flex-row flex-col sm:items-stretch gap-y-6">
        {/* Izquierda — el veredicto, protagonista */}
        <div className="sm:flex-1 sm:pr-8 min-w-0">
          <div className="flex items-center gap-2">
            {grave && <AlertIcon size={14} color={color} />}
            <span className="ds-eyebrow" style={{ color: 'var(--doc-ink-700)' }}>
              Nivel de riesgo ESG
            </span>
          </div>
          <div
            className="mt-2.5 ds-title"
            style={{ fontSize: 'var(--figure-hero)', lineHeight: 1, letterSpacing: '-0.02em', color }}
          >
            {banda}
          </div>
          <p className="m-0 mt-2.5 max-w-[34ch] text-[13px] leading-snug" style={{ color: 'var(--doc-ink-500)' }}>
            Evaluado por el peor nivel de los canales de riesgo.
          </p>
        </div>

        {/* Derecha — estado de cumplimiento normativo: apoyo factual, en
            neutro. Distingue un veredicto por una sola norma de uno
            generalizado; los puntos de color son la única señal cromática. */}
        {total > 0 && (
          <div
            className="sm:flex-1 sm:pl-8 sm:border-l min-w-0 sm:text-right"
            style={{ borderColor: 'rgba(0,0,0,0.10)' }}
          >
            <div className="ds-eyebrow" style={{ color: 'var(--doc-ink-700)' }}>
              Estado Normativo
            </div>
            <div className="mt-2.5 ds-figure" style={{ fontSize: 'var(--figure-2xl)', color: 'var(--doc-ink-900)' }}>
              {enRegla}
              <span style={{ color: 'var(--doc-ink-500)' }}>/{total}</span>
            </div>
            <div
              className="flex flex-wrap sm:justify-end items-center gap-x-2 gap-y-1 mt-3 text-[12px]"
              style={{ color: 'var(--doc-ink-700)' }}
            >
              {desglose
                .filter((d) => d.n > 0)
                .map((item, i) => (
                <span key={item.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  {i > 0 && (
                    <span aria-hidden="true" className="mr-1" style={{ color: 'var(--doc-ink-400)' }}>
                      ·
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    style={{ width: 7, height: 7, borderRadius: 999, background: item.dot, display: 'inline-block', flexShrink: 0 }}
                  />
                  <span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--doc-ink-900)' }}>
                      {item.n}
                    </span>{' '}
                    {item.label}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfianzaChip({ pctVerificado, pctAutoreportado }: { pctVerificado: number; pctAutoreportado: number }) {
  return (
    <div style={{ background: 'var(--doc-paper)' }}>
      <ZonaHeader nivel="sub" headingLevel={3}>
        Rango de verificación
      </ZonaHeader>
      <div className="px-4 py-4">
        <div className="flex items-baseline gap-2">
          <span className="ds-figure" style={{ fontSize: 'var(--figure-xl)', color: 'var(--doc-ink-900)' }}>
            {pctVerificado}%
          </span>
          <span className="font-medium text-[13px]" style={{ color: 'var(--doc-ink-700)' }}>
            verificado
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden" style={{ background: 'var(--doc-rule)' }}>
          <div style={{ width: `${pctVerificado}%`, height: '100%', background: 'var(--ok-fg)' }} />
        </div>
        <div className="mt-2 text-[12px]" style={{ color: 'var(--doc-ink-500)' }}>
          {pctAutoreportado}% autoreportado
        </div>
      </div>
    </div>
  );
}

function PerfilCliente({
  sectorNombre,
  perfilTamano,
  esExportador,
}: {
  sectorNombre: string;
  perfilTamano: PerfilTamano;
  esExportador: boolean;
}) {
  // "Opera en" se quitó de aquí: el estado de operación ya vive en el mapa
  // localizador del panel "Ubicación de operación", justo debajo.
  const filas: [string, string][] = [
    ['Sector', sectorNombre],
    ['Tamaño', PERFIL_LABEL[perfilTamano]],
    ['Exporta a la UE', esExportador ? 'Sí' : 'No'],
  ];
  return (
    <div style={{ background: 'var(--doc-paper)' }}>
      <ZonaHeader nivel="sub" headingLevel={3}>
        Perfil del cliente
      </ZonaHeader>
      <dl className="m-0">
        {filas.map(([label, valor], i) => (
          <div
            key={label}
            className="flex justify-between items-baseline gap-3 px-4 py-2.5 text-[13px]"
            style={i < filas.length - 1 ? { borderBottom: '1px solid var(--doc-rule)' } : undefined}
          >
            <dt style={{ color: 'var(--doc-ink-500)' }}>{label}</dt>
            <dd className="m-0 font-semibold text-right" style={{ color: 'var(--doc-ink-900)' }}>
              {valor}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Ubicación de operación: mapa localizador del estado + contexto cualitativo
// de la jurisdicción (tip del estado + zona sensible del activo). Orienta al
// analista, NO modula el score ni se mezcla con las bandas ni con la
// exposición — por eso el tip va en tono informativo (ámbar), no de alarma
// (rojo), y el estado se resalta en el acento frío (sky), no en rojo.
function UbicacionOperacion({
  jurisdiccionNombre,
  contextoRiesgo,
  accionables,
  enZonaRiesgo,
  zonaRiesgoNota,
}: {
  jurisdiccionNombre: string;
  contextoRiesgo: string | null;
  /** jurisdicciones.accionables — qué hacer, distinto de contexto_riesgo (la situación). */
  accionables: string | null;
  enZonaRiesgo: boolean;
  zonaRiesgoNota: string | null;
}) {
  const hayTips = Boolean(contextoRiesgo) || enZonaRiesgo;

  return (
    <div className="ds-panel">
      <ZonaHeader nivel="sub" headingLevel={3}>
        Ubicación de operación
      </ZonaHeader>
      <div className="flex sm:flex-row flex-col gap-4 sm:gap-6 p-4">
        <div className="flex-shrink-0">
          <MapaMexico estado={jurisdiccionNombre} ancho={196} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="ds-eyebrow">Estado de operación</div>
          <div className="mt-1 ds-title" style={{ fontSize: 'var(--figure-l)', color: 'var(--doc-ink-900)' }}>
            {jurisdiccionNombre}
          </div>

          {/* Descriptivo, no alarma: es contexto cualitativo del estado y del
              activo, no modula el score. Integrado a la card, sin caja ni
              ícono de advertencia. */}
          <div className="mt-4 ds-eyebrow">Consideraciones</div>
          {hayTips ? (
            <div className="flex flex-col gap-1.5 mt-1.5">
              {contextoRiesgo && (
                <p className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--doc-ink-700)' }}>
                  {contextoRiesgo}
                </p>
              )}
              {enZonaRiesgo && (
                <p className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--doc-ink-700)' }}>
                  <strong className="font-semibold">Activo en zona sensible.</strong>
                  {zonaRiesgoNota ? ` ${zonaRiesgoNota}` : ''}
                </p>
              )}
            </div>
          ) : (
            <p className="m-0 mt-1.5 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
              Sin observaciones particulares para esta jurisdicción.
            </p>
          )}

          {accionables && (
            <>
              <div className="mt-4 ds-eyebrow">Accionables</div>
              <p className="m-0 mt-1.5 font-semibold text-[13px] leading-relaxed" style={{ color: 'var(--doc-ink-900)' }}>
                {accionables}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CerradaBadge({ cerradaEn }: { cerradaEn: string }) {
  const fecha = cerradaEn
    ? new Date(cerradaEn).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-[12px] uppercase tracking-[0.05em]"
      style={{ background: 'var(--ok-bg)', color: 'var(--ok-fg)', borderRadius: 'var(--radius-control)' }}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 10.5 8 14.5 16 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Evaluación cerrada{fecha ? ` · ${fecha}` : ''}
    </span>
  );
}

// Lente complementaria (pesos potenciales en riesgo), no un cálculo de riesgo:
// nunca se suma al score ni se mezcla con crédito/reputación. El score decide,
// esto orienta — por eso vive en su propia sección, debajo de las ScoreCards.
function ExposicionFinanciera({ exposicion }: { exposicion: Exposicion }) {
  const tieneCifra = exposicion.exposicion_min_mxn > 0 || exposicion.exposicion_max_mxn > 0;
  const vacioTotal = !tieneCifra && !exposicion.hay_no_cuantificable;

  return (
    <div className="ds-panel">
      <ZonaHeader nivel="sub" headingLevel={3}>
        Exposición financiera estimada
      </ZonaHeader>
      <div className="p-4 sm:p-5">
        <p className="m-0 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
          En caso de incumplimiento, rango de multas.
        </p>

        {tieneCifra && (
          <div className="mt-4" style={{ border: '1px solid var(--doc-rule)', borderRadius: 'var(--radius-control)', overflow: 'clip' }}>
            <div className="px-4 py-4">
              <div className="ds-eyebrow" style={{ fontSize: '0.625rem' }}>
                Rango de multas
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="ds-figure" style={{ fontSize: 'var(--figure-xl)', color: 'var(--doc-ink-900)' }}>
                  {formatRangoPesos(exposicion.exposicion_min_mxn, exposicion.exposicion_max_mxn)}
                </span>
                <span className="ds-eyebrow">MXN</span>
              </div>
            </div>

            {exposicion.detalle_cuantificable.length > 0 && (
              <details style={{ borderTop: '1px solid var(--doc-rule)' }}>
                <summary className="px-4 py-2.5 ds-summary">
                  <svg className="ds-summary-chev" width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Ver desglose por norma ({exposicion.detalle_cuantificable.length})
                </summary>
                <ul className="flex flex-col m-0 p-0 px-4 pb-3 list-none">
                  {exposicion.detalle_cuantificable.map((d) => (
                    <li
                      key={d.norma_titulo}
                      className="flex flex-wrap justify-between items-baseline gap-2 py-2 text-[13px]"
                      style={{ borderTop: '1px solid var(--doc-rule)', color: 'var(--doc-ink-700)' }}
                    >
                      <span>{d.norma_titulo}</span>
                      <span className="whitespace-nowrap ds-figure" style={{ fontSize: '13px', color: 'var(--doc-ink-900)' }}>
                        {formatRangoPesos(d.min_mxn, d.max_mxn)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {vacioTotal && (
          <p className="m-0 mt-4 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
            Sin exposición financiera estimada (sin incumplimientos cuantificables).
          </p>
        )}

        {exposicion.hay_no_cuantificable && (
          <div className="flex items-start gap-3 mt-4 px-4 py-3" style={{ background: 'var(--warn-bg)' }}>
            <AlertIcon size={16} color="var(--warn-fg)" />
            <div className="min-w-0">
              <p className="m-0 font-medium text-[13px]" style={{ color: 'var(--warn-ink)' }}>
                Además, esta evaluación tiene riesgos de impacto categórico que no están incluidos en la cifra anterior:
              </p>
              <ul className="flex flex-col gap-1 m-0 mt-2 p-0 list-none">
                {exposicion.no_cuantificables.map((n) => (
                  <li key={n.norma_titulo} className="text-[13px]" style={{ color: 'var(--warn-ink)' }}>
                    <span className="font-semibold">{n.norma_titulo}</span> — {n.motivo}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Traduce el veredicto de riesgo (ya calculado, fijo) a tres estados
// financieros seccionados, para la vista "Actual" (mezcla real del cliente,
// el ancla) y tres escenarios de referencia uniformes (cumple/parcial/
// incumple). Es una capa de PROYECCIÓN sobre la misma evaluación: nunca
// cambia el score ni la exposición, y vive subordinada a ambos, más abajo.
function SimuladorFinanciero({
  evaluacionId,
  onDefaultCargado,
}: {
  evaluacionId: string;
  onDefaultCargado: (s: SimulacionFinanciera) => void;
}) {
  const [predeterminada, setPredeterminada] = useState<SimulacionFinanciera | null>(null);
  const [mostrada, setMostrada] = useState<SimulacionFinanciera | null>(null);
  const [vista, setVista] = useState<VistaSimulada>('actual');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [form, setForm] = useState<PerfilFormState | null>(null);
  const [recalculando, setRecalculando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    simularFinanciero(evaluacionId)
      .then((res) => {
        if (cancelado) return;
        setPredeterminada(res);
        setMostrada(res);
        setForm(perfilAForm(res.perfil_usado));
        onDefaultCargado(res);
      })
      .catch((e) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar el simulador financiero.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
    // onDefaultCargado es un setState estable (identidad fija entre renders); solo re-corre si cambia la evaluación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluacionId]);

  async function aplicarSupuestos() {
    if (!form) return;
    setRecalculando(true);
    setError(null);
    try {
      const res = await simularFinanciero(evaluacionId, formAPerfilCustom(form));
      setMostrada(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo recalcular con estos supuestos.');
    } finally {
      setRecalculando(false);
    }
  }

  function restablecer() {
    if (!predeterminada) return;
    setMostrada(predeterminada);
    setForm(perfilAForm(predeterminada.perfil_usado));
    setError(null);
  }

  if (cargando) {
    return (
      <div className="ds-panel">
        <ZonaHeader nivel="sub" headingLevel={3}>
          Simulador de impacto financiero
        </ZonaHeader>
        <p className="m-0 p-4 sm:p-5 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
          Calculando impacto financiero…
        </p>
      </div>
    );
  }

  if (error && !mostrada) {
    return (
      <div className="ds-panel">
        <ZonaHeader nivel="sub" headingLevel={3}>
          Simulador de impacto financiero
        </ZonaHeader>
        <p className="m-0 p-4 sm:p-5 text-[13px]" style={{ color: 'var(--state-danger)' }}>
          {error}
        </p>
      </div>
    );
  }

  if (!mostrada) return null;

  // `origen_parametros.perfil_base` es siempre "placeholder" (constante del
  // motor). La señal real de si se usó un perfil FIRA vive en perfil_meta.fuente.
  const perfilMeta = mostrada.perfil_meta;
  const perfilEsFallback = !perfilMeta || !perfilMeta.fuente.includes('FIRA');
  const esActual = vista === 'actual';
  const vistaActiva = vistaDe(mostrada, vista);
  const actual = mostrada.actual;
  const color = VISTA_COLOR[vista];
  // DSCR: el umbral bancable FIRA. Bajo esto, requeriría respaldo FEGA.
  const DSCR_UMBRAL = 1.2;
  // Dictamen de bancabilidad: la auto-estructuración de deuda del backend. Solo
  // Actual y Cumple tienen estructura (son escenarios de préstamo real); en
  // Parcial/Incumple no se muestra.
  const estructura =
    vista === 'actual'
      ? mostrada.estructura_deuda.actual
      : vista === 'cumple'
        ? mostrada.estructura_deuda.cumple
        : null;
  const plazoBase = Math.round(mostrada.perfil_usado.amortizacion_anios);
  // Spread crediticio de la vista activa + los dos extremos para la síntesis
  // "precio del riesgo ESG" (Actual vs. Cumple).
  const spreadActivo = esActual
    ? mostrada.spread.actual
    : mostrada.spread.escenarios.find((s) => s.vista === vista) ?? mostrada.spread.actual;
  const spreadCumple = mostrada.spread.escenarios.find((s) => s.vista === 'cumple');

  return (
    <div className="ds-panel">
      <ZonaHeader nivel="sub" headingLevel={3}>
        Simulador de impacto financiero
      </ZonaHeader>
      <div className="p-4 sm:p-5">
        {/* ① Una línea de intro. */}
        <p className="m-0 max-w-[640px] text-[13px] leading-relaxed" style={{ color: 'var(--doc-ink-500)' }}>
          Proyección orientativa del efecto de los riesgos regulatorios sobre los indicadores financieros del cliente, bajo tres escenarios de
          cumplimiento. No es una predicción.
        </p>

        {/* ② Cómo leer esto — disclosure nativo, sin estado. Los dos párrafos
            largos (caption de tabs + trade-off) viven aquí, verbatim. */}
        <details className="mt-2">
          <summary className="ds-summary">
            <svg className="ds-summary-chev" width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Cómo leer esto
          </summary>
          <div className="flex flex-col gap-2 mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--doc-ink-700)' }}>
            <p className="m-0">
              "Actual" refleja el cumplimiento real del cliente. Los otros tres son escenarios de referencia uniformes para ubicar su posición.
            </p>
            <p className="m-0">
              Cumplir implica invertir (CAPEX financiado con deuda) pero preserva el EBITDA; incumplir evita la inversión pero destruye
              rentabilidad y suma multas. Compare la Utilidad Neta y el Deuda/EBITDA de cada escenario.
            </p>
          </div>
        </details>

        {/* ③ Supuestos del perfil — el contexto que produce los números, va
            ANTES del selector de escenario. Lectura siempre visible; el editor
            se despliega. Mismo estado `panelAbierto`, solo reubicado. */}
        <div className="mt-4" style={{ border: '1px solid var(--doc-rule)', borderRadius: 'var(--radius-control)', overflow: 'clip' }}>
          <div
            className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 px-4 py-2"
            style={{ background: 'var(--doc-paper-tint)', borderBottom: '1px solid var(--doc-rule)' }}
          >
            <span className="ds-eyebrow">Supuestos del perfil</span>
            <button
              type="button"
              onClick={() => setPanelAbierto((v) => !v)}
              aria-expanded={panelAbierto}
              className="inline-flex items-center gap-1.5 bg-transparent p-0 border-none font-semibold text-[11px] uppercase tracking-[0.06em] cursor-pointer"
              style={{ color: 'var(--doc-ink-700)' }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
                style={{ transform: panelAbierto ? 'rotate(90deg)' : 'none', transition: 'transform 160ms ease' }}
              >
                <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ajustar
            </button>
          </div>

          <div className="px-4 py-3.5">
            {form ? (
              <dl
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 m-0"
                style={{
                  gap: '1px',
                  background: 'var(--doc-rule)',
                  border: '1px solid var(--doc-rule)',
                  borderRadius: 'var(--radius-control)',
                  overflow: 'clip',
                }}
              >
                {[
                  ['Ingresos anuales', formatPesos(Number(form.ingresos_anuales))],
                  ['Margen EBITDA', `${form.margen_ebitda}%`],
                  ['Deuda / EBITDA', `${form.deuda_ebitda}x`],
                  ['Tasa de interés', `${form.tasa_interes}%`],
                  ['CAPEX / ingresos', `${form.capex_pct_ingresos}%`],
                ].map(([label, valor]) => (
                  <div key={label} className="px-3 py-2.5" style={{ background: 'var(--doc-paper)' }}>
                    <dt className="ds-eyebrow" style={{ fontSize: '0.625rem' }}>
                      {label}
                    </dt>
                    <dd className="m-0 mt-1 ds-figure" style={{ fontSize: '1rem', color: 'var(--doc-ink-900)' }}>
                      {valor}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="m-0 text-[12px]" style={{ color: 'var(--doc-ink-500)' }}>
                Perfil financiero del sector.
              </p>
            )}
            {perfilMeta && (
              <p className="m-0 mt-2.5 text-[12px]" style={{ color: 'var(--doc-ink-500)' }}>
                <strong className="font-semibold" style={{ color: 'var(--doc-ink-700)' }}>Perfil:</strong>{' '}
                {SUBSECTOR_LABEL[perfilMeta.subsector] ?? perfilMeta.subsector} ·{' '}
                {PERFIL_LABEL[perfilMeta.perfil_tamano as PerfilTamano] ?? perfilMeta.perfil_tamano} · {perfilMeta.fuente}
              </p>
            )}
            {perfilEsFallback && (
              <p className="m-0 mt-1.5 text-[12px] italic" style={{ color: 'var(--doc-ink-500)' }}>
                Perfil financiero basado en supuestos genéricos del sector, pendientes de validación.
              </p>
            )}
          </div>

          {panelAbierto && form && (
            <div className="px-4 py-4" style={{ borderTop: '1px solid var(--doc-rule)', background: 'var(--doc-paper-sunk)' }}>
              <p className="m-0 mb-4 text-[12px]" style={{ color: 'var(--doc-ink-500)' }}>
                Cada campo es un supuesto editable — ajústalo para explorar cómo cambiaría el impacto en vivo, en la vista seleccionada arriba. No
                afecta el veredicto de riesgo ni el informe en PDF, que siempre usa el perfil por defecto del sector.
              </p>
              <div className="gap-4 grid grid-cols-2 sm:grid-cols-3">
                <Input
                  id="sim-ingresos"
                  label="Ingresos anuales, MXN (supuesto)"
                  type="number"
                  value={form.ingresos_anuales}
                  onChange={(v) => setForm({ ...form, ingresos_anuales: v })}
                />
                <Input
                  id="sim-margen"
                  label="Margen EBITDA, % (supuesto)"
                  type="number"
                  value={form.margen_ebitda}
                  onChange={(v) => setForm({ ...form, margen_ebitda: v })}
                />
                <Input
                  id="sim-deuda"
                  label="Deuda/EBITDA base, x (supuesto)"
                  type="number"
                  value={form.deuda_ebitda}
                  onChange={(v) => setForm({ ...form, deuda_ebitda: v })}
                />
                <Input
                  id="sim-tasa"
                  label="Tasa de interés, % (supuesto)"
                  type="number"
                  value={form.tasa_interes}
                  onChange={(v) => setForm({ ...form, tasa_interes: v })}
                />
                <Input
                  id="sim-capex"
                  label="CAPEX, % de ingresos (supuesto)"
                  type="number"
                  value={form.capex_pct_ingresos}
                  onChange={(v) => setForm({ ...form, capex_pct_ingresos: v })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <Button variant="primary" size="s" disabled={recalculando} onClick={aplicarSupuestos}>
                  {recalculando ? 'Recalculando…' : 'Aplicar y recalcular'}
                </Button>
                <Button variant="ghost" size="s" disabled={recalculando} onClick={restablecer}>
                  Restablecer valores por defecto
                </Button>
              </div>
              {error && (
                <p className="m-0 mt-3 text-[12px]" style={{ color: 'var(--state-danger)' }}>
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ③b Barra de control: el selector de escenario, "el mando", ya con
            los supuestos a la vista arriba. */}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-4 px-3 py-2.5"
          style={{ background: 'var(--doc-paper-sunk)', border: '1px solid var(--doc-rule)', borderRadius: 'var(--radius-control)' }}
        >
          <span className="ds-eyebrow" style={{ fontSize: '0.625rem' }}>
            Escenario
          </span>
          <div
            className="flex flex-1 min-w-[240px]"
            role="tablist"
            style={{ border: '1px solid var(--doc-rule)', borderRadius: 'var(--radius-control)', overflow: 'clip' }}
          >
            {(['actual', 'cumple', 'parcial', 'incumple'] as VistaSimulada[]).map((v) => (
              <TabButtonSimulador key={v} active={vista === v} color={VISTA_COLOR[v]} onClick={() => setVista(v)}>
                {VISTA_LABEL[v]}
              </TabButtonSimulador>
            ))}
          </div>
        </div>

        {/* ④ Resultado del escenario: un contenedor, 3 niveles con filete. */}
        <div className="mt-4" style={{ border: '1px solid var(--doc-rule)', borderRadius: 'var(--radius-control)', overflow: 'clip' }}>
          <div
            className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 px-4 py-2"
            style={{ background: 'var(--doc-paper-tint)', borderBottom: '1px solid var(--doc-rule)' }}
          >
            <span className="ds-eyebrow">Resultado del escenario</span>
            <span
              className="inline-flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-[0.04em]"
              style={{ color: color }}
            >
              <span className="rounded-full w-1.5 h-1.5" style={{ background: color }} aria-hidden="true" />
              {VISTA_LABEL[vista]}
              {!esActual && (
                <span style={{ color: 'var(--doc-ink-500)', fontWeight: 500 }}> · comparado con Actual</span>
              )}
            </span>
          </div>

          {/* 4a · Qué lo mueve (los drivers): abre el resultado, pegado a la
              cabecera del contenedor, sin filete propio. */}
          <div className="px-4 py-4">
            <div className="ds-eyebrow" style={{ fontSize: '0.625rem' }}>
              Qué lo mueve
            </div>
            <div
              className="grid grid-cols-1 sm:grid-cols-3 mt-3"
              style={{ gap: '1px', background: 'var(--doc-rule)', border: '1px solid var(--doc-rule)', borderRadius: 'var(--radius-control)', overflow: 'clip' }}
            >
              <ImpactoChip
                label="CAPEX de cumplimiento"
                valor={vistaActiva.capex_cumplimiento}
                nota="Inversión estimada para cerrar la brecha de cumplimiento del cliente: 60% de la consecuencia aún no cubierta, norma por norma (impacto operativo potencial en EBITDA escalado por su incumplimiento real, más las multas esperadas). Un cliente ya conforme tiende a 0. Por eso puede superar la multa: el mayor costo de incumplir suele ser la pérdida operativa, no la multa."
                subnota={`Flujo de inversión ${formatPesos(vistaActiva.flujo.flujo_inversion)}`}
              />
              <ImpactoChip
                label="Impacto operativo (EBITDA)"
                valor={vistaActiva.impacto_operativo}
                subnota="Vía flujo operativo"
              />
              <ImpactoChip label="Multa" valor={vistaActiva.multa} subnota="Vía flujo operativo" />
            </div>
          </div>

          {/* 4b · Indicadores de crédito (los ratios cabecera) */}
          <div className="px-4 py-4" style={{ borderTop: '1px solid var(--doc-rule)' }}>
            <div className="ds-eyebrow" style={{ fontSize: '0.625rem' }}>
              Indicadores de crédito
            </div>
            <div
              className="grid grid-cols-1 sm:grid-cols-3 mt-3"
              style={{ gap: '1px', background: 'var(--doc-rule)', border: '1px solid var(--doc-rule)', borderRadius: 'var(--radius-control)', overflow: 'clip' }}
            >
              <IndicadorDestacado
                label="Deuda / EBITDA"
                valor={vistaActiva.indicadores.deuda_ebitda}
                valorActual={actual.indicadores.deuda_ebitda}
                esActual={esActual}
                peorEsMayor
              />
              <IndicadorDestacado
                label="Cobertura de intereses"
                valor={vistaActiva.indicadores.cobertura_intereses}
                valorActual={actual.indicadores.cobertura_intereses}
                esActual={esActual}
                peorEsMayor={false}
              />
              <IndicadorDestacado
                label="DSCR (servicio de deuda)"
                valor={vistaActiva.indicadores.dscr}
                valorActual={actual.indicadores.dscr}
                esActual={esActual}
                peorEsMayor={false}
                umbral={DSCR_UMBRAL}
                umbralNota={`Mín. bancable ${DSCR_UMBRAL.toFixed(2)}x`}
                formato={(n) => (typeof n === 'number' && Number.isFinite(n) ? `${n.toFixed(2)}x` : '—')}
              />
            </div>
          </div>

          {/* 4b-bis · Ciclo de conversión de efectivo — un riesgo ESG que se
              materializa congela la operación: el inventario no rota, los clientes
              retienen pagos y los proveedores cortan el crédito comercial. */}
          <div className="px-4 py-4" style={{ borderTop: '1px solid var(--doc-rule)' }}>
            <div className="ds-eyebrow" style={{ fontSize: '0.625rem' }}>
              Ciclo de conversión de efectivo
            </div>

            {/* Un solo bloque cuadriculado: arriba el desglose (días y montos que
                arman el ciclo), abajo los dos totales. El separador de 1px entre
                sub-grids viene del gap del contenedor. */}
            <div
              className="flex flex-col mt-3"
              style={{ gap: '1px', background: 'var(--doc-rule)', border: '1px solid var(--doc-rule)', borderRadius: 'var(--radius-control)', overflow: 'clip' }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" style={{ gap: '1px', background: 'var(--doc-rule)' }}>
                <MiniDato
                  label="DDC"
                  valor={vistaActiva.indicadores.dias_cobro}
                  valorActual={actual.indicadores.dias_cobro}
                  esActual={esActual}
                  formato={String}
                />
                <MiniDato
                  label="DDI"
                  valor={vistaActiva.indicadores.dias_inventario}
                  valorActual={actual.indicadores.dias_inventario}
                  esActual={esActual}
                  formato={String}
                />
                <MiniDato
                  label="DDP"
                  valor={vistaActiva.indicadores.dias_pago}
                  valorActual={actual.indicadores.dias_pago}
                  esActual={esActual}
                  formato={String}
                  peorEsMayor={false}
                />
                <MiniDato
                  label="CXC"
                  valor={vistaActiva.indicadores.cuentas_por_cobrar}
                  valorActual={actual.indicadores.cuentas_por_cobrar}
                  esActual={esActual}
                  formato={formatPesos}
                />
                <MiniDato
                  label="INV"
                  valor={vistaActiva.indicadores.inventario_valor}
                  valorActual={actual.indicadores.inventario_valor}
                  esActual={esActual}
                  formato={formatPesos}
                />
                <MiniDato
                  label="CXP"
                  valor={vistaActiva.indicadores.cuentas_por_pagar}
                  valorActual={actual.indicadores.cuentas_por_pagar}
                  esActual={esActual}
                  formato={formatPesos}
                  peorEsMayor={false}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: '1px', background: 'var(--doc-rule)' }}>
                <MetricaCiclo
                  label="Ciclo de Conversión de Efectivo"
                  valor={vistaActiva.indicadores.ciclo_conversion_efectivo}
                  valorActual={actual.indicadores.ciclo_conversion_efectivo}
                  esActual={esActual}
                  formato={(n) => `${n} días`}
                />
                <MetricaCiclo
                  label="Capital de trabajo neto"
                  valor={vistaActiva.indicadores.capital_trabajo_neto}
                  valorActual={actual.indicadores.capital_trabajo_neto}
                  esActual={esActual}
                  formato={formatPesos}
                />
              </div>
            </div>
            <p className="m-0 mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--doc-ink-500)' }}>
              Más días y más capital inmovilizado = más caja atrapada en la operación, presión de liquidez que no aparece
              en el EBITDA.
            </p>
          </div>

          {/* 4c · Estados financieros — Actual vs. escenario, lado a lado. Con
              la pestaña Actual (esActual) cada panel muestra una sola columna. */}
          <div className="px-4 py-4" style={{ borderTop: '1px solid var(--doc-rule)' }}>
            <div className="ds-eyebrow" style={{ fontSize: '0.625rem' }}>
              Estados financieros
            </div>
            <div className="gap-4 grid grid-cols-1 md:grid-cols-2 mt-3">
              <EstadoFinancieroBloque
                titulo="Estado de Resultados"
                comparando={!esActual}
                escenarioLabel={VISTA_LABEL[vista]}
                escenarioColor={color}
              >
                <LineaEF
                  label="Ingresos"
                  actual={actual.estado_resultados.ingresos}
                  escenario={esActual ? undefined : vistaActiva.estado_resultados.ingresos}
                />
                <LineaEF
                  label="EBITDA"
                  actual={actual.estado_resultados.ebitda}
                  escenario={esActual ? undefined : vistaActiva.estado_resultados.ebitda}
                  alertaSiNegativo
                />
                <LineaEF
                  label="(−) Depreciación"
                  actual={-actual.estado_resultados.depreciacion}
                  escenario={esActual ? undefined : -vistaActiva.estado_resultados.depreciacion}
                />
                <LineaEF
                  label="(−) Multa"
                  actual={-actual.estado_resultados.multa}
                  escenario={esActual ? undefined : -vistaActiva.estado_resultados.multa}
                />
                <LineaEF
                  label="(−) Intereses"
                  actual={-actual.estado_resultados.intereses}
                  escenario={esActual ? undefined : -vistaActiva.estado_resultados.intereses}
                />
                <LineaEF
                  label="Utilidad neta"
                  actual={actual.estado_resultados.utilidad_neta}
                  escenario={esActual ? undefined : vistaActiva.estado_resultados.utilidad_neta}
                  total
                />
              </EstadoFinancieroBloque>

              <EstadoFinancieroBloque
                titulo="Balance General"
                comparando={!esActual}
                escenarioLabel={VISTA_LABEL[vista]}
                escenarioColor={color}
              >
                <LineaEF
                  label="Activo fijo"
                  actual={actual.balance.activo_fijo}
                  escenario={esActual ? undefined : vistaActiva.balance.activo_fijo}
                />
                <LineaEF
                  label="Circulante operativo"
                  actual={actual.balance.otros_activos}
                  escenario={esActual ? undefined : vistaActiva.balance.otros_activos}
                />
                <LineaEF
                  label="Caja"
                  actual={actual.balance.caja}
                  escenario={esActual ? undefined : vistaActiva.balance.caja}
                  alertaSiNegativo
                />
                <LineaEF
                  label="Activo total"
                  actual={actual.balance.activo_total}
                  escenario={esActual ? undefined : vistaActiva.balance.activo_total}
                  total
                />
                <div className="my-1" />
                <LineaEF
                  label="Deuda financiera"
                  actual={actual.balance.deuda}
                  escenario={esActual ? undefined : vistaActiva.balance.deuda}
                />
                <LineaEF
                  label="Proveedores"
                  actual={actual.balance.cuentas_por_pagar}
                  escenario={esActual ? undefined : vistaActiva.balance.cuentas_por_pagar}
                />
                <LineaEF
                  label="Capital"
                  actual={actual.balance.capital}
                  escenario={esActual ? undefined : vistaActiva.balance.capital}
                />
                <LineaEF
                  label="Pasivo + Capital"
                  actual={actual.balance.pasivo_capital_total}
                  escenario={esActual ? undefined : vistaActiva.balance.pasivo_capital_total}
                  total
                />
              </EstadoFinancieroBloque>
            </div>
          </div>

          {/* 4d · Costo del crédito — traduce el riesgo ESG + capacidad de pago
              a la tasa que pagaría el cliente. Scorecard, no cotización. */}
          <CostoDelCredito spread={spreadActivo} spreadActual={mostrada.spread.actual} spreadCumple={spreadCumple} />

          {/* 4e · Decisión de crédito — el dictamen que cierra el bloque, después
              de todo el sustento (indicadores, estados financieros, costo).
              Solo Actual y Cumple tienen estructura; en Parcial/Incumple no se
              renderiza. Versión cuantificada de la antigua alerta FEGA. */}
          {estructura && (
            <DictamenBancabilidad estructura={estructura} plazoBase={plazoBase} esActual={esActual} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButtonSimulador({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="flex-1 px-3 py-2 font-semibold text-[12px] text-center uppercase tracking-[0.04em]"
      style={{
        background: active ? 'var(--doc-paper)' : 'var(--doc-paper-sunk)',
        color: active ? color : 'var(--doc-ink-500)',
        boxShadow: active ? `inset 0 -2px 0 ${color}` : 'inset -1px 0 0 var(--doc-rule)',
        transition: 'background 160ms ease, color 160ms ease, box-shadow 160ms ease',
      }}
    >
      {children}
    </button>
  );
}

// Dictamen de bancabilidad: traduce la auto-estructuración de deuda del backend
// (estructura_deuda) en una decisión de crédito. Cierra el "Resultado del
// escenario" —el dictamen al final, después de todo su sustento (indicadores,
// estados financieros, costo del crédito)—.
// Formato compacto: eyebrow + verdicto en negrita/color semántico al inicio de
// la razón. El ámbar del caso "reestructura" es el mismo del DSCR bajo umbral;
// el rojo del caso FEGA es el de banda crítica. Reemplaza a la antigua alerta
// FEGA genérica; nunca se muestran las dos.
function DictamenBancabilidad({
  estructura,
  plazoBase,
  esActual,
}: {
  estructura: EstructuraDeuda;
  plazoBase: number;
  esActual: boolean;
}) {
  const contexto = esActual ? 'Bancabilidad actual' : 'Estructura del crédito de cumplimiento';

  let hex: string;
  let verdicto: string;
  let razon: React.ReactNode;

  if (estructura.bancable_base) {
    hex = '#1e8a4c'; // --ok-fg
    verdicto = 'Bancable';
    razon =
      estructura.dscr_base != null ? (
        <>
          El servicio de deuda queda cubierto con la estructura actual (DSCR{' '}
          <strong className="font-semibold tabular-nums">{estructura.dscr_base.toFixed(2)}x</strong>, plazo {plazoBase}{' '}
          años). Sujeto de crédito sin garantía adicional.
        </>
      ) : (
        <>El servicio de deuda queda cubierto con la estructura actual. Sujeto de crédito sin garantía adicional.</>
      );
  } else if (
    estructura.reestructurable &&
    estructura.plazo_optimo != null &&
    estructura.dscr_optimo != null
  ) {
    hex = '#b87500'; // --warn-fg (mismo ámbar del DSCR bajo el mínimo)
    verdicto = 'Bancable con reestructura';
    razon = (
      <>
        ampliar el plazo de la deuda de {plazoBase} a{' '}
        <strong className="font-semibold tabular-nums">{estructura.plazo_optimo} años</strong> eleva el DSCR a{' '}
        <strong className="font-semibold tabular-nums">{estructura.dscr_optimo.toFixed(2)}x</strong> y el crédito se
        vuelve viable.
      </>
    );
  } else {
    hex = '#b00000'; // --risk-critico
    verdicto = 'Requiere garantía FEGA';
    razon = (
      <>
        no alcanza el mínimo bancable ni reestructurando a 10 años. Faltan{' '}
        <strong className="font-semibold tabular-nums">{formatPesos(estructura.deficit_flujo)}</strong> de flujo anual
        para cubrir el servicio de deuda; requeriría respaldo de garantía FEGA de FIRA.
      </>
    );
  }

  return (
    <div className="px-4 py-3" style={{ background: `${hex}14`, borderTop: '1px solid var(--doc-rule)' }}>
      <div className="ds-eyebrow" style={{ fontSize: '0.625rem' }}>
        Decisión de crédito · {contexto}
      </div>
      <p className="m-0 mt-1 max-w-[68ch] text-[13px] leading-snug" style={{ color: 'var(--doc-ink-700)' }}>
        <strong className="font-semibold" style={{ color: hex }}>
          {verdicto}:
        </strong>{' '}
        {razon}
      </p>
    </div>
  );
}

// Etiqueta y color de banda por categoría del scorecard de crédito.
// A verde, B ámbar, C rojo-naranja, D rojo (paleta de banda de riesgo).
// `bursatil` no es una categoría de riesgo: es la referencia de fondeo de un
// emisor listado (azul de contexto, sin letra de grado).
const CATEGORIA_CREDITO: Record<'A' | 'B' | 'C' | 'D' | 'bursatil', { label: string; hex: string }> = {
  A: { label: 'Riesgo bajo (greenium)', hex: '#1e8a4c' },
  B: { label: 'Riesgo medio (base FIRA)', hex: '#b87500' },
  C: { label: 'Riesgo alto', hex: '#ec0100' },
  D: { label: 'Riesgo crítico', hex: '#b00000' },
  bursatil: { label: 'Referencia bursátil (quirografario)', hex: 'var(--ctx-500)' },
};

// Costo del crédito: el spread ESG traducido a "TIIE + x%". Corona el
// simulador. Solo presentación del scorecard del backend; ninguna cifra se
// calcula aquí. `cotiza_bolsa` muestra la referencia bursátil fija (TIIE +
// 150 pb, sin letra de grado); `multinacional` queda fuera de alcance (solo
// el mensaje, sin tasa).
function CostoDelCredito({
  spread,
  spreadActual,
  spreadCumple,
}: {
  spread: Spread;
  spreadActual: Spread;
  spreadCumple: Spread | undefined;
}) {
  const notaFuente =
    spread.categoria === 'bursatil' ? (
      <p className="m-0 mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--doc-ink-500)' }}>
        Referencia de mercado de capitales sobre TIIE ({spread.tiie.toFixed(2)}%): deuda quirografaria de emisor
        listado. No es el scorecard PyME FIRA ni una cotización.
      </p>
    ) : (
      <p className="m-0 mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--doc-ink-500)' }}>
        Scorecard de spread sobre TIIE ({spread.tiie.toFixed(2)}%). Base PyME FIRA; ajuste ESG calibrado a 200–400 pb
        (Expansión ESG / GGGI). No es una cotización.
      </p>
    );

  if (!spread.aplica) {
    return (
      <div className="px-4 py-4" style={{ borderTop: '1px solid var(--doc-rule)' }}>
        <div className="ds-eyebrow" style={{ fontSize: '0.625rem' }}>
          Costo del crédito
        </div>
        <p className="m-0 mt-2 max-w-[68ch] text-[13px] leading-relaxed" style={{ color: 'var(--doc-ink-700)' }}>
          {spread.nota}
        </p>
        {notaFuente}
      </div>
    );
  }

  const cat = CATEGORIA_CREDITO[spread.categoria as keyof typeof CATEGORIA_CREDITO];
  const esBursatil = spread.categoria === 'bursatil';
  const spreadPct = (spread.spread_pct ?? 0).toFixed(2);
  const tasaTotal = (spread.tasa_total_pct ?? 0).toFixed(2);

  const compara =
    spreadActual.aplica &&
    spreadCumple?.aplica &&
    spreadActual.spread_pb != null &&
    spreadCumple.spread_pb != null &&
    spreadActual.spread_pb - spreadCumple.spread_pb > 0;
  const difPb = compara ? spreadActual.spread_pb! - spreadCumple!.spread_pb! : 0;

  return (
    <div className="px-4 py-4" style={{ borderTop: '1px solid var(--doc-rule)' }}>
      <div className="ds-eyebrow" style={{ fontSize: '0.625rem' }}>
        Costo del crédito
      </div>

      <div className="flex sm:flex-row flex-col sm:items-start gap-y-3 sm:gap-x-8 mt-3">
        <div className="min-w-0">
          <div className="ds-figure" style={{ fontSize: 'var(--figure-xl)', color: 'var(--doc-ink-900)' }}>
            TIIE + {spreadPct}%
          </div>
          <div className="mt-1 ds-figure" style={{ fontSize: 'var(--figure-m)', color: 'var(--doc-ink-500)' }}>
            = {tasaTotal}%
          </div>
        </div>
        <div className="sm:pt-1">
          <span className="inline-flex items-center gap-2">
            {!esBursatil && (
              <span
                className="inline-flex justify-center items-center font-bold text-[13px]"
                style={{ width: 26, height: 26, background: `${cat.hex}1f`, color: cat.hex, borderRadius: 'var(--radius-control)' }}
              >
                {spread.categoria}
              </span>
            )}
            <span className="font-semibold text-[12px]" style={{ color: cat.hex }}>
              {cat.label}
            </span>
          </span>
        </div>
      </div>

      <p className="m-0 mt-3 max-w-[68ch] text-[12px] leading-relaxed" style={{ color: 'var(--doc-ink-700)' }}>
        {spread.nota}
      </p>

      {compara && (
        <p className="m-0 mt-3 max-w-[68ch] text-[13px] leading-relaxed" style={{ color: 'var(--doc-ink-900)' }}>
          <strong className="font-semibold">Precio del riesgo ESG:</strong> el mismo cliente paga TIIE +{' '}
          <span className="tabular-nums">{(spreadActual.spread_pct ?? 0).toFixed(2)}%</span> en su estado actual y TIIE +{' '}
          <span className="tabular-nums">{(spreadCumple!.spread_pct ?? 0).toFixed(2)}%</span> si se blinda (escenario
          Cumple). Esos <strong className="font-semibold tabular-nums">{difPb} pb</strong> son el costo de no gestionar el
          riesgo ESG.
        </p>
      )}

      {notaFuente}
    </div>
  );
}

// Los dos indicadores de crédito que el banco mira primero. "Actual" es la
// referencia: si la vista activa es un escenario, muestra el valor de
// "Actual" debajo para comparar.
//
// El motor ya NO topa el EBITDA en cero: una pérdida operativa puede volver
// el EBITDA negativo (información honesta, no un caso a ocultar), y en ese
// caso Deuda/EBITDA y Cobertura salen negativos también — el número negativo
// ES la señal (insolvencia operativa), se muestra tal cual en rojo, nunca
// como "—". "—" (indefinido) queda reservado solo para `null` (EBITDA
// exactamente 0, división por cero real).
function IndicadorDestacado({
  label,
  valor,
  valorActual,
  esActual,
  peorEsMayor,
  umbral,
  umbralNota,
  formato = formatVeces,
}: {
  label: string;
  valor: number | null;
  valorActual: number | null;
  esActual: boolean;
  /** Sentido del umbral: `true` = un valor mayor es el que cruza a "bajo umbral". */
  peorEsMayor: boolean;
  /** Umbral de referencia (p. ej. DSCR bancable 1.20x). Cambia el color: bajo el umbral → alerta, sobre → verde. */
  umbral?: number;
  umbralNota?: string;
  /** Formateador del valor (por defecto `formatVeces`, 1 decimal). */
  formato?: (n: number | null) => string;
}) {
  const nulo = valor === null;
  const negativo = valor !== null && valor < 0;
  const bajoUmbral =
    umbral != null && valor !== null && !negativo && (peorEsMayor ? valor > umbral : valor < umbral);
  const sobreUmbral = umbral != null && valor !== null && !negativo && !bajoUmbral;
  const valorColor = nulo
    ? 'var(--doc-ink-500)'
    : negativo
      ? 'var(--state-danger)'
      : bajoUmbral
        ? 'var(--warn-fg)'
        : sobreUmbral
          ? 'var(--ok-fg)'
          : 'var(--doc-ink-900)';
  const comparar = !esActual && !nulo && !negativo && valorActual !== null;
  return (
    <div className="p-4" style={{ background: 'var(--doc-paper)' }}>
      <div className="flex justify-between items-start gap-2">
        <div className="ds-eyebrow">{label}</div>
        {comparar && <EsquinaActual>{formato(valorActual)}</EsquinaActual>}
      </div>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="ds-figure" style={{ fontSize: 'var(--figure-xl)', color: valorColor }}>
          {formato(valor)}
        </span>
        {comparar && <DeltaChip delta={valor! - valorActual!} formato={(n) => formato(n)} peorEsMayor={peorEsMayor} />}
      </div>
      {umbral != null && umbralNota && !nulo && !negativo && (
        <div className="mt-1.5 text-[11px]" style={{ color: bajoUmbral ? 'var(--warn-fg)' : 'var(--doc-ink-500)' }}>
          {umbralNota}
        </div>
      )}
      {nulo && (
        <div className="mt-1.5 text-[11px]" style={{ color: 'var(--doc-ink-500)' }}>
          EBITDA nulo: indicador indefinido
        </div>
      )}
      {negativo && (
        <div className="mt-1.5 text-[11px]" style={{ color: 'var(--state-danger)' }}>
          EBITDA negativo: pérdida operativa
        </div>
      )}
    </div>
  );
}

// Celda de contexto del desglose del ciclo de efectivo (días de
// cobro/inventario/pago y montos de CxC/inv/CxP). Comparte el tratamiento de
// celda cuadriculada del resto de la sección; padding más chico que los totales
// de abajo para marcar la jerarquía "componentes → total". Compacta: "Actual" en
// la esquina y chip de variación por signo, igual que las cards grandes.
function MiniDato({
  label,
  valor,
  valorActual,
  esActual,
  formato,
  peorEsMayor = true,
}: {
  label: string;
  valor: number;
  valorActual: number;
  esActual: boolean;
  formato: (n: number) => string;
  /** `false` para métricas donde MÁS es mejor (días/cuentas por pagar). */
  peorEsMayor?: boolean;
}) {
  return (
    <div className="px-3 py-2.5" style={{ background: 'var(--doc-paper)' }}>
      <div className="flex flex-wrap justify-between items-start gap-x-2">
        <div className="ds-eyebrow" style={{ fontSize: '0.5625rem' }}>
          {label}
        </div>
        {!esActual && <EsquinaActual>{formato(valorActual)}</EsquinaActual>}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="font-semibold tabular-nums text-[13px]" style={{ color: 'var(--doc-ink-900)' }}>
          {formato(valor)}
        </span>
        {!esActual && (
          <DeltaChip delta={valor - valorActual} formato={formato} peorEsMayor={peorEsMayor} size="sm" />
        )}
      </div>
    </div>
  );
}

// Métrica del ciclo de efectivo (CCC en días, capital de trabajo neto en MXN).
// A diferencia de IndicadorDestacado no tiene lógica de EBITDA nulo/negativo.
// En ambas, MENOS es mejor (menos caja atrapada), así que bajar sale verde.
function MetricaCiclo({
  label,
  valor,
  valorActual,
  esActual,
  formato,
}: {
  label: string;
  valor: number;
  valorActual: number;
  esActual: boolean;
  formato: (n: number) => string;
}) {
  return (
    <div className="p-4" style={{ background: 'var(--doc-paper)' }}>
      <div className="flex justify-between items-start gap-2">
        <div className="ds-eyebrow">{label}</div>
        {!esActual && <EsquinaActual>{formato(valorActual)}</EsquinaActual>}
      </div>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="ds-figure" style={{ fontSize: 'var(--figure-xl)', color: 'var(--doc-ink-900)' }}>
          {formato(valor)}
        </span>
        {!esActual && <DeltaChip delta={valor - valorActual} formato={formato} peorEsMayor />}
      </div>
    </div>
  );
}

// Los tres impactos de la vista: cumplir cuesta CAPEX, incumplir cuesta
// multa + EBITDA — nunca los tres a la vez. Los que son $0 se atenúan para
// que el trade-off salte a la vista de un vistazo.
function ImpactoChip({
  label,
  valor,
  nota,
  subnota,
}: {
  label: string;
  valor: number;
  nota?: string;
  /** Nota muda bajo la cifra: por qué canal de flujo de caja pasa este monto. */
  subnota?: string;
}) {
  return (
    <div className="px-3 py-2.5 text-center" style={{ background: 'var(--doc-paper)', opacity: valor > 0 ? 1 : 0.45 }}>
      <div className="flex justify-center items-center gap-1 ds-eyebrow" style={{ fontSize: '0.625rem' }}>
        {label}
        {nota && (
          <span className="ds-tip-wrap">
            <span
              className="ds-tip-trigger"
              tabIndex={0}
              role="button"
              aria-label={`Cómo se calcula: ${nota}`}
              title={nota}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="8" cy="4.7" r="1" fill="currentColor" />
                <path d="M8 7.2v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </span>
            <span className="ds-tip" role="tooltip">
              {nota}
            </span>
          </span>
        )}
      </div>
      <div className="mt-1.5 ds-figure" style={{ fontSize: 'var(--figure-m)', color: 'var(--doc-ink-900)' }}>
        {formatPesos(valor)}
      </div>
      {subnota && (
        <div className="mt-0.5 text-[10px] leading-tight" style={{ color: 'var(--doc-ink-500)' }}>
          {subnota}
        </div>
      )}
    </div>
  );
}

// Ancho fijo de cada celda de valor en los estados financieros, para que las
// columnas Actual | escenario queden alineadas dentro de cada panel.
const EF_COL = 'w-[92px] text-right tabular-nums';

function EstadoFinancieroBloque({
  titulo,
  comparando = false,
  escenarioLabel,
  escenarioColor = 'var(--doc-ink-700)',
  children,
}: {
  titulo: string;
  comparando?: boolean;
  escenarioLabel?: string;
  escenarioColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: '1px solid var(--doc-rule)', borderRadius: 'var(--radius-control)', overflow: 'clip' }}>
      <h4
        className="m-0 px-3 py-1.5 font-semibold text-[10px] uppercase tracking-[0.09em]"
        style={{ background: 'var(--doc-paper-sunk)', color: 'var(--doc-ink-500)', borderBottom: '1px solid var(--doc-rule)' }}
      >
        {titulo}
      </h4>
      <div className="flex flex-col gap-2 p-3">
        {comparando && (
          <div className="flex justify-end items-baseline gap-3 pb-0.5">
            <span className={`ds-eyebrow ${EF_COL}`} style={{ fontSize: '0.5625rem' }}>
              Actual
            </span>
            <span className={`ds-eyebrow ${EF_COL}`} style={{ fontSize: '0.5625rem', color: escenarioColor }}>
              {escenarioLabel}
            </span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// Línea de un estado financiero. Las líneas "total" (utilidad neta, flujo
// neto) se marcan en rojo si dan negativo, igual que EBITDA (vía
// `alertaSiNegativo`) — un EBITDA negativo es un resultado coherente y
// esperado en el peor escenario, no un error a esconder. Las líneas de
// deducción (depreciación, multa, intereses) se muestran como negativas por
// convención contable, sin implicar por sí solas un deterioro.
function LineaEF({
  label,
  actual,
  escenario,
  total = false,
  alertaSiNegativo = total,
}: {
  label: string;
  actual: number;
  /** `undefined` => una sola columna (comportamiento previo). Definido => se
      añade una segunda columna a la derecha con el valor del escenario. */
  escenario?: number;
  total?: boolean;
  alertaSiNegativo?: boolean;
}) {
  const comparando = escenario !== undefined;
  const valorColor = (v: number, atenuado: boolean) =>
    alertaSiNegativo && v < 0
      ? 'var(--state-danger)'
      : atenuado
        ? 'var(--doc-ink-500)'
        : total
          ? 'var(--doc-ink-900)'
          : 'var(--doc-ink-700)';
  const cifra = (v: number, atenuado: boolean) => (
    <span
      className={`${EF_COL} ${total ? 'font-bold text-[15px]' : 'font-semibold text-[13px]'}`}
      style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: valorColor(v, atenuado) }}
    >
      {formatPesos(v)}
    </span>
  );
  return (
    <div
      className="flex justify-between items-baseline gap-3"
      style={total ? { borderTop: '1px solid var(--doc-rule-strong)', paddingTop: 6 } : undefined}
    >
      <span
        className={total ? 'font-semibold text-[13px]' : 'text-[12px]'}
        style={{ color: total ? 'var(--doc-ink-900)' : 'var(--doc-ink-500)' }}
      >
        {label}
      </span>
      <span className="flex items-baseline gap-3">
        {cifra(actual, comparando)}
        {comparando && cifra(escenario, false)}
      </span>
    </div>
  );
}

// Parseo del formato del resumen: secciones "**Encabezado** | texto",
// separadas por líneas en blanco. Si el modelo no siguió el formato, la lista
// sale vacía y el bloque hace fallback al texto crudo.
function parseResumen(texto: string): { encabezado: string; cuerpo: string }[] {
  const re = /\*\*(.+?)\*\*\s*\|\s*([\s\S]*?)(?=\n\s*\*\*|\s*$)/g;
  const out: { encabezado: string; cuerpo: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const cuerpo = m[2].trim().replace(/\s*\n\s*/g, ' ');
    if (cuerpo) out.push({ encabezado: m[1].trim(), cuerpo });
  }
  return out;
}

// Sello de origen IA. Franja compacta en rojo de marca (anclaje institucional,
// no alarma) con un destello que la recorre: deja claro que hay un modelo
// detrás sin depender de un spinner. Presente en todos los estados del bloque.
function SelloIA() {
  return (
    <div
      className="relative flex items-center gap-2 mb-4 px-3 py-2 overflow-hidden"
      style={{ background: 'linear-gradient(100deg, #ec0000 0%, #990000 100%)', borderRadius: 'var(--radius-control)' }}
    >
      <span className="ds-sello__sheen" aria-hidden="true" />
      <svg
        width="13"
        height="13"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        className="relative flex-shrink-0"
        style={{ color: '#fff' }}
      >
        <path d="M10 2.5 11.7 7.3 16.5 9 11.7 10.7 10 15.5 8.3 10.7 3.5 9 8.3 7.3 10 2.5Z" fill="currentColor" />
      </svg>
      <span className="relative text-[11px] leading-snug" style={{ color: '#fff' }}>
        <strong className="font-bold uppercase tracking-[0.06em]">Generado por IA</strong>
        <span style={{ opacity: 0.85 }}> | Asistente de generación de reporte. No involucra cálculos.</span>
      </span>
    </div>
  );
}

// Skeleton mientras se genera el resumen: reproduce el layout editorial real
// (un título corto + líneas de párrafo por bloque) con barrido de shimmer, para
// que se lea inequívocamente como "cargando" y no como contenido estático.
function ResumenSkeleton() {
  const anchoTitulo = [86, 72, 80, 60]; // % del ancho del título placeholder por bloque
  return (
    <div>
      <div className="ds-panel">
        <div className="p-5 sm:p-6">
          {anchoTitulo.map((w, i) => (
            <div key={i} className={i > 0 ? 'mt-5' : ''} aria-hidden="true">
              <div className="ds-skeleton" style={{ height: 13, width: `${w}%`, maxWidth: 240 }} />
              <div className="flex flex-col gap-2 mt-2.5">
                <div className="ds-skeleton" style={{ height: 9, width: '100%' }} />
                <div className="ds-skeleton" style={{ height: 9, width: '95%' }} />
                <div className="ds-skeleton" style={{ height: 9, width: i % 2 ? '54%' : '73%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p
        className="m-0 mt-3 text-[12px]"
        style={{ color: 'var(--doc-ink-500)' }}
        role="status"
        aria-live="polite"
      >
        Generando resumen ejecutivo… unos segundos (llamada a un modelo de IA).
      </p>
    </div>
  );
}

// Síntesis del análisis (IA). Cierra la pantalla, después de toda la evidencia.
// Traduce el análisis determinista a prosa; NO altera ningún número. Estados:
// generando (skeleton) → generado / error (no bloquea nada).
function ResumenEjecutivo({
  resumen,
  resumenEn,
  generando,
  error,
  onGenerar,
}: {
  resumen: string | null;
  resumenEn: string | null;
  generando: boolean;
  error: string | null;
  onGenerar: () => void;
}) {
  const secciones = resumen ? parseResumen(resumen) : [];

  return (
    <section style={{ borderTop: '1px solid var(--doc-rule)', scrollMarginTop: '12px' }}>
      <ZonaHeader nivel="seccion" headingLevel={2}>
        Síntesis del análisis
      </ZonaHeader>
      <div className="px-[var(--pad-x)] pt-4 pb-6">
        <SelloIA />

        {error && (
          <div className="flex flex-col items-start gap-2">
            <p className="m-0 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
              No se pudo generar el resumen; el análisis completo sigue disponible abajo.
            </p>
            <p className="m-0 max-w-[70ch] text-[12px]" style={{ color: 'var(--doc-ink-400)' }}>
              Detalle: {error}
            </p>
            <Button variant="ghost" size="s" onClick={onGenerar}>
              Reintentar
            </Button>
          </div>
        )}

        {generando && <ResumenSkeleton />}

        {!generando && !resumen && !error && (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 max-w-[60ch] text-[13px] leading-relaxed" style={{ color: 'var(--doc-ink-500)' }}>
              Síntesis narrativa del análisis, generada con IA a partir de los resultados.
            </p>
            <Button variant="primary" size="m" onClick={onGenerar}>
              Generar resumen ejecutivo
            </Button>
          </div>
        )}

        {!generando && resumen && (
          /* Un solo recuadro, prosa continua con subtítulos editoriales — no
             sub-secciones con franjas. Se lee como el resumen que es. La fecha
             de generación va como pie del propio recuadro. */
          <div className="ds-panel">
            <div className="p-5 sm:p-6">
              {secciones.length > 0 ? (
                secciones.map((s, i) => (
                  <div key={s.encabezado} className={i > 0 ? 'mt-5' : ''}>
                    <h3 className="m-0 text-[14px] ds-title" style={{ color: 'var(--doc-ink-900)' }}>
                      {s.encabezado}
                    </h3>
                    <p className="m-0 mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--doc-ink-700)' }}>
                      {s.cuerpo}
                    </p>
                  </div>
                ))
              ) : (
                <p
                  className="m-0 text-[13px] leading-relaxed"
                  style={{ color: 'var(--doc-ink-700)', whiteSpace: 'pre-wrap' }}
                >
                  {resumen}
                </p>
              )}
            </div>
            {resumenEn && (
              <div
                className="px-5 sm:px-6 py-2.5 text-[11px]"
                style={{ borderTop: '1px solid var(--doc-rule)', color: 'var(--doc-ink-400)' }}
              >
                Generado el{' '}
                {new Date(resumenEn).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// Envoltorio de sección numerada: la numeración es parte del argumento
// narrativo (dictamen → perfil → materialidad → evidencia → dinero →
// recomendación → acciones), no decoración. Estilo simple a propósito —
// este es el paso de ESTRUCTURA, el acabado visual fino viene después.
function SeccionNumerada({
  numero,
  titulo,
  subtitulo,
  children,
  id,
}: {
  numero: number;
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
  /** Ancla para enlaces internos (p. ej. #evidencia-esg). */
  id?: string;
}) {
  return (
    <section id={id} style={{ borderTop: '1px solid var(--doc-rule)', scrollMarginTop: '12px' }}>
      <ZonaHeader nivel="seccion" numero={numero} headingLevel={2}>
        {titulo}
      </ZonaHeader>
      <div className="px-[var(--pad-x)] pt-4 pb-6">
        {subtitulo && <p className="ds-section-cap">{subtitulo}</p>}
        {children}
      </div>
    </section>
  );
}

// Bloque 3 — Dimensiones materiales en riesgo: cruza (a) materialidad del
// sector (coef_materialidad_tema, lectura pública directa — dato de
// referencia, no de esta evaluación) con (b) el cumplimiento REAL del
// cliente por tema (resultado.detalle, ya trae `tema` por norma vía
// v_riesgo_norma). Solo muestra temas donde el cliente falla algo material:
// nunca lo que cumple, nunca lo no-material (coeficiente 0).
interface MaterialidadTema {
  tema: TemaEsg;
  coeficiente: number;
  banda: string | null;
  en_canal_operativo: boolean;
}

type TipoAtencion = 'incumplimiento' | 'faltante';
type PeorEstatusTema = 'no_cumple' | 'parcial' | 'desconocido';

interface DimensionEnRiesgo {
  tema: TemaEsg;
  banda: string;
  tipo: TipoAtencion;
  peorEstatus: PeorEstatusTema;
}

// Severidad para ordenar: materialidad crítica arriba, y dentro de la misma
// materialidad, incumplimiento confirmado pesa más que información faltante
// (implican acciones distintas: condicionar crédito vs. pedir documentación).
const BANDA_SEVERIDAD: Record<string, number> = { critico: 0, alto: 1, medio: 2, bajo: 3, categorico: 4 };
const ESTATUS_TEMA_SEVERIDAD: Record<PeorEstatusTema, number> = { no_cumple: 0, parcial: 1, desconocido: 2 };

const ESTATUS_TEMA_LABEL: Record<PeorEstatusTema, string> = {
  no_cumple: 'No cumple',
  parcial: 'Parcial',
  desconocido: 'Información faltante',
};

function DimensionesEnRiesgo({ sectorNombre, detalle }: { sectorNombre: string; detalle: DetalleNorma[] }) {
  const [coefs, setCoefs] = useState<MaterialidadTema[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(true);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from('coef_materialidad_tema')
      .select('tema, coeficiente, banda, en_canal_operativo')
      .then(({ data, error: err }) => {
        if (cancelado) return;
        if (err) {
          setError(err.message);
          return;
        }
        setCoefs((data ?? []) as MaterialidadTema[]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const dimensiones = useMemo<DimensionEnRiesgo[] | null>(() => {
    if (!coefs) return null;

    // Peor estatus del cliente por tema, entre todas las normas de esa
    // evaluación que caen en ese tema.
    const estatusPorTema = new Map<TemaEsg, Estatus[]>();
    for (const fila of detalle) {
      if (!estatusPorTema.has(fila.tema)) estatusPorTema.set(fila.tema, []);
      estatusPorTema.get(fila.tema)!.push(fila.estatus);
    }

    const filas: DimensionEnRiesgo[] = [];
    for (const coef of coefs) {
      if (coef.coeficiente <= 0) continue; // no material (ej. requisitos_exportacion)
      const estatuses = estatusPorTema.get(coef.tema);
      if (!estatuses || estatuses.length === 0) continue; // sin normas de este tema en esta evaluación

      let peor: PeorEstatusTema | null = null;
      if (estatuses.includes('no_cumple')) peor = 'no_cumple';
      else if (estatuses.includes('parcial')) peor = 'parcial';
      else if (estatuses.includes('desconocido')) peor = 'desconocido';
      if (!peor) continue; // todas las normas de este tema están en 'cumple'

      filas.push({
        tema: coef.tema,
        banda: coef.banda ?? 'bajo',
        tipo: peor === 'desconocido' ? 'faltante' : 'incumplimiento',
        peorEstatus: peor,
      });
    }

    filas.sort((a, b) => {
      const porBanda = (BANDA_SEVERIDAD[a.banda] ?? 9) - (BANDA_SEVERIDAD[b.banda] ?? 9);
      if (porBanda !== 0) return porBanda;
      if (a.tipo !== b.tipo) return a.tipo === 'incumplimiento' ? -1 : 1;
      return ESTATUS_TEMA_SEVERIDAD[a.peorEstatus] - ESTATUS_TEMA_SEVERIDAD[b.peorEstatus];
    });

    return filas;
  }, [coefs, detalle]);

  return (
    <div className="ds-panel">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full cursor-pointer ds-zone ds-zone--sub"
        style={{ border: 'none', textAlign: 'left' }}
      >
        <span className="ds-zone__label">Materialidad del sector · {sectorNombre}</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className="flex-shrink-0"
          style={{ marginLeft: 'auto', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 160ms ease' }}
        >
          <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {abierto && (
        <div className="flex flex-col">
          <p className="m-0 px-4 pt-3 pb-1 text-[12px]" style={{ color: 'var(--doc-ink-500)' }}>
            Índice de Materialidad ordenado por gravedad.
          </p>
          {error && (
            <p className="m-0 px-4 py-3 text-[13px]" style={{ color: 'var(--state-danger)' }}>
              No se pudo cargar la materialidad del sector: {error}
            </p>
          )}
          {dimensiones === null && !error && (
            <p className="m-0 px-4 py-3 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
              Cargando…
            </p>
          )}
          {dimensiones && dimensiones.length === 0 && (
            <div
              className="flex items-center gap-2.5 mx-4 my-3 px-4 py-3"
              style={{ background: 'var(--ok-bg)', borderRadius: 'var(--radius-control)' }}
            >
              <span className="font-bold" style={{ color: 'var(--ok-fg)' }}>
                ✓
              </span>
              <span className="font-medium text-[13px]" style={{ color: 'var(--ok-fg)' }}>
                Sin dimensiones materiales en riesgo
              </span>
            </div>
          )}
          {dimensiones?.map((d) => {
            const colorBanda = BANDA_TEMA_COLOR[d.banda] ?? 'var(--doc-ink-500)';
            const esFaltante = d.tipo === 'faltante';
            const colorEstado = esFaltante ? 'var(--warn-fg)' : 'var(--state-danger)';
            const bgEstado = esFaltante ? 'var(--warn-bg)' : 'var(--red-100)';
            return (
              <div
                key={d.tema}
                className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                style={{ borderTop: '1px solid var(--doc-rule)' }}
              >
                <span className="flex-1 font-medium text-[13px]" style={{ color: 'var(--doc-ink-900)' }}>
                  {TEMA_LABEL[d.tema] ?? d.tema}
                </span>
                <span
                  className="inline-flex flex-shrink-0 items-center gap-1.5 px-2 py-0.5 font-semibold text-[11px] uppercase tracking-[0.03em]"
                  style={{ background: `${colorBanda}1F`, color: colorBanda, borderRadius: 3 }}
                >
                  <span className="w-1 h-3" style={{ background: colorBanda }} aria-hidden="true" />
                  {BANDA_TEMA_LABEL[d.banda] ?? d.banda}
                </span>
                <span
                  className="flex-shrink-0 px-2 py-0.5 font-semibold text-[11px] uppercase tracking-[0.03em]"
                  style={{ background: bgEstado, color: colorEstado, borderRadius: 3 }}
                >
                  {ESTATUS_TEMA_LABEL[d.peorEstatus]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
