'use client';

interface ContextData {
  etapa: string;
  subestado: string;
  temperatura: string;
  puntaje?: number | null;
  estadoOportunidad: string;
  notas: Array<{ id: string; contenido: string; creado_en: string }>;
  tareas: Array<{ id: string; titulo: string; estado: string; prioridad?: string; creado_en: string }>;
}

interface Props {
  persona?: any;
  oferta?: any;
  aplicacion?: any;
  contexto?: ContextData;
  /** Marca del hilo. El teléfono visible es telefonoEnmascarado, no el E.164. */
  esQa?: boolean;
}

function fecha(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * BA-030: datos de CRM para quien opera el demo.
 * Se monta solo dentro de la hoja de operación, no junto al hilo.
 */
export default function ContextPanel({ persona, oferta, aplicacion, contexto, esQa }: Props) {
  const qa = esQa === true || persona?.es_qa === true;
  const telefono = persona?.telefonoEnmascarado || '—';
  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm" aria-label="Contexto de la oportunidad">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900">Contexto de oportunidad</h3>
        {qa ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">QA</span>
        ) : null}
      </div>
      <div className="space-y-1 text-gray-700">
        <p><strong>Estudiante:</strong> {[persona?.nombres, persona?.apellidos].filter(Boolean).join(' ') || '—'}</p>
        {/* Máscara del servidor. No se reconstruye el número en el cliente. */}
        <p><strong>Celular:</strong> {telefono}</p>
        <p><strong>Correo:</strong> {persona?.correo_principal || '—'}</p>
        <p><strong>Oferta:</strong> {oferta?.nombre_oferta || oferta?.nombre || '—'}</p>
        <p><strong>Estado aplicación:</strong> {aplicacion?.estado || '—'}</p>
        <p><strong>Etapa / subestado:</strong> {contexto?.etapa || '—'} / {contexto?.subestado || '—'}</p>
        <p><strong>Temperatura:</strong> {contexto?.temperatura || '—'}</p>
        <p><strong>Puntaje:</strong> {contexto?.puntaje ?? '—'}</p>
      </div>

      <div>
        <h4 className="mb-1 font-medium text-gray-900">Últimas notas</h4>
        <ul className="space-y-1 text-xs text-gray-600">
          {(contexto?.notas || []).slice(0, 4).map((n) => (
            <li key={n.id} className="rounded bg-gray-50 p-2">
              <p>{n.contenido}</p>
              <p className="mt-1 text-[10px] text-gray-400">{fecha(n.creado_en)}</p>
            </li>
          ))}
          {!contexto?.notas?.length && <li className="text-gray-400">Sin notas recientes.</li>}
        </ul>
      </div>

      <div>
        <h4 className="mb-1 font-medium text-gray-900">Últimas tareas</h4>
        <ul className="space-y-1 text-xs text-gray-600">
          {(contexto?.tareas || []).slice(0, 4).map((t) => (
            <li key={t.id} className="rounded bg-gray-50 p-2">
              <p>{t.titulo} · {t.estado}</p>
              <p className="mt-1 text-[10px] text-gray-400">{fecha(t.creado_en)}</p>
            </li>
          ))}
          {!contexto?.tareas?.length && <li className="text-gray-400">Sin tareas recientes.</li>}
        </ul>
      </div>
    </section>
  );
}
