"use client";

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import NaiaChatPanel from '@/components/naia/NaiaChatPanel';
import FilterPanel from '@/components/explorar/FilterPanel';
import ActiveFilterTags from '@/components/explorar/ActiveFilterTags';
import SortControl from '@/components/explorar/SortControl';
import OfferCard from '@/components/explorar/OfferCard';
import OfferDetailModal from '@/components/explorar/OfferDetailModal';
import { useMyList } from '@/src/contexts/MyListContext';
import { obtenerOfertas, verificarDatosDemo, type FiltrosOferta, type OfertaAcademica } from '@/src/lib/ofertas';
import type { NaiaMockResponse } from '@/src/lib/naia-mock';

function ExplorarPageContent() {
  const searchParams = useSearchParams();
  const intention = searchParams.get('q');
  const { isInMyList, addToMyList, removeFromMyList } = useMyList();

  const [filtros, setFiltros] = useState<FiltrosOferta>({});
  const [ofertas, setOfertas] = useState<OfertaAcademica[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalOfertas, setTotalOfertas] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [hayDatos, setHayDatos] = useState(false);
  const [sortBy, setSortBy] = useState('relevancia');
  const [selectedOferta, setSelectedOferta] = useState<OfertaAcademica | null>(null);

  // Verificar datos y cargar ofertas iniciales
  useEffect(() => {
    async function inicializar() {
      setLoading(true);

      // Verificar si hay datos
      const tieneDatos = await verificarDatosDemo();
      setHayDatos(tieneDatos);

      if (!tieneDatos) {
        console.warn('No hay datos demo en Supabase. Las tablas están vacías.');
        setLoading(false);
        return;
      }

      // Cargar ofertas iniciales (página 0)
      const { ofertas: ofertasIniciales, total, hasMore: masResultados } = await obtenerOfertas(filtros, 0);
      setOfertas(ofertasIniciales);
      setTotalOfertas(total);
      setPage(0);
      setHasMore(masResultados);
      setLoading(false);
    }

    inicializar();
  }, []);

  // Recargar ofertas (reiniciando a página 0) cuando cambian los filtros
  useEffect(() => {
    async function cargarOfertas() {
      if (!hayDatos) return;

      setLoading(true);
      const { ofertas: nuevasOfertas, total, hasMore: masResultados } = await obtenerOfertas(filtros, 0);
      setOfertas(nuevasOfertas);
      setTotalOfertas(total);
      setPage(0);
      setHasMore(masResultados);
      setLoading(false);
    }

    cargarOfertas();
  }, [filtros, hayDatos]);

  // Cargar la siguiente página y CONCATENAR (no reemplaza) el listado
  const handleVerMas = async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    const siguientePagina = page + 1;
    const { ofertas: masOfertas, total, hasMore: masResultados } = await obtenerOfertas(filtros, siguientePagina);
    setOfertas((prev) => [...prev, ...masOfertas]);
    setTotalOfertas(total);
    setPage(siguientePagina);
    setHasMore(masResultados);
    setLoadingMore(false);
  };

  // Callback cuando NaIA detecta filtros
  const handleFiltersDetected = (nuevosFiltros: NaiaMockResponse['filtros']) => {
    setFiltros(prev => ({
      ...prev,
      ...nuevosFiltros
    }));
  };

  // Manejar cambios en filtros manuales
  const handleManualFiltersChange = (nuevosFiltros: FiltrosOferta) => {
    setFiltros(nuevosFiltros);
  };

  // Remover un filtro específico
  const handleRemoveFilter = (key: keyof FiltrosOferta) => {
    const newFiltros = { ...filtros };
    delete newFiltros[key];
    setFiltros(newFiltros);
  };

  // Limpiar todos los filtros
  const handleClearAllFilters = () => {
    setFiltros({});
  };

  // Toggle oferta en Mi Lista
  const handleToggleMyList = (ofertaId: string) => {
    if (isInMyList(ofertaId)) {
      removeFromMyList(ofertaId);
    } else {
      addToMyList(ofertaId);
    }
  };

  return (
    <div className="min-h-screen bg-buscoedu-bg">
      {/* Layout Desktop: 2 columnas */}
      <div className="hidden md:grid md:grid-cols-[400px_1fr] h-[calc(100vh-64px)]">
        {/* Columna izquierda: Chat + Filtros */}
        <div className="border-r border-buscoedu-border bg-white overflow-y-auto">
          <div className="h-[60%] border-b border-buscoedu-border">
            <NaiaChatPanel
              initialMessage={intention || undefined}
              onFiltersDetected={handleFiltersDetected}
              className="h-full"
            />
          </div>
          
          <div className="p-4">
            <h3 className="font-bold text-buscoedu-blue mb-3">Filtros</h3>
            <FilterPanel filtros={filtros} onFiltrosChange={handleManualFiltersChange} />
          </div>
        </div>

        {/* Columna derecha: Resultados */}
        <div className="overflow-y-auto flex flex-col">
          {/* Tags de filtros activos */}
          <ActiveFilterTags 
            filtros={filtros}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAllFilters}
          />

          <div className="p-6 flex-1">
            <div className="mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-buscoedu-blue mb-2">
                    Opciones que coinciden con tu búsqueda
                  </h1>
                  <p className="text-sm text-buscoedu-muted">
                    {loading
                      ? 'Cargando...'
                      : totalOfertas === 0
                        ? '0 resultados'
                        : `Mostrando ${ofertas.length} de ${totalOfertas} ${totalOfertas === 1 ? 'resultado' : 'resultados'}`}
                  </p>
                </div>
                <SortControl value={sortBy} onChange={setSortBy} />
              </div>
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Las opciones mostradas coinciden con los criterios indicados. No constituyen una garantía de admisión, beca concedida ni disponibilidad de cupo.
              </p>
            </div>

            {!hayDatos ? (
              <div className="bg-white border border-buscoedu-border rounded-lg p-8 text-center">
                <p className="text-buscoedu-text mb-2 font-semibold">No hay ofertas visibles para este entorno</p>
                <p className="text-sm text-buscoedu-muted">
                  Verifica vigencia de fechas y políticas de lectura (RLS) para el rol anon/authenticated en Supabase.
                </p>
              </div>
            ) : loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-buscoedu-teal"></div>
                <p className="mt-4 text-buscoedu-muted">Cargando ofertas...</p>
              </div>
            ) : ofertas.length === 0 ? (
              <div className="bg-white border border-buscoedu-border rounded-lg p-8 text-center">
                <p className="text-buscoedu-text mb-2 font-semibold">No se encontraron resultados</p>
                <p className="text-sm text-buscoedu-muted">
                  Intenta ajustar tus filtros o pregúntale a NaIA por otras opciones.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {ofertas.map((oferta) => (
                    <OfferCard
                      key={oferta.id}
                      oferta={oferta}
                      onCardClick={() => setSelectedOferta(oferta)}
                      isInMyList={isInMyList(oferta.id)}
                      onToggleMyList={() => handleToggleMyList(oferta.id)}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div className="mt-8 flex justify-center">
                    <button
                      onClick={handleVerMas}
                      disabled={loadingMore}
                      className="px-6 py-3 rounded-md border border-buscoedu-teal text-buscoedu-teal font-semibold hover:bg-buscoedu-teal hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {loadingMore ? 'Cargando...' : 'Ver más resultados'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Layout Mobile: vertical */}
      <div className="md:hidden space-y-4">
        {/* Chat compacto */}
        <div className="bg-white border-b border-buscoedu-border h-[300px]">
          <NaiaChatPanel
            initialMessage={intention || undefined}
            onFiltersDetected={handleFiltersDetected}
            className="h-full"
          />
        </div>

        {/* Tags de filtros activos */}
        <ActiveFilterTags 
          filtros={filtros}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={handleClearAllFilters}
        />

        {/* Resultados */}
        <div className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h1 className="text-xl font-bold text-buscoedu-blue">Explorar Opciones</h1>
            <SortControl value={sortBy} onChange={setSortBy} />
          </div>
          <p className="text-sm text-buscoedu-muted mb-4">
            {loading
              ? 'Cargando...'
              : totalOfertas === 0
                ? '0 resultados'
                : `Mostrando ${ofertas.length} de ${totalOfertas} ${totalOfertas === 1 ? 'resultado' : 'resultados'}`}
          </p>

          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
            Las opciones mostradas coinciden con los criterios indicados.
          </p>

          {!hayDatos ? (
            <div className="bg-white border border-buscoedu-border rounded-lg p-6 text-center">
              <p className="text-sm text-buscoedu-muted">
                No hay ofertas visibles en este entorno. Revisa vigencia y políticas RLS para anon/authenticated.
              </p>
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-buscoedu-teal"></div>
              <p className="mt-4 text-buscoedu-muted">Cargando ofertas...</p>
            </div>
          ) : ofertas.length === 0 ? (
            <div className="bg-white border border-buscoedu-border rounded-lg p-6 text-center">
              <p className="text-sm text-buscoedu-muted">
                No se encontraron resultados.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {ofertas.map((oferta) => (
                  <OfferCard
                    key={oferta.id}
                    oferta={oferta}
                    onCardClick={() => setSelectedOferta(oferta)}
                    isInMyList={isInMyList(oferta.id)}
                    onToggleMyList={() => handleToggleMyList(oferta.id)}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={handleVerMas}
                    disabled={loadingMore}
                    className="w-full px-6 py-3 rounded-md border border-buscoedu-teal text-buscoedu-teal font-semibold hover:bg-buscoedu-teal hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loadingMore ? 'Cargando...' : 'Ver más resultados'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de detalle de oferta */}
      <OfferDetailModal oferta={selectedOferta} onClose={() => setSelectedOferta(null)} />
    </div>
  );
}


export default function ExplorarPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-buscoedu-muted">Cargando experiencia de exploración...</div>}>
      <ExplorarPageContent />
    </Suspense>
  );
}
