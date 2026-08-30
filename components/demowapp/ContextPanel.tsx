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
}

function fecha(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function ContextPanel({ persona, oferta, aplicacion, contexto }: Props) {
  return (
    <aside className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm">
      <h3 className="font-semibold text-gray-900">Contexto de oportunidad</h3>
      <div className="space-y-1 text-gray-700">
        <p><strong>Estudiante:</strong> {[persona?.nombres, persona?.apellidos].filter(Boolean).join(' ') || '—'}</p>
        <p><strong>Celular:</strong> {persona?.celular_e164 || persona?.telefono_principal || '—'}</p>
        <p><strong>Correo:</strong> {persona?.correo_principal || '—'}</p>
        <p><strong>Oferta:</strong> {oferta?.nombre || '—'}</p>
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
    </aside>
  );
}
