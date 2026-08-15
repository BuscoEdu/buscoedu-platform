"use client";

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import NaiaChatPanel from '@/components/naia/NaiaChatPanel';
import { obtenerOfertas, verificarDatosDemo, type FiltrosOferta, type OfertaAcademica } from '@/src/lib/ofertas';
import type { NaiaMockResponse } from '@/src/lib/naia-mock';

export default function ExplorarPage() {
  const searchParams = useSearchParams();
  const intention = searchParams.get('q');

  const [filtros, setFiltros] = useState<FiltrosOferta>({});
  const [ofertas, setOfertas] = useState<OfertaAcademica[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalOfertas, setTotalOfertas] = useState(0);
  const [hayDatos, setHayDatos] = useState(false);

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

      // Cargar ofertas iniciales
      const { ofertas: ofertasIniciales, total } = await obtenerOfertas(filtros);
      setOfertas(ofertasIniciales);
      setTotalOfertas(total);
      setLoading(false);
    }

    inicializar();
  }, []);

  // Recargar ofertas cuando cambian los filtros
  useEffect(() => {
    async function cargarOfertas() {
      if (!hayDatos) return;
      
      setLoading(true);
      const { ofertas: nuevasOfertas, total } = await obtenerOfertas(filtros);
      setOfertas(nuevasOfertas);
      setTotalOfertas(total);
      setLoading(false);
    }

    cargarOfertas();
  }, [filtros, hayDatos]);

  // Callback cuando NaIA detecta filtros
  const handleFiltersDetected = (nuevosFiltros: NaiaMockResponse['filtros']) => {
    setFiltros(prev => ({
      ...prev,
      ...nuevosFiltros
    }));
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
            <p className="text-sm text-buscoedu-muted">
              Los filtros manuales se implementarán en el BLOQUE 3.
            </p>
            
            {/* Mostrar filtros activos de NaIA */}
            {Object.keys(filtros).length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-buscoedu-muted uppercase">Filtros activos:</p>
                {Object.entries(filtros).map(([key, value]) => (
                  <div key={key} className="text-sm bg-buscoedu-teal/10 px-3 py-2 rounded-md">
                    <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span> {value}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: Resultados */}
        <div className="overflow-y-auto">
          <div className="p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-buscoedu-blue mb-2">
                Opciones que coinciden con tu búsqueda
              </h1>
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Las opciones mostradas coinciden con los criterios indicados. No constituyen una garantía de admisión, beca concedida ni disponibilidad de cupo.
              </p>
            </div>

            {!hayDatos ? (
              <div className="bg-white border border-buscoedu-border rounded-lg p-8 text-center">
                <p className="text-buscoedu-text mb-2 font-semibold">No hay datos demo en Supabase</p>
                <p className="text-sm text-buscoedu-muted">
                  Las tablas de ofertas académicas están vacías. Se necesita insertar datos demo antes de continuar.
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
              <div className="space-y-4">
                <p className="text-sm text-buscoedu-muted">
                  {totalOfertas} {totalOfertas === 1 ? 'resultado' : 'resultados'}
                </p>
                
                {/* Placeholder para tarjetas - se implementarán en BLOQUE 3 */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {ofertas.map((oferta) => (
                    <div key={oferta.id} className="bg-white border border-buscoedu-border rounded-lg p-4">
                      <h3 className="font-semibold text-buscoedu-blue mb-2">
                        {oferta.programa?.nombre || oferta.nombre}
                      </h3>
                      <p className="text-sm text-buscoedu-muted mb-2">
                        {oferta.universidad?.nombre}
                      </p>
                      {oferta.programa?.modalidad && (
                        <p className="text-xs text-buscoedu-muted">
                          Modalidad: {oferta.programa.modalidad}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Layout Mobile: vertical */}
      <div className="md:hidden p-4 space-y-4">
        <h1 className="text-xl font-bold text-buscoedu-blue">Explorar Opciones</h1>
        
        {/* Chat compacto */}
        <div className="bg-white border border-buscoedu-border rounded-lg h-[300px]">
          <NaiaChatPanel
            initialMessage={intention || undefined}
            onFiltersDetected={handleFiltersDetected}
            className="h-full"
          />
        </div>

        {/* Resultados */}
        <div>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
            Las opciones mostradas coinciden con los criterios indicados.
          </p>

          {!hayDatos ? (
            <div className="bg-white border border-buscoedu-border rounded-lg p-6 text-center">
              <p className="text-sm text-buscoedu-muted">
                No hay datos demo disponibles.
              </p>
            </div>
          ) : ofertas.length === 0 ? (
            <div className="bg-white border border-buscoedu-border rounded-lg p-6 text-center">
              <p className="text-sm text-buscoedu-muted">
                No se encontraron resultados.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ofertas.map((oferta) => (
                <div key={oferta.id} className="bg-white border border-buscoedu-border rounded-lg p-4">
                  <h3 className="font-semibold text-buscoedu-blue mb-1">
                    {oferta.programa?.nombre || oferta.nombre}
                  </h3>
                  <p className="text-sm text-buscoedu-muted">
                    {oferta.universidad?.nombre}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
