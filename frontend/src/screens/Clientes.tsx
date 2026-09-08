import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { obtenerEvaluacionParaEditar } from '../lib/obtenerEvaluacionParaEditar';
import { eliminarEvaluacion } from '../lib/eliminarEvaluacion';
import { buscarCliente, type ClienteEncontrado } from '../lib/buscarCliente';
import type { ActividadProhibida, ClienteInput, EvaluacionParaEditar, EvaluacionSesion, Jurisdiccion, PerfilTamano, Sector, SubsectorAgro } from '../types';
import { AlertIcon } from '../components/ScoreCard';
import { SantanderLogo } from '../components/SantanderLogo';
import { BANDA_COLOR, BANDA_RANGO, normasEnRegla, peorBandaGeneral } from '../lib/banda';
import { Button } from '../components/ds/Button';
import { Input } from '../components/ds/Input';
import { Select } from '../components/ds/Select';
import { Switch } from '../components/ds/Switch';

const PERFILES: { value: PerfilTamano; label: string; desc: string }[] = [
  { value: 'pyme', label: 'PyME', desc: 'Hasta 250 empleados' },
  { value: 'mediana', label: 'Mediana empresa', desc: '251–1,000 empleados' },
  { value: 'cotiza_bolsa', label: 'Cotiza en bolsa', desc: 'Sujeta a divulgación pública' },
  { value: 'multinacional', label: 'Multinacional', desc: 'Operación en múltiples países' },
];

// Subsector agropecuario: selecciona el perfil financiero FIRA (subsector × tamaño).
const SUBSECTORES: { value: SubsectorAgro; label: string }[] = [
  { value: 'ganaderia', label: 'Ganadería' },
  { value: 'agricultura', label: 'Agricultura' },
];

type BorrarEstado =
  | { tipo: 'idle' }
  | { tipo: 'confirmando'; evaluacionId: string; nombre: string }
  | { tipo: 'eliminando'; evaluacionId: string; nombre: string }
  | { tipo: 'error'; evaluacionId: string; nombre: string; mensaje: string };

interface ClientesProps {
  evaluaciones: EvaluacionSesion[];
  cargando: boolean;
  error: string | null;
  mostrarForm: boolean;
  onMostrarFormChange: (mostrar: boolean) => void;
  onNuevaEvaluacion: (cliente: ClienteInput, sectorNombre: string, jurisdiccionNombre: string) => void;
  onRegistrarNoEvaluable: (cliente: ClienteInput, sectorNombre: string, jurisdiccionNombre: string) => Promise<void>;
  onVerEvaluacion: (evaluacion: EvaluacionSesion) => void;
  onEditarEvaluacion: (datos: EvaluacionParaEditar) => void;
  onEvaluacionEliminada: (evaluacionId: string) => void;
}

