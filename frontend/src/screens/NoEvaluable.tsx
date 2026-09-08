import type { ClienteInput, PerfilTamano, ResultadoEvaluacion, SubsectorAgro } from '../types';
import { Button } from '../components/ds/Button';
import { SantanderLogo } from '../components/SantanderLogo';

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

interface NoEvaluableProps {
  cliente: ClienteInput;
  sectorNombre: string;
  jurisdiccionNombre: string;
  resultado: ResultadoEvaluacion;
  onVolverAClientes: () => void;
}

export function NoEvaluable({ cliente, sectorNombre, jurisdiccionNombre, resultado, onVolverAClientes }: NoEvaluableProps) {
  const actividad = resultado.actividad_prohibida ?? null;

  const filas: [string, string][] = [
    ['Cliente', cliente.numero_cliente || '—'],
    ['Nombre', cliente.nombre || '—'],
    ['Sector', sectorNombre || '—'],
    ['Estado de operación', jurisdiccionNombre || '—'],
    ['Subsector', cliente.subsector ? SUBSECTOR_LABEL[cliente.subsector] : '—'],
    ['Perfil de tamaño', PERFIL_LABEL[cliente.perfil_tamano] ?? cliente.perfil_tamano],
  ];

  return (
    <div className="resultados-root flex min-h-full flex-col" style={{ background: 'var(--doc-paper-sunk)' }}>
      <div className="mx-auto w-full max-w-[880px] flex-1 px-4 py-8 sm:px-8">
        <div className="ds-eyebrow">Resultado de elegibilidad</div>
        <h1 className="ds-title m-0 mt-1" style={{ fontSize: 'var(--title-page)', color: 'var(--doc-ink-900)' }}>
          Cliente no evaluable
        </h1>

        <div
          className="ds-rise mt-6 flex items-start gap-3 px-5 py-4"
          style={{ background: 'var(--red-100)', color: 'var(--red-800)', borderRadius: 'var(--radius-panel)' }}
        >
          <BanIcon />
          <div className="flex flex-col gap-1">
            <p className="m-0 text-[15px] font-semibold uppercase tracking-[0.04em]">
              No evaluable por actividad prohibida
            </p>
            <p className="m-0 text-[13px] leading-normal" style={{ color: 'var(--red-700)' }}>
              El cliente participa en una actividad prohibida por la política ESG del Grupo Santander. No procede el
              cuestionario de normas ni el análisis de riesgo.
            </p>
          </div>
        </div>

        {actividad && (
          <div className="ds-panel ds-rise mt-4 p-6 sm:p-8">
            <div className="ds-eyebrow">{actividad.clausula_politica}</div>
            <p className="m-0 mt-1.5 text-[17px] font-semibold" style={{ color: 'var(--doc-ink-900)' }}>
              {actividad.etiqueta}
            </p>
            <p className="m-0 mt-3 text-[14px] leading-relaxed" style={{ color: 'var(--doc-ink-700)' }}>
              {actividad.descripcion}
            </p>
            <p className="m-0 mt-4 text-[12px] leading-normal" style={{ color: 'var(--doc-ink-500)' }}>
              Fuente: Grupo Santander — «Gestión de Riesgos Medioambientales, Sociales y de Cambio Climático:
              Actividades Prohibidas y que Requieren Especial Atención».
            </p>
          </div>
        )}

        <div className="ds-panel ds-rise mt-4 p-6 sm:p-8">
          <div className="ds-eyebrow">Datos del cliente</div>
          <dl className="m-0 mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {filas.map(([label, valor]) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="ds-eyebrow">{label}</dt>
                <dd className="m-0 text-[14px] font-medium" style={{ color: 'var(--doc-ink-900)' }}>
                  {valor}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-8 flex justify-end">
          <Button variant="primary" size="m" onClick={onVolverAClientes}>
            Volver a la cartera
          </Button>
        </div>
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

function BanIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.6 5.6l12.8 12.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
