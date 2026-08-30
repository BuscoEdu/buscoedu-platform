'use client';

interface DemoSessionItem {
  aplicacionId: string;
  oportunidadId: string;
  nombre: string;
  celular: string;
  oferta: string;
  estadoAplicacion: string;
  etapa: string;
  subestado: string;
  temperatura: string;
  fechaAplicacion: string;
  conversacionExiste: boolean;
  ultimaActividad?: string;
}

interface Props {
  sessions: DemoSessionItem[];
  selectedId?: string | null;
  onSelect: (oportunidadId: string) => void;
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function SessionList({ sessions, selectedId, onSelect }: Props) {
  if (!sessions.length) {
    return <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">No hay sesiones disponibles.</p>;
  }

  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <button
          key={s.aplicacionId}
          onClick={() => onSelect(s.oportunidadId)}
          className={`w-full rounded-xl border p-3 text-left transition ${
            selectedId === s.oportunidadId
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-900">{s.nombre}</p>
              <p className="text-xs text-gray-500">{s.celular}</p>
              <p className="mt-1 text-sm text-gray-700">{s.oferta}</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{s.temperatura}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
            <span>Aplicación: {s.estadoAplicacion}</span>
            <span>Etapa: {s.etapa}</span>
            <span>Subestado: {s.subestado}</span>
            <span>Actividad: {formatDate(s.ultimaActividad)}</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            {s.conversacionExiste ? 'Con conversación' : 'Sin conversación'} · Aplicó: {formatDate(s.fechaAplicacion)}
          </p>
        </button>
      ))}
    </div>
  );
}
