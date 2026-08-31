'use client';

/**
 * Modal de confirmación genérico para acciones sensibles
 * (publicar versión, archivar, desactivar, etc.).
 */
export default function ModalConfirmacion({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  cargando = false,
  onConfirmar,
  onCancelar
}: {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  cargando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-buscoedu-border bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold text-buscoedu-blue">{titulo}</h3>
        <p className="mt-2 text-sm text-buscoedu-text">{mensaje}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={cargando}
            className="rounded-md border border-buscoedu-border px-3 py-2 text-sm font-semibold text-buscoedu-text hover:bg-buscoedu-bg disabled:opacity-60"
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={cargando}
            className="rounded-md bg-buscoedu-blue px-3 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
          >
            {cargando ? 'Procesando...' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