export function Clientes({
  evaluaciones,
  cargando,
  error,
  mostrarForm,
  onMostrarFormChange,
  onNuevaEvaluacion,
  onRegistrarNoEvaluable,
  onVerEvaluacion,
  onEditarEvaluacion,
  onEvaluacionEliminada,
}: ClientesProps) {
  const [sectores, setSectores] = useState<Sector[]>([]);
  const [jurisdicciones, setJurisdicciones] = useState<Jurisdiccion[]>([]);
  const [actividadesProhibidas, setActividadesProhibidas] = useState<ActividadProhibida[]>([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);
  const [errorCatalogos, setErrorCatalogos] = useState<string | null>(null);

  const [numeroCliente, setNumeroCliente] = useState('');
  const [clienteVinculado, setClienteVinculado] = useState<ClienteEncontrado | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  // true cuando ya se corrió un lookup para el número actual (obliga a confirmar
  // visualmente el cliente antes de continuar).
  const [busquedaHecha, setBusquedaHecha] = useState(false);

  const [nombre, setNombre] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [jurisdiccionId, setJurisdiccionId] = useState('');
  const [perfilTamano, setPerfilTamano] = useState<PerfilTamano>('pyme');
  const [subsector, setSubsector] = useState<SubsectorAgro>('ganaderia');
  const [esExportador, setEsExportador] = useState(false);
  const [enZonaRiesgo, setEnZonaRiesgo] = useState(false);
  const [zonaRiesgoNota, setZonaRiesgoNota] = useState('');
  const [participaProhibida, setParticipaProhibida] = useState(false);
  const [actividadProhibidaId, setActividadProhibidaId] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [errorEdicion, setErrorEdicion] = useState<{ id: string; mensaje: string } | null>(null);
  const [borrado, setBorrado] = useState<BorrarEstado>({ tipo: 'idle' });
  // Cartera agrupada: los grupos están REPLEGADOS por defecto; este set guarda
  // los que el usuario expandió.
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const bloqueado = clienteVinculado !== null;

  // Cartera: una fila por cliente (cliente_id), con su historial de evaluaciones.
  const clientesAgrupados = useMemo(() => {
    const map = new Map<
      string,
      { clienteId: string; cliente: EvaluacionSesion['cliente']; sectorNombre: string; jurisdiccionNombre: string; evals: EvaluacionSesion[] }
    >();
    for (const ev of evaluaciones) {
      const key = ev.resultado.cliente_id;
      let g = map.get(key);
      if (!g) {
        g = { clienteId: key, cliente: ev.cliente, sectorNombre: ev.sectorNombre, jurisdiccionNombre: ev.jurisdiccionNombre, evals: [] };
        map.set(key, g);
      }
      g.evals.push(ev);
    }
    const grupos = [...map.values()];
    for (const g of grupos) g.evals.sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha));
    grupos.sort((a, b) => +new Date(b.evals[0].fecha) - +new Date(a.evals[0].fecha));
    return grupos;
  }, [evaluaciones]);

  function toggleExpandir(clienteId: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(clienteId)) next.delete(clienteId);
      else next.add(clienteId);
      return next;
    });
  }

  function handleNumeroChange(v: string) {
    setNumeroCliente(v);
    // Cualquier cambio invalida el lookup previo.
    if (clienteVinculado || busquedaHecha || errorBusqueda) {
      setClienteVinculado(null);
      setBusquedaHecha(false);
      setErrorBusqueda(null);
    }
  }

  async function handleBuscar() {
    const num = numeroCliente.trim();
    if (!num) return;
    setBuscando(true);
    setErrorBusqueda(null);
    try {
      const r = await buscarCliente(num);
      if (r.existe) {
        setClienteVinculado(r.cliente);
        // Precargar los campos: el registro guardado manda.
        setNombre(r.cliente.nombre);
        setSectorId(r.cliente.sector_id);
        setJurisdiccionId(r.cliente.jurisdiccion_id);
        setPerfilTamano(r.cliente.perfil_tamano);
        setSubsector(r.cliente.subsector);
        setEsExportador(r.cliente.es_exportador);
        setEnZonaRiesgo(r.cliente.en_zona_riesgo);
        setZonaRiesgoNota(r.cliente.zona_riesgo_nota ?? '');
        setParticipaProhibida(r.cliente.actividad_prohibida_id != null);
        setActividadProhibidaId(r.cliente.actividad_prohibida_id ?? '');
      } else {
        setClienteVinculado(null);
        setParticipaProhibida(false);
        setActividadProhibidaId('');
      }
      setErrorRegistro(null);
      setBusquedaHecha(true);
    } catch (e) {
      setErrorBusqueda(e instanceof Error ? e.message : 'No se pudo buscar el cliente.');
    } finally {
      setBuscando(false);
    }
  }

  // Camino rápido: "Nueva evaluación" desde la tarjeta de un cliente ya existente.
  function nuevaEvalParaCliente(numero: string) {
    setNumeroCliente(numero);
    setClienteVinculado(null);
    setBusquedaHecha(false);
    setErrorBusqueda(null);
    setParticipaProhibida(false);
    setActividadProhibidaId('');
    setErrorRegistro(null);
    onMostrarFormChange(true);
  }

  async function handleEditar(ev: EvaluacionSesion) {
    setErrorEdicion(null);
    setEditandoId(ev.id);
    try {
      const datos = await obtenerEvaluacionParaEditar(ev.id);
      onEditarEvaluacion(datos);
    } catch (e) {
      setErrorEdicion({ id: ev.id, mensaje: e instanceof Error ? e.message : 'No se pudo cargar la evaluación.' });
      setEditandoId(null);
    }
  }

  async function handleConfirmarBorrar(evaluacionId: string, nombreCliente: string) {
    setBorrado({ tipo: 'eliminando', evaluacionId, nombre: nombreCliente });
    try {
      await eliminarEvaluacion(evaluacionId);
      onEvaluacionEliminada(evaluacionId);
      setBorrado({ tipo: 'idle' });
    } catch (e) {
      setBorrado({
        tipo: 'error',
        evaluacionId,
        nombre: nombreCliente,
        mensaje: e instanceof Error ? e.message : 'No se pudo eliminar la evaluación.',
      });
    }
  }

  useEffect(() => {
    if (!mostrarForm) return;
    let cancelado = false;

    async function cargar() {
      setCargandoCatalogos(true);
      setErrorCatalogos(null);
      // Solo estados (nivel='estatal'): federal/internacional ya no se eligen
      // acá, aplican automáticamente vía las 3 capas de normas_aplicables.
      const [
        { data: sectoresData, error: eSec },
        { data: jurisdiccionesData, error: eJur },
        { data: actividadesData, error: eAct },
      ] = await Promise.all([
        supabase.from('sectores').select('id, clave, nombre').order('nombre'),
        supabase
          .from('jurisdicciones')
          .select('id, clave, nombre, nivel, contexto_riesgo')
          .eq('nivel', 'estatal')
          .order('nombre'),
        supabase
          .from('actividades_prohibidas')
          .select('id, clave, etiqueta, clausula_politica, descripcion')
          .eq('activa', true)
          .order('orden'),
      ]);
      if (cancelado) return;
      if (eSec || eJur || eAct) {
        setErrorCatalogos('No se pudieron cargar los catálogos de sector/jurisdicción.');
      } else {
        setSectores(sectoresData ?? []);
        setJurisdicciones(jurisdiccionesData ?? []);
        setActividadesProhibidas(actividadesData ?? []);
        setSectorId((prev) => prev || sectoresData?.[0]?.id || '');
        setJurisdiccionId((prev) => prev || jurisdiccionesData?.[0]?.id || '');
      }
      setCargandoCatalogos(false);
    }
    cargar();

    return () => {
      cancelado = true;
    };
  }, [mostrarForm]);

  // Actividad prohibida: bloqueada (solo lectura) si el cliente vinculado ya
  // viene marcado; el analista puede añadirla a un cliente sin marcar.
  const prohibidaBloqueada = bloqueado && clienteVinculado?.actividad_prohibida_id != null;
  const esNoEvaluable = participaProhibida && actividadProhibidaId.length > 0;
  const actividadProhibidaLabel = esNoEvaluable
    ? actividadesProhibidas.find((a) => a.id === actividadProhibidaId)?.etiqueta ?? null
    : null;

  const puedeContinuar =
    numeroCliente.trim().length > 0 &&
    busquedaHecha &&
    (bloqueado ? true : nombre.trim().length > 0 && sectorId && jurisdiccionId) &&
    (!participaProhibida || actividadProhibidaId.length > 0);

  function construirClienteInput(): { cliente: ClienteInput; sectorNombre: string; jurisdiccionNombre: string } {
    const c = clienteVinculado;
    const sectorNombre = c ? c.sectorNombre : sectores.find((s) => s.id === sectorId)?.nombre ?? '';
    const jurisdiccionNombre = c ? c.jurisdiccionNombre : jurisdicciones.find((j) => j.id === jurisdiccionId)?.nombre ?? '';
    return {
      cliente: {
        numero_cliente: numeroCliente.trim(),
        cliente_id: c?.id ?? null,
        nombre: (c?.nombre ?? nombre).trim(),
        sector_id: c?.sector_id ?? sectorId,
        jurisdiccion_id: c?.jurisdiccion_id ?? jurisdiccionId,
        perfil_tamano: c?.perfil_tamano ?? perfilTamano,
        subsector: c?.subsector ?? subsector,
        es_exportador: c?.es_exportador ?? esExportador,
        en_zona_riesgo: c?.en_zona_riesgo ?? enZonaRiesgo,
        zona_riesgo_nota: c
          ? c.zona_riesgo_nota
          : enZonaRiesgo && zonaRiesgoNota.trim() ? zonaRiesgoNota.trim() : null,
        actividad_prohibida_id: esNoEvaluable ? actividadProhibidaId : null,
      },
      sectorNombre,
      jurisdiccionNombre,
    };
  }

  async function handleContinuar() {
    if (!puedeContinuar || registrando) return;
    const { cliente, sectorNombre, jurisdiccionNombre } = construirClienteInput();
    if (esNoEvaluable) {
      setRegistrando(true);
      setErrorRegistro(null);
      try {
        await onRegistrarNoEvaluable(cliente, sectorNombre, jurisdiccionNombre);
      } catch (e) {
        setErrorRegistro(e instanceof Error ? e.message : 'No se pudo registrar el cliente como no evaluable.');
        setRegistrando(false);
      }
      return;
    }
    onNuevaEvaluacion(cliente, sectorNombre, jurisdiccionNombre);
  }

  return (
    <div className="resultados-root flex min-h-full flex-col" style={{ background: 'var(--doc-paper-sunk)' }}>
      <div className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ds-eyebrow">Cartera</div>
            <h1 className="ds-title m-0 mt-1" style={{ fontSize: 'var(--title-page)', color: 'var(--doc-ink-900)' }}>
              Clientes
            </h1>
            <p className="m-0 mt-1.5 text-[14px]" style={{ color: 'var(--doc-ink-500)' }}>
              Evaluaciones de riesgo regulatorio ESG por cliente.
            </p>
          </div>
          {!mostrarForm && (
            <Button variant="primary" size="m" onClick={() => onMostrarFormChange(true)}>
              Nueva evaluación
            </Button>
          )}
        </div>

        {mostrarForm ? (
          <div className="ds-panel ds-rise mt-6 flex flex-col gap-8 p-6 sm:p-8">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-4">
                <div className="ds-eyebrow">Nueva evaluación</div>
                {evaluaciones.length > 0 && (
                  <button type="button" onClick={() => onMostrarFormChange(false)} className="ds-link bg-transparent p-0 text-[13px]">
                    Cancelar
                  </button>
                )}
              </div>
              <p className="m-0 mt-1 text-[14px] leading-normal" style={{ color: 'var(--doc-ink-500)' }}>
                Responde estos datos para generar el cuestionario adecuado a tu cliente. Toma menos de un minuto.
              </p>
            </div>

            {errorCatalogos && (
              <p
                className="m-0 px-3 py-2 text-[13px]"
                style={{ color: 'var(--red-700)', background: 'var(--red-100)', borderRadius: 'var(--radius-control)' }}
              >
                {errorCatalogos}
              </p>
            )}

            <FormSection step={1} titulo="¿Quién es el cliente?">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <Input
                      id="numero-cliente"
                      label="Número de cliente"
                      value={numeroCliente}
                      onChange={handleNumeroChange}
                      placeholder="Ej. 10482355"
                    />
                  </div>
                  <Button variant="secondary" size="m" disabled={!numeroCliente.trim() || buscando} onClick={handleBuscar}>
                    {buscando ? 'Buscando…' : 'Buscar'}
                  </Button>
                </div>

                {errorBusqueda && (
                  <p className="m-0 text-[13px]" style={{ color: 'var(--state-danger)' }}>
                    {errorBusqueda}
                  </p>
                )}

                {clienteVinculado && (
                  <div
                    className="px-4 py-3 text-[13px] leading-normal"
                    style={{ background: 'var(--ctx-100)', borderRadius: 'var(--radius-control)', color: 'var(--doc-ink-900)' }}
                  >
                    Cliente <strong className="font-semibold">{numeroCliente.trim()}</strong>:{' '}
                    <strong className="font-semibold">{clienteVinculado.nombre}</strong> · {clienteVinculado.sectorNombre} ·{' '}
                    {clienteVinculado.jurisdiccionNombre}.
                    <br />
                    Se añadirá una nueva evaluación a este cliente. Sus datos registrados no se modifican aquí.
                  </div>
                )}

                {busquedaHecha && !clienteVinculado && !errorBusqueda && (
                  <p className="m-0 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
                    No hay un cliente con ese número. Se registrará como cliente nuevo.
                  </p>
                )}

                {!bloqueado && (
                  <Input
                    id="nombre"
                    label="Nombre del cliente"
                    value={nombre}
                    onChange={setNombre}
                    placeholder="Agropecuaria del Bajío S.A. de C.V."
                  />
                )}
              </div>
            </FormSection>

            <Divider />

            <FormSection step={2} titulo="Elegibilidad">
              <div className="flex flex-col gap-4">
                <div
                  className="flex flex-col gap-4 px-5 py-4"
                  style={{ background: 'var(--ctx-100)', borderRadius: 'var(--radius-control)' }}
                >
                  <div className="flex items-center justify-between gap-5">
                    <div className="flex flex-col gap-1">
                      <span className="text-[14px] font-semibold" style={{ color: 'var(--doc-ink-900)' }}>
                        ¿El cliente participa en alguna actividad prohibida por la política ESG de Santander?
                      </span>
                      <span className="text-[13px] leading-tight" style={{ color: 'var(--doc-ink-500)' }}>
                        Actividades vetadas por la política de Riesgos Medioambientales, Sociales y de Cambio Climático. Si
                        aplica, el cliente es no evaluable: no se aplica el cuestionario de normas.
                      </span>
                    </div>
                    <Switch
                      checked={participaProhibida}
                      onChange={(v) => {
                        setParticipaProhibida(v);
                        if (!v) setActividadProhibidaId('');
                      }}
                      disabled={prohibidaBloqueada}
                    />
                  </div>
                  {participaProhibida && (
                    <Select
                      id="actividad-prohibida"
                      label="Actividad prohibida"
                      value={actividadProhibidaId}
                      onChange={setActividadProhibidaId}
                      disabled={cargandoCatalogos || prohibidaBloqueada}
                      options={[
                        { value: '', label: 'Selecciona una actividad…' },
                        ...actividadesProhibidas.map((a) => ({ value: a.id, label: a.etiqueta })),
                      ]}
                    />
                  )}
                </div>

                {esNoEvaluable && (
                  <div
                    className="flex items-start gap-2.5 px-4 py-3 text-[13px] leading-normal"
                    style={{ background: 'var(--red-100)', color: 'var(--red-800)', borderRadius: 'var(--radius-control)' }}
                  >
                    <AlertIcon color="var(--red-700)" />
                    <span>
                      Este cliente quedará registrado como <strong className="font-semibold">NO EVALUABLE</strong> por
                      actividad prohibida. No se aplica el cuestionario de normas, score ni simulador.
                    </span>
                  </div>
                )}
              </div>
            </FormSection>

            <Divider />

            {bloqueado ? (
              <FormSection step={3} titulo="Perfil registrado del cliente">
                <ResumenClienteVinculado cliente={clienteVinculado} actividad={actividadProhibidaLabel} />
              </FormSection>
            ) : (
              <>
                <FormSection step={3} titulo="¿Dónde opera?">
                  <div className="flex flex-col gap-5">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <Select
                        id="sector"
                        label="Sector"
                        value={sectorId}
                        onChange={setSectorId}
                        disabled={cargandoCatalogos}
                        options={sectores.map((s) => ({ value: s.id, label: s.nombre }))}
                      />
                      {/* Solo el estado: federal/internacional aplican automáticamente,
                          no se eligen acá (ver normas_aplicables, 3 capas). */}
                      <Select
                        id="jurisdiccion"
                        label="Estado de operación"
                        value={jurisdiccionId}
                        onChange={setJurisdiccionId}
                        disabled={cargandoCatalogos}
                        options={jurisdicciones.map((j) => ({ value: j.id, label: j.nombre }))}
                      />
                      {/* Subsector agropecuario: define el perfil financiero FIRA (subsector × tamaño). */}
                      <Select
                        id="subsector"
                        label="Subsector"
                        value={subsector}
                        onChange={(v) => setSubsector(v as SubsectorAgro)}
                        disabled={cargandoCatalogos}
                        options={SUBSECTORES}
                      />
                    </div>

                    <div
                      className="flex flex-col gap-4 px-5 py-4"
                      style={{ background: 'var(--ctx-100)', borderRadius: 'var(--radius-control)' }}
                    >
                      <div className="flex items-center justify-between gap-5">
                        <div className="flex flex-col gap-1">
                          <span className="text-[14px] font-semibold" style={{ color: 'var(--doc-ink-900)' }}>
                            ¿El activo del cliente está en/cerca de una zona sensible o restringida?
                          </span>
                          <span className="text-[13px] leading-tight" style={{ color: 'var(--doc-ink-500)' }}>
                            Por ejemplo, un área natural protegida (ANP) o una veda. Es contexto para el analista, no afecta el score.
                          </span>
                        </div>
                        <Switch checked={enZonaRiesgo} onChange={setEnZonaRiesgo} />
                      </div>
                      {enZonaRiesgo && (
                        <Input
                          id="zona-riesgo-nota"
                          label="¿Cuál zona? (opcional)"
                          placeholder="Ej. Colindante con la Reserva de la Biósfera Pantanos de Centla"
                          value={zonaRiesgoNota}
                          onChange={setZonaRiesgoNota}
                        />
                      )}
                    </div>
                  </div>
                </FormSection>

                <Divider />

                <FormSection step={4} titulo="Tamaño y alcance">
                  <div className="flex flex-col gap-5">
                    <div>
                      <p className="ds-eyebrow m-0 mb-3">Perfil de tamaño</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {PERFILES.map((p) => {
                          const isSelected = p.value === perfilTamano;
                          return (
                            <button
                              key={p.value}
                              type="button"
                              onClick={() => setPerfilTamano(p.value)}
                              className="cursor-pointer px-4 py-3.5 text-left"
                              style={{
                                borderRadius: 'var(--radius-control)',
                                border: isSelected ? '2px solid var(--doc-ink-900)' : '1px solid var(--doc-rule)',
                                background: isSelected ? 'var(--doc-paper-tint)' : 'var(--doc-paper)',
                                color: 'var(--doc-ink-900)',
                                transition: 'background 160ms ease, border-color 160ms ease',
                              }}
                            >
                              <span className="block text-[14px] font-semibold">{p.label}</span>
                              <span className="mt-1 block text-[12px] font-normal" style={{ color: 'var(--doc-ink-500)' }}>
                                {p.desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-between gap-5 px-5 py-4"
                      style={{ background: 'var(--ctx-100)', borderRadius: 'var(--radius-control)' }}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-[14px] font-semibold" style={{ color: 'var(--doc-ink-900)' }}>
                          ¿Exporta a la UE?
                        </span>
                        <span className="text-[13px] leading-tight" style={{ color: 'var(--doc-ink-500)' }}>
                          Activa normativa adicional de debida diligencia y trazabilidad.
                        </span>
                      </div>
                      <Switch checked={esExportador} onChange={setEsExportador} />
                    </div>
                  </div>
                </FormSection>
              </>
            )}

            {errorRegistro && (
              <p
                className="m-0 px-3 py-2 text-[13px]"
                style={{ color: 'var(--red-700)', background: 'var(--red-100)', borderRadius: 'var(--radius-control)' }}
              >
                {errorRegistro}
              </p>
            )}

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="l"
                disabled={!puedeContinuar || registrando || (!bloqueado && cargandoCatalogos)}
                onClick={handleContinuar}
              >
                {esNoEvaluable
                  ? registrando
                    ? 'Registrando…'
                    : 'Registrar como no evaluable'
                  : 'Continuar al cuestionario'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {cargando &&
              [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse"
                  style={{ background: 'var(--doc-rule)', borderRadius: 'var(--radius-panel)' }}
                />
              ))}

            {!cargando && error && (
              <p
                className="m-0 px-3 py-2 text-[13px]"
                style={{ color: 'var(--red-700)', background: 'var(--red-100)', borderRadius: 'var(--radius-control)' }}
              >
                {error}
              </p>
            )}

            {!cargando && !error && evaluaciones.length === 0 && (
              <div className="ds-panel ds-rise flex flex-col items-start gap-3 p-8">
                <p className="m-0 text-[14px]" style={{ color: 'var(--doc-ink-500)' }}>
                  Aún no hay evaluaciones registradas.
                </p>
                <Button variant="primary" size="m" onClick={() => onMostrarFormChange(true)}>
                  Nueva evaluación
                </Button>
              </div>
            )}

            {!cargando &&
              !error &&
              clientesAgrupados.map((g) => {
                const ultima = g.evals[0];
                const abierto = expandidos.has(g.clienteId);
                return (
                  <div key={g.clienteId} className="ds-panel ds-rise">
                    <div className="flex flex-wrap items-center justify-between gap-4 px-[var(--pad-x)] py-4">
                      <button
                        type="button"
                        onClick={() => toggleExpandir(g.clienteId)}
                        aria-expanded={abierto}
                        className="min-w-0 flex-1 cursor-pointer bg-transparent p-0 text-left"
                      >
                        <p className="ds-title m-0 flex items-center gap-2 text-[16px]" style={{ color: 'var(--doc-ink-900)' }}>
                          <Chevron abierto={abierto} />
                          {g.cliente.nombre}
                        </p>
                        <p className="m-0 mt-0.5 pl-6 text-[13px]" style={{ color: 'var(--doc-ink-500)' }}>
                          Cliente {g.cliente.numero_cliente || '—'} · {g.sectorNombre} · {g.jurisdiccionNombre} ·{' '}
                          {g.evals.length} {g.evals.length === 1 ? 'evaluación' : 'evaluaciones'}
                        </p>
                      </button>

                      <div className="flex items-center gap-5">
                        <ResumenEvalMini resultado={ultima.resultado} anterior={g.evals[1]?.resultado} />
                        <Button variant="ghost" size="s" onClick={() => nuevaEvalParaCliente(g.cliente.numero_cliente)}>
                          Nueva evaluación
                        </Button>
                      </div>
                    </div>

                    {abierto && (
                      <div style={{ borderTop: '1px solid var(--doc-rule)' }}>
                        {g.evals.map((ev) => {
                          const cerrada = ev.resultado.estado === 'cerrada';
                          const editable = !cerrada && !ev.resultado.no_evaluable;
                          const confirmandoEsta = borrado.tipo !== 'idle' && borrado.evaluacionId === ev.id;
                          return (
                            <div key={ev.id} style={{ borderTop: '1px solid var(--doc-rule)' }}>
                              <div className="flex flex-wrap items-center justify-between gap-4 px-[var(--pad-x)] py-3.5">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <p className="m-0 text-[14px] font-semibold" style={{ color: 'var(--doc-ink-900)' }}>
                                      {formatFecha(ev.fecha)}
                                      {cerrada && (
                                        <span className="ml-2 text-[11px] font-medium" style={{ color: 'var(--doc-ink-400)' }}>
                                          · cerrada
                                        </span>
                                      )}
                                    </p>
                                    <Button variant="ghost" size="s" onClick={() => onVerEvaluacion(ev)}>
                                      Ver evaluación
                                    </Button>
                                  </div>
                                  {errorEdicion?.id === ev.id && (
                                    <p className="m-0 mt-1.5 text-[12px]" style={{ color: 'var(--state-danger)' }}>
                                      {errorEdicion.mensaje}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-5">
                                  <ResumenEvalMini resultado={ev.resultado} />

                                  {!cerrada && (
                                    <div className="flex items-center gap-1">
                                      {editable && (
                                        <button
                                          type="button"
                                          aria-label="Editar evaluación"
                                          disabled={editandoId === ev.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditar(ev);
                                          }}
                                          className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-50"
                                          style={{ color: 'var(--doc-ink-500)' }}
                                        >
                                          {editandoId === ev.id ? <SpinnerIcon /> : <PencilIcon />}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        aria-label="Eliminar evaluación"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setBorrado({ tipo: 'confirmando', evaluacionId: ev.id, nombre: ev.cliente.nombre });
                                        }}
                                        className="flex h-8 w-8 items-center justify-center rounded-full"
                                        style={{ color: 'var(--doc-ink-500)' }}
                                      >
                                        <TrashIcon />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {confirmandoEsta && (
                                <div
                                  className="flex items-start gap-2.5 px-[var(--pad-x)] py-3.5 text-[13px]"
                                  style={{ background: 'var(--red-100)', color: 'var(--red-700)', borderTop: '1px solid var(--doc-rule)' }}
                                >
                                  <AlertIcon color="var(--red-700)" />
                                  <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
                                    <span>
                                      {borrado.tipo === 'error' ? (
                                        borrado.mensaje
                                      ) : (
                                        <>
                                          Se eliminará permanentemente la evaluación de{' '}
                                          <strong className="font-semibold">"{borrado.nombre}"</strong> del{' '}
                                          {formatFecha(ev.fecha)}. Esta acción no se puede deshacer.
                                        </>
                                      )}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <Button variant="ghost" size="s" onClick={() => setBorrado({ tipo: 'idle' })}>
                                        Cancelar
                                      </Button>
                                      <Button
                                        variant="primary"
                                        size="s"
                                        disabled={borrado.tipo === 'eliminando'}
                                        onClick={() => handleConfirmarBorrar(ev.id, ev.cliente.nombre)}
                                      >
                                        {borrado.tipo === 'eliminando' ? 'Eliminando…' : 'Eliminar'}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
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

function FormSection({ step, titulo, children }: { step: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className="ds-figure flex h-7 w-7 flex-shrink-0 items-center justify-center text-[13px]"
          style={{ borderRadius: 999, background: 'var(--doc-ink-900)', color: 'var(--doc-paper)' }}
        >
          {step}
        </span>
        <h2 className="ds-title m-0 text-[16px]" style={{ color: 'var(--doc-ink-900)' }}>
          {titulo}
        </h2>
      </div>
      <div className="pl-10">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="h-px" style={{ background: 'var(--doc-rule)' }} />;
}

// Perfil de solo lectura del cliente vinculado: sus datos registrados mandan, no
// se editan al añadir una evaluación.
function ResumenClienteVinculado({ cliente, actividad }: { cliente: ClienteEncontrado; actividad?: string | null }) {
  const filas: [string, string][] = [
    ['Sector', cliente.sectorNombre || '—'],
    ['Estado de operación', cliente.jurisdiccionNombre || '—'],
    ['Subsector', SUBSECTORES.find((s) => s.value === cliente.subsector)?.label ?? cliente.subsector],
    ['Perfil de tamaño', PERFILES.find((p) => p.value === cliente.perfil_tamano)?.label ?? cliente.perfil_tamano],
    ['Exporta a la UE', cliente.es_exportador ? 'Sí' : 'No'],
    ['Zona sensible', cliente.en_zona_riesgo ? cliente.zona_riesgo_nota?.trim() || 'Sí' : 'No'],
    ...(actividad ? ([['Actividad prohibida', actividad]] as [string, string][]) : []),
  ];
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
      {filas.map(([label, valor]) => (
        <div key={label} className="flex flex-col gap-1">
          <dt className="ds-eyebrow">{label}</dt>
          <dd className="m-0 text-[14px] font-medium" style={{ color: 'var(--doc-ink-900)' }}>
            {valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 160ms ease', color: 'var(--doc-ink-500)' }}
    >
      <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Resumen de una evaluación para la card: nivel de riesgo ESG general + conteo
// de normas en regla, igual que la sección 1 de Resultados. Si se pasa la
// evaluación `anterior` y algo cambió, muestra una línea "vs. anterior" con la
// evolución (rojo si empeoró, verde si mejoró).
function ResumenEvalMini({
  resultado,
  anterior,
}: {
  resultado: EvaluacionSesion['resultado'];
  anterior?: EvaluacionSesion['resultado'];
}) {
  if (resultado.no_evaluable) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="ds-eyebrow" style={{ fontSize: '0.5625rem' }}>
          Elegibilidad
        </span>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 font-semibold text-[11px] uppercase tracking-[0.03em]"
          style={{ background: 'var(--red-100)', color: 'var(--red-700)', borderRadius: 3 }}
        >
          No evaluable
        </span>
      </div>
    );
  }

  const bandaGlobal = peorBandaGeneral(resultado);
  const total = resultado.detalle.length;
  const enRegla = normasEnRegla(resultado);
  const colorBanda = BANDA_COLOR[bandaGlobal];

  const bandaAnt = anterior ? peorBandaGeneral(anterior) : null;
  const dBanda = bandaAnt ? BANDA_RANGO[bandaGlobal] - BANDA_RANGO[bandaAnt] : 0; // >0 empeoró
  const enReglaAnt = anterior ? normasEnRegla(anterior) : 0;
  const dNormas = anterior ? enRegla - enReglaAnt : 0; // >0 mejoró (más normas en regla)
  const hayCambio = Boolean(anterior) && (dBanda !== 0 || dNormas !== 0);

  return (
    <div className="flex flex-col items-end gap-1.5">
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

      {hayCambio && (
        <div className="flex flex-wrap items-center justify-end gap-x-2 text-[11px]">
          <span className="ds-eyebrow" style={{ fontSize: '0.5625rem' }}>
            vs. anterior
          </span>
          {dBanda !== 0 && (
            <span style={{ color: dBanda > 0 ? 'var(--risk-alto)' : 'var(--ok-fg)' }}>
              {bandaAnt} → {bandaGlobal}
            </span>
          )}
          {dNormas !== 0 && (
            <span className="tabular-nums font-semibold" style={{ color: dNormas > 0 ? 'var(--ok-fg)' : 'var(--risk-alto)' }}>
              {dNormas > 0 ? `+${dNormas}` : dNormas} {Math.abs(dNormas) === 1 ? 'norma' : 'normas'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
