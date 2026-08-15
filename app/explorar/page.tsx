"use client";

import { useSearchParams } from 'next/navigation';

export default function ExplorarPage() {
  const searchParams = useSearchParams();
  const intention = searchParams.get('q');

  return (
    <div className="min-h-screen bg-buscoedu-bg p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-buscoedu-blue mb-4">
          Explorar Opciones
        </h1>
        {intention && (
          <p className="text-buscoedu-text">
            Búsqueda: <span className="font-semibold">{intention}</span>
          </p>
        )}
        <p className="mt-4 text-buscoedu-muted">
          Esta página se implementará en el BLOQUE 2 con el chat de NaIA, filtros y resultados.
        </p>
      </div>
    </div>
  );
}
