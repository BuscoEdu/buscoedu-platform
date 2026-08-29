'use client';

import { useEffect, useState } from 'react';

interface Accion {
  codigo: string;
  etiqueta: string;
}
interface Sugerencia {
  titulo: string;
  mensaje: string;
  prioridad: 'alta' | 'media' | 'baja';
  acciones: Accion[];
}

const PRIORIDAD_ESTILO: Record<string, string> = {
  alta: 'border-red-200 bg-red-50',
  media: 'border-amber-200 bg-amber-50',
  baja: 'border-blue-200 bg-blue-50'
};

/**
 * Panel del copiloto determinista. Muestra UNA sugerencia y deja que el asesor
 * decida. Nunca ejecuta la acción por su cuenta: cada decisión (registrar /
 * ignorar) se envía al backend para quedar auditada como nota interna.
 */
export default function PanelCopiloto({
  oportunidadId,
  personaId
}: {
  oportunidadId: string;
  personaId?: string;
}) {
  const [sug, setSug] = useState<Sugerencia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [resuelto, setResuelto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/leadcenter/oportunidad/${oportunidadId}/copiloto`)
      .then((r) => r.json())
      .then((d) => {
        if (vivo && d.ok) setSug(d.sugerencia);
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [oportunidadId]);

  async function decidir(accion: string, decision: 'registrar' | 'ignorar') {
    setEnviando(true);
    try {
      await fetch(`/api/leadcenter/oportunidad/${oportunidadId}/copiloto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion,
          decision,
          tituloSugerencia: sug?.titulo,
          personaId
        })
      });
      setResuelto(
        decision === 'registrar'
          ? 'Sugerencia registrada. Continúa con la acción cuando quieras.'
          : 'Sugerencia ignorada y registrada en el historial.'
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
          ✦
        </span>
        <h2 className="text-base font-semibold text-gray-900">Copiloto del asesor</h2>
      </div>

      {cargando && <p className="text-sm text-gray-500">Analizando la oportunidad…</p>}

      {!cargando && sug && (
        <div className={`rounded-xl border p-3 ${PRIORIDAD_ESTILO[sug.prioridad]}`}>
          <p className="text-sm font-semibold text-gray-900">{sug.titulo}</p>
          <p className="mt-1 text-sm text-gray-700">{sug.mensaje}</p>

          {resuelto ? (
            <p className="mt-3 text-sm font-medium text-gray-600">{resuelto}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {sug.acciones.map((a) => {
                const esIgnorar = a.codigo === 'ignorar';
                return (
                  <button
                    key={a.codigo}
                    disabled={enviando}
                    onClick={() => decidir(a.codigo, esIgnorar ? 'ignorar' : 'registrar')}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                      esIgnorar
                        ? 'border border-gray-300 text-gray-600 hover:bg-white'
                        : 'bg-violet-600 text-white hover:bg-violet-700'
                    }`}
                  >
                    {a.etiqueta}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-gray-400">
        El copiloto sólo sugiere. Ninguna acción se ejecuta automáticamente; tú decides y todo queda
        registrado.
      </p>
    </div>
  );
}
