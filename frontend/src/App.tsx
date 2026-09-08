import { useEffect, useState } from 'react';
import { Sidebar, type Seccion } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { Inicio } from './screens/Inicio';
import { Clientes } from './screens/Clientes';
import { Cuestionario } from './screens/Cuestionario';
import { Resultados } from './screens/Resultados';
import { NoEvaluable } from './screens/NoEvaluable';
import { listarEvaluaciones } from './lib/listarEvaluaciones';
import { evaluar } from './lib/evaluar';
import type { ClienteInput, EvaluacionParaEditar, EvaluacionSesion, ResultadoEvaluacion } from './types';

type Pantalla = Seccion | 'cuestionario' | 'resultados';

interface ClienteEnCurso {
  cliente: ClienteInput;
  sectorNombre: string;
  jurisdiccionNombre: string;
}

function App() {
  const [pantalla, setPantalla] = useState<Pantalla>('inicio');
  const [evaluaciones, setEvaluaciones] = useState<EvaluacionSesion[]>([]);
  const [cargandoEvaluaciones, setCargandoEvaluaciones] = useState(true);
  const [errorEvaluaciones, setErrorEvaluaciones] = useState<string | null>(null);
  const [clienteEnCurso, setClienteEnCurso] = useState<ClienteEnCurso | null>(null);
  const [resultadoActivo, setResultadoActivo] = useState<ResultadoEvaluacion | null>(null);
  const [evaluacionEnEdicion, setEvaluacionEnEdicion] = useState<EvaluacionParaEditar | null>(null);
  const [mostrarFormCliente, setMostrarFormCliente] = useState(true);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pantalla]);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      try {
        const data = await listarEvaluaciones();
        if (cancelado) return;
        setEvaluaciones(data);
        setMostrarFormCliente(data.length === 0);
      } catch (e) {
        if (cancelado) return;
        setErrorEvaluaciones(e instanceof Error ? e.message : 'No se pudieron cargar las evaluaciones.');
      } finally {
        if (!cancelado) setCargandoEvaluaciones(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, []);

  function irACartera(abrirFormulario: boolean) {
    setPantalla('cartera');
    setMostrarFormCliente(abrirFormulario);
  }

  function handleNuevaEvaluacionClick() {
    irACartera(true);
  }

  function handleNuevaEvaluacion(cliente: ClienteInput, sectorNombre: string, jurisdiccionNombre: string) {
    setClienteEnCurso({ cliente, sectorNombre, jurisdiccionNombre });
    setResultadoActivo(null);
    setPantalla('cuestionario');
  }

  // Cliente NO EVALUABLE por actividad prohibida: se registra la evaluación
  // (estado 'no_evaluable', sin respuestas) y se salta directo al resultado.
  // Lanza si la edge function falla; `Clientes.tsx` muestra el error.
  async function handleRegistrarNoEvaluable(cliente: ClienteInput, sectorNombre: string, jurisdiccionNombre: string) {
    const resultado = await evaluar(cliente, []);
    setClienteEnCurso({ cliente, sectorNombre, jurisdiccionNombre });
    setResultadoActivo(resultado);
    setEvaluaciones((prev) => [
      {
        id: resultado.evaluacion_id,
        cliente,
        sectorNombre,
        jurisdiccionNombre,
        resultado,
        fecha: new Date().toISOString(),
      },
      ...prev,
    ]);
    setPantalla('resultados');
  }

  function handleCompletado(resultado: ResultadoEvaluacion) {
    if (!clienteEnCurso) return;
    setResultadoActivo(resultado);
    const editando = evaluacionEnEdicion;
    setEvaluaciones((prev) => {
      const entrada: EvaluacionSesion = {
        id: resultado.evaluacion_id,
        cliente: clienteEnCurso.cliente,
        sectorNombre: clienteEnCurso.sectorNombre,
        jurisdiccionNombre: clienteEnCurso.jurisdiccionNombre,
        resultado,
        fecha: editando ? (prev.find((e) => e.id === resultado.evaluacion_id)?.fecha ?? new Date().toISOString()) : new Date().toISOString(),
      };
      if (editando) {
        return prev.map((e) => (e.id === resultado.evaluacion_id ? entrada : e));
      }
      return [entrada, ...prev];
    });
    setEvaluacionEnEdicion(null);
    setPantalla('resultados');
  }

  function handleEditarEvaluacion(datos: EvaluacionParaEditar) {
    setClienteEnCurso({
      cliente: datos.cliente,
      sectorNombre: datos.sectorNombre,
      jurisdiccionNombre: datos.jurisdiccionNombre,
    });
    setEvaluacionEnEdicion(datos);
    setResultadoActivo(null);
    setPantalla('cuestionario');
  }

  function handleEvaluacionEliminada(evaluacionId: string) {
    setEvaluaciones((prev) => prev.filter((e) => e.id !== evaluacionId));
  }

  function handleEvaluacionCerrada(evaluacionId: string, cerradaEn: string) {
    setResultadoActivo((prev) =>
      prev && prev.evaluacion_id === evaluacionId ? { ...prev, estado: 'cerrada', cerrada_en: cerradaEn } : prev,
    );
    setEvaluaciones((prev) =>
      prev.map((ev) =>
        ev.id === evaluacionId ? { ...ev, resultado: { ...ev.resultado, estado: 'cerrada', cerrada_en: cerradaEn } } : ev,
      ),
    );
  }

  function handleVerEvaluacion(evaluacion: EvaluacionSesion) {
    setClienteEnCurso({
      cliente: evaluacion.cliente,
      sectorNombre: evaluacion.sectorNombre,
      jurisdiccionNombre: evaluacion.jurisdiccionNombre,
    });
    setResultadoActivo(evaluacion.resultado);
    setPantalla('resultados');
  }

  function volverAClientes() {
    setEvaluacionEnEdicion(null);
    irACartera(evaluaciones.length === 0);
  }

  function handleNavegar(seccion: Seccion) {
    if (seccion === 'cartera') {
      irACartera(evaluaciones.length === 0);
    } else {
      setPantalla('inicio');
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ background: 'var(--doc-paper-sunk)' }}>
      <Navbar onIrAInicio={() => handleNavegar('inicio')} />

      <div className="flex flex-1">
        <Sidebar activo={pantalla === 'inicio' ? 'inicio' : 'cartera'} onNavegar={handleNavegar} onNuevaEvaluacion={handleNuevaEvaluacionClick} />

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex flex-1 flex-col">
          {pantalla === 'inicio' && cargandoEvaluaciones && (
            <div className="flex min-h-[60vh] items-center justify-center">
              <div
                className="h-8 w-8 animate-spin rounded-full border-[3px] border-t-transparent"
                style={{ borderColor: 'var(--border-subtle)', borderTopColor: 'transparent' }}
              />
            </div>
          )}

          {pantalla === 'inicio' && !cargandoEvaluaciones && (
            <Inicio
              evaluaciones={evaluaciones}
              onNuevaEvaluacion={handleNuevaEvaluacionClick}
              onVerCartera={() => irACartera(false)}
              onVerEvaluacion={handleVerEvaluacion}
            />
          )}

          {pantalla === 'cartera' && (
            <Clientes
              evaluaciones={evaluaciones}
              cargando={cargandoEvaluaciones}
              error={errorEvaluaciones}
              mostrarForm={mostrarFormCliente}
              onMostrarFormChange={setMostrarFormCliente}
              onNuevaEvaluacion={handleNuevaEvaluacion}
              onRegistrarNoEvaluable={handleRegistrarNoEvaluable}
              onVerEvaluacion={handleVerEvaluacion}
              onEditarEvaluacion={handleEditarEvaluacion}
              onEvaluacionEliminada={handleEvaluacionEliminada}
            />
          )}

          {pantalla === 'cuestionario' && clienteEnCurso && (
            <Cuestionario
              cliente={clienteEnCurso.cliente}
              sectorNombre={clienteEnCurso.sectorNombre}
              jurisdiccionNombre={clienteEnCurso.jurisdiccionNombre}
              evaluacionId={evaluacionEnEdicion?.evaluacion_id}
              respuestasIniciales={evaluacionEnEdicion?.respuestas}
              onCompletado={handleCompletado}
              onCancelar={volverAClientes}
            />
          )}

          {pantalla === 'resultados' && clienteEnCurso && resultadoActivo && (
            resultadoActivo.no_evaluable ? (
              <NoEvaluable
                cliente={clienteEnCurso.cliente}
                sectorNombre={clienteEnCurso.sectorNombre}
                jurisdiccionNombre={clienteEnCurso.jurisdiccionNombre}
                resultado={resultadoActivo}
                onVolverAClientes={volverAClientes}
              />
            ) : (
              <Resultados
                cliente={clienteEnCurso.cliente}
                sectorNombre={clienteEnCurso.sectorNombre}
                jurisdiccionNombre={clienteEnCurso.jurisdiccionNombre}
                resultado={resultadoActivo}
                onEvaluacionCerrada={handleEvaluacionCerrada}
                onVolverAClientes={volverAClientes}
              />
            )
          )}
        </main>
        </div>
      </div>
    </div>
  );
}

export default App;
