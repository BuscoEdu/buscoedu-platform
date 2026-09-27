"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import OfferCard from '@/components/explorar/OfferCard';
import OfferDetailModal from '@/components/explorar/OfferDetailModal';
import { useMyList } from '@/src/contexts/MyListContext';
import { obtenerOfertasPorIds, type OfertaAcademica } from '@/src/lib/ofertas';

/**
 * BA-005: la pantalla solo puede decir “vacía” si la consulta respondió ok:true.
 * ok:false es un fallo técnico y debe ofrecer Reintentar.
 */
type EstadoLista = 'cargando' | 'error' | 'vacio' | 'lista';

const COPY_ERROR_LISTA =
  'Hubo un problema técnico al consultar tus opciones guardadas. Esto no significa que tu lista esté vacía.';

export default function MiListaPage() {
  const { myList, isInMyList, removeFromMyList, clearMyList } = useMyList();

  const [ofertas, setOfertas] = useState<OfertaAcademica[]>([]);
  const [estado, setEstado] = useState<EstadoLista>('cargando');
  const [intento, setIntento] = useState(0);
  const [selectedOferta, setSelectedOferta] = useState<OfertaAcademica | null>(null);

  // Bloque carga: cada cambio de IDs o de Reintentar vuelve a consultar.
  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setEstado('cargando');
      const resultado = await obtenerOfertasPorIds(myList);
      if (cancelado) return;

      // Bloque error: ok:false no se aplana a “sin ofertas”.
      if (!resultado.ok) {
        setOfertas([]);
        setEstado('error');
        return;
      }

      setOfertas(resultado.ofertas);
      // Bloque vacío: únicamente éxito real con cero ofertas.
      setEstado(resultado.ofertas.length === 0 ? 'vacio' : 'lista');
    }

    void cargar();
    return () => {
      cancelado = true;
    };
  }, [myList, intento]);

  const subtitulo =
    estado === 'cargando'
      ? 'Cargando tus opciones guardadas...'
      : estado === 'error'
        ? 'No pudimos leer tus opciones guardadas.'
        : estado === 'vacio'
          ? myList.length === 0
            ? 'Aún no has guardado ninguna opción.'
            : 'Las opciones que habías guardado ya no están disponibles en el catálogo.'
          : `Tienes ${ofertas.length} ${ofertas.length === 1 ? 'opción guardada' : 'opciones guardadas'}.`;

  return (
    <div className="min-h-screen bg-buscoedu-bg">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-buscoedu-blue">Mi lista</h1>
            <p className="mt-1 text-sm text-buscoedu-muted">{subtitulo}</p>
          </div>

          {/* Vaciar solo cuando hay un listado exitoso, nunca en error ni en vacío. */}
          {estado === 'lista' && ofertas.length > 0 && (
            <button
              type="button"
              onClick={clearMyList}
              className="rounded-md border border-buscoedu-border px-4 py-2 text-sm font-medium text-buscoedu-text transition-colors hover:border-red-300 hover:text-red-600"
            >
              Vaciar lista
            </button>
          )}
        </div>

        {/* Bloque carga */}
        {estado === 'cargando' ? (
          <div className="py-12 text-center" role="status" aria-live="polite" aria-busy="true">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-buscoedu-teal" />
            <p className="mt-4 text-buscoedu-muted">Cargando...</p>
          </div>
        ) : estado === 'error' ? (
          /* Bloque error: distinto del vacío de catálogo y con reintento. */
          <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center" role="alert">
            <p className="mb-2 font-semibold text-buscoedu-text">No pudimos cargar tu lista</p>
            <p className="mb-6 text-sm text-buscoedu-text">{COPY_ERROR_LISTA}</p>
            <button
              type="button"
              onClick={() => setIntento((actual) => actual + 1)}
              className="inline-flex min-h-[44px] items-center rounded-md bg-buscoedu-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
            >
              Reintentar
            </button>
          </div>
        ) : estado === 'vacio' ? (
          /* BA-010: el vacío dice que Guardar no envía datos. No es un contacto a la universidad. */
          <div className="rounded-lg border border-buscoedu-border bg-white p-8 text-center">
            <p className="mb-2 font-semibold text-buscoedu-text">
              {myList.length === 0 ? 'Tu lista está vacía' : 'No encontramos tus opciones guardadas'}
            </p>
            <p className="mb-2 text-sm text-buscoedu-muted">
              {myList.length === 0
                ? 'Explora las opciones y toca el corazón para guardarlas aquí y compararlas después.'
                : 'La consulta respondió bien, pero esas opciones ya no están publicadas. Puedes guardar otras.'}
            </p>
            <p className="mb-6 text-sm font-medium text-buscoedu-text">Guardar no envía tus datos.</p>
            <Link
              href="/explorar"
              className="inline-flex min-h-[44px] items-center rounded-md bg-buscoedu-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
            >
              Explorar opciones
            </Link>
          </div>
        ) : (
          /* Bloque éxito */
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ofertas.map((oferta) => (
              <OfferCard
                key={oferta.id}
                oferta={oferta}
                onCardClick={() => setSelectedOferta(oferta)}
                isInMyList={isInMyList(oferta.id)}
                onToggleMyList={() => removeFromMyList(oferta.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal de detalle de oferta */}
      <OfferDetailModal oferta={selectedOferta} onClose={() => setSelectedOferta(null)} />
    </div>
  );
}
