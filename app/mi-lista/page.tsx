"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import OfferCard from '@/components/explorar/OfferCard';
import OfferDetailModal from '@/components/explorar/OfferDetailModal';
import { useMyList } from '@/src/contexts/MyListContext';
import { obtenerOfertasPorIds, type OfertaAcademica } from '@/src/lib/ofertas';

export default function MiListaPage() {
  const { myList, isInMyList, removeFromMyList, clearMyList } = useMyList();

  const [ofertas, setOfertas] = useState<OfertaAcademica[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOferta, setSelectedOferta] = useState<OfertaAcademica | null>(null);

  // Cargar las ofertas guardadas cada vez que cambia la lista de IDs.
  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setLoading(true);
      const data = await obtenerOfertasPorIds(myList);
      if (!cancelado) {
        setOfertas(data);
        setLoading(false);
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
  }, [myList]);

  return (
    <div className="min-h-screen bg-buscoedu-bg">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-buscoedu-blue">Mi lista</h1>
            <p className="mt-1 text-sm text-buscoedu-muted">
              {loading
                ? 'Cargando tus opciones guardadas...'
                : ofertas.length === 0
                  ? 'Aún no has guardado ninguna opción.'
                  : `Tienes ${ofertas.length} ${ofertas.length === 1 ? 'opción guardada' : 'opciones guardadas'}.`}
            </p>
          </div>

          {ofertas.length > 0 && (
            <button
              onClick={clearMyList}
              className="rounded-md border border-buscoedu-border px-4 py-2 text-sm font-medium text-buscoedu-text transition-colors hover:border-red-300 hover:text-red-600"
            >
              Vaciar lista
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-buscoedu-teal"></div>
            <p className="mt-4 text-buscoedu-muted">Cargando...</p>
          </div>
        ) : ofertas.length === 0 ? (
          <div className="rounded-lg border border-buscoedu-border bg-white p-8 text-center">
            <p className="mb-2 font-semibold text-buscoedu-text">Tu lista está vacía</p>
            <p className="mb-6 text-sm text-buscoedu-muted">
              Explora las opciones y toca el corazón para guardarlas aquí y compararlas después.
            </p>
            <Link
              href="/explorar"
              className="inline-flex items-center rounded-md bg-buscoedu-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
            >
              Explorar opciones
            </Link>
          </div>
        ) : (
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
