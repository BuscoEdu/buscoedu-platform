"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import NaiaChatPanel, { type NaiaChatStateSnapshot } from '@/components/naia/NaiaChatPanel';
import FilterPanel from '@/components/explorar/FilterPanel';
import ActiveFilterTags from '@/components/explorar/ActiveFilterTags';
import SortControl from '@/components/explorar/SortControl';
import OfferCard from '@/components/explorar/OfferCard';
import OfferDetailModal from '@/components/explorar/OfferDetailModal';
import DemoWappModal from '@/components/demowapp/DemoWappModal';
import { useMyList } from '@/src/contexts/MyListContext';
import {
  obtenerOfertas,
  verificarDatosDemo,
  type FiltrosOferta,
  type OfertaAcademica
} from '@/src/lib/ofertas';

interface ResumenEstadisticas {
  totalProgramas: number;
  virtuales: number;
  presenciales: number;
  hibridosODistancia: number;
  ciudadesTop: Array<{ ciudad: string; cantidad: number }>;
  duracionSemestresMin?: number;
  duracionSemestresMax?: number;
}

interface ExplorePersistentState {
  filtros: FiltrosOferta;
  sortBy: string;
  totalOfertas: number;
  page: number;
  mobileChatOpen: boolean;
  mobileResultsScrollY: number;
  selectedOfertaId: string | null;
  chat: {
    conversationId?: string;
    scrollTop: number;
    lastQuestion?: string | null;
    suggestedActions?: string[];
    messages: Array<{ id: string; content: string; isUser: boolean; timestamp: string }>;
  };
}

const EXPLORE_STATE_KEY = 'buscoedu_explorar_state_v6';

function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function extraerDuracionSemestres(duracion?: string): number | null {
  if (!duracion) return null;
  const duracionNormalizada = normalizarTexto(duracion);
  if (!duracionNormalizada.includes('semestre')) return null;

  const numero = duracionNormalizada.match(/\d+(?:[\.,]\d+)?/);
  if (!numero) return null;

  const valor = Number(numero[0].replace(',', '.'));
  return Number.isFinite(valor) ? valor : null;
}

function calcularResumenEstadisticas(ofertas: OfertaAcademica[]): ResumenEstadisticas {
  const conteoCiudades = new Map<string, number>();
  const duracionesSemestres: number[] = [];

  let virtuales = 0;
  let presenciales = 0;
  let hibridosODistancia = 0;

  for (const oferta of ofertas) {
    const modalidadNormalizada = normalizarTexto(oferta.programa?.modalidad ?? '');

    if (modalidadNormalizada.includes('virtual')) {
      virtuales += 1;
    } else if (
      modalidadNormalizada.includes('hibrid') ||
      modalidadNormalizada.includes('mixt') ||
      modalidadNormalizada.includes('distancia') ||
      modalidadNormalizada.includes('semipresencial')
    ) {
      hibridosODistancia += 1;
    } else if (modalidadNormalizada.includes('presencial')) {
      presenciales += 1;
    }

    const ciudad = oferta.sede?.ciudad?.trim();
    if (ciudad) {
      conteoCiudades.set(ciudad, (conteoCiudades.get(ciudad) ?? 0) + 1);
    }

    const semestres = extraerDuracionSemestres(oferta.programa?.duracion);
    if (semestres !== null) duracionesSemestres.push(semestres);
  }

  const ciudadesTop = [...conteoCiudades.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ciudad, cantidad]) => ({ ciudad, cantidad }));

  const duracionSemestresMin =
    duracionesSemestres.length > 0 ? Math.min(...duracionesSemestres) : undefined;
  const duracionSemestresMax =
    duracionesSemestres.length > 0 ? Math.max(...duracionesSemestres) : undefined;

  return {
    totalProgramas: ofertas.length,
    virtuales,
    presenciales,
    hibridosODistancia,
    ciudadesTop,
    duracionSemestresMin,
    duracionSemestresMax
  };
}

function construirResumenEjecutivoResultados(
  ofertas: OfertaAcademica[],
  totalResultados: number
): string | null {
  if (ofertas.length === 0) return null;

  const estadisticas = calcularResumenEstadisticas(ofertas);
  const partes: string[] = [
    `Encontré ${totalResultados} ${totalResultados === 1 ? 'resultado' : 'resultados'} en total. En esta vista estás viendo ${ofertas.length}.`
  ];

  const totalConModalidad =
    estadisticas.virtuales + estadisticas.presenciales + estadisticas.hibridosODistancia;

  if (totalConModalidad > 0) {
    partes.push(
      `De los visibles, ${estadisticas.virtuales} ${estadisticas.virtuales === 1 ? 'es virtual' : 'son virtuales'}, ${estadisticas.presenciales} ${estadisticas.presenciales === 1 ? 'es presencial' : 'son presenciales'}${estadisticas.hibridosODistancia > 0 ? ` y ${estadisticas.hibridosODistancia} ${estadisticas.hibridosODistancia === 1 ? 'es híbrido o a distancia' : 'son híbridos o a distancia'}` : ''}.`
    );
  }

  if (estadisticas.ciudadesTop.length > 0) {
    const ciudadesTexto = estadisticas.ciudadesTop
      .map(({ ciudad, cantidad }) => `${ciudad} (${cantidad})`)
      .join(', ');
    partes.push(`Las ciudades con mayor presencia son ${ciudadesTexto}.`);
  }

  if (
    estadisticas.duracionSemestresMin !== undefined &&
    estadisticas.duracionSemestresMax !== undefined
  ) {
    if (estadisticas.duracionSemestresMin === estadisticas.duracionSemestresMax) {
      partes.push(`La duración referenciada es de ${estadisticas.duracionSemestresMin} semestres.`);
    } else {
      partes.push(
        `El rango de duración va de ${estadisticas.duracionSemestresMin} a ${estadisticas.duracionSemestresMax} semestres.`
      );
    }
  }

  return partes.join(' ');
}

function toPersistableChatState(chatState: NaiaChatStateSnapshot): ExplorePersistentState['chat'] {
  return {
    conversationId: chatState.conversationId,
    scrollTop: chatState.scrollTop || 0,
    lastQuestion: chatState.lastQuestion || null,
    suggestedActions: chatState.suggestedActions || [],
    messages: chatState.messages.map((m) => ({
      id: m.id,
      content: m.content,
      isUser: m.isUser,
      timestamp: m.timestamp.toISOString()
    }))
  };
}

function fromPersistedChatState(
  persisted?: ExplorePersistentState['chat']
): Partial<NaiaChatStateSnapshot> | undefined {
  if (!persisted) return undefined;

  return {
    conversationId: persisted.conversationId,
    scrollTop: persisted.scrollTop || 0,
    lastQuestion: persisted.lastQuestion || null,
    suggestedActions: persisted.suggestedActions || [],
    messages: (persisted.messages || []).map((m) => ({
      id: m.id,
      content: m.content,
      isUser: m.isUser,
      timestamp: new Date(m.timestamp)
    }))
  };
}

function ExplorarPageContent() {
  const searchParams = useSearchParams();
  const intention = searchParams.get('q');
  const { isInMyList, addToMyList, removeFromMyList } = useMyList();

  const mobileResultsRef = useRef<HTMLDivElement>(null);
  const restoringResultsScrollRef = useRef(false);

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
  const [selectedOfertaId, setSelectedOfertaId] = useState<string | null>(null);
  const [demoToken, setDemoToken] = useState<string | null>(null);
  const [mostrarDemoWapp, setMostrarDemoWapp] = useState(false);

  const [chatState, setChatState] = useState<Partial<NaiaChatStateSnapshot>>();
  const [mobileChatOpen, setMobileChatOpen] = useState(Boolean(intention));
  const [mobileResultsScrollY, setMobileResultsScrollY] = useState(0);

  // Cargar snapshot previo de estado de experiencia.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = sessionStorage.getItem(EXPLORE_STATE_KEY);
      if (!raw) return;

      const persisted = JSON.parse(raw) as ExplorePersistentState;
      if (persisted.filtros) setFiltros(persisted.filtros);
      if (persisted.sortBy) setSortBy(persisted.sortBy);
      if (typeof persisted.mobileChatOpen === 'boolean') setMobileChatOpen(persisted.mobileChatOpen);
      if (typeof persisted.mobileResultsScrollY === 'number') setMobileResultsScrollY(persisted.mobileResultsScrollY);
      if (persisted.selectedOfertaId) setSelectedOfertaId(persisted.selectedOfertaId);

      const recoveredChat = fromPersistedChatState(persisted.chat);
      if (recoveredChat) setChatState(recoveredChat);
    } catch {
      // noop
    }
  }, []);

  // Persistencia continua del estado.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const payload: ExplorePersistentState = {
      filtros,
      sortBy,
      totalOfertas,
      page,
      mobileChatOpen,
      mobileResultsScrollY,
      selectedOfertaId,
      chat: toPersistableChatState({
        messages: chatState?.messages || [],
        conversationId: chatState?.conversationId,
        scrollTop: chatState?.scrollTop || 0,
        lastQuestion: chatState?.lastQuestion || null,
        suggestedActions: chatState?.suggestedActions || []
      })
    };

    sessionStorage.setItem(EXPLORE_STATE_KEY, JSON.stringify(payload));
  }, [filtros, sortBy, totalOfertas, page, mobileChatOpen, mobileResultsScrollY, selectedOfertaId, chatState]);

  // Bloquear scroll del body cuando el chat móvil está abierto.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!mobileChatOpen) return;

    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobileChatOpen]);

  // Verificar datos y cargar ofertas iniciales.
  useEffect(() => {
    async function inicializar() {
      setLoading(true);
      const tieneDatos = await verificarDatosDemo();
      setHayDatos(tieneDatos);

      if (!tieneDatos) {
        setLoading(false);
        return;
      }

      const { ofertas: ofertasIniciales, total, hasMore: masResultados } = await obtenerOfertas(filtros, 0);
      setOfertas(ofertasIniciales);
      setTotalOfertas(total);
      setPage(0);
      setHasMore(masResultados);
      setLoading(false);
    }

    void inicializar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recargar ofertas cuando cambian filtros.
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

    void cargarOfertas();
  }, [filtros, hayDatos]);

  // Restituir oferta abierta si estaba en estado persistido.
  useEffect(() => {
    if (!selectedOfertaId || selectedOferta) return;
    const match = ofertas.find((x) => x.id === selectedOfertaId);
    if (match) setSelectedOferta(match);
  }, [selectedOfertaId, ofertas, selectedOferta]);

  // Guardar scroll de resultados en móvil.
  useEffect(() => {
    const container = mobileResultsRef.current;
    if (!container) return;

    const onScroll = () => {
      if (restoringResultsScrollRef.current) return;
      setMobileResultsScrollY(container.scrollTop);
    };

    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  // Restaurar scroll de resultados cuando se vuelve al listado móvil.
  useEffect(() => {
    const container = mobileResultsRef.current;
    if (!container || mobileChatOpen) return;

    restoringResultsScrollRef.current = true;
    container.scrollTo({ top: mobileResultsScrollY, behavior: 'auto' });
    requestAnimationFrame(() => {
      restoringResultsScrollRef.current = false;
    });
  }, [mobileChatOpen, mobileResultsScrollY]);

  const handleVerMas = async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    const siguientePagina = page + 1;
    const { ofertas: masOfertas, total, hasMore: masResultados } = await obtenerOfertas(
      filtros,
      siguientePagina
    );
    setOfertas((prev) => [...prev, ...masOfertas]);
    setTotalOfertas(total);
    setPage(siguientePagina);
    setHasMore(masResultados);
    setLoadingMore(false);
  };

  const handleFiltersDetected = (nuevosFiltros: FiltrosOferta) => {
    setFiltros((prev) => ({ ...prev, ...nuevosFiltros }));
  };

  const handleManualFiltersChange = (nuevosFiltros: FiltrosOferta) => {
    setFiltros(nuevosFiltros);
  };

  const handleRemoveFilter = (key: keyof FiltrosOferta) => {
    const newFiltros = { ...filtros };
    delete newFiltros[key];
    setFiltros(newFiltros);
  };

  const handleClearAllFilters = () => setFiltros({});

  const handleToggleMyList = (ofertaId: string) => {
    if (isInMyList(ofertaId)) removeFromMyList(ofertaId);
    else addToMyList(ofertaId);
  };

  const handleAbrirOferta = (oferta: OfertaAcademica) => {
    setSelectedOferta(oferta);
    setSelectedOfertaId(oferta.id);
  };

  const handleCerrarOferta = () => {
    // Limpiar también el id persistido: de lo contrario el efecto de
    // restitución (selectedOfertaId sin selectedOferta) vuelve a abrir la
    // ficha en un bucle que impide cerrarla.
    setSelectedOferta(null);
    setSelectedOfertaId(null);
  };

  const handleAplicacionCompletada = (resultado: any) => {
    const token = resultado?.demowapp?.token;
    if (typeof token === 'string' && token.length > 20) {
      setDemoToken(token);
      setMostrarDemoWapp(true);
      setSelectedOferta(null);
      setSelectedOfertaId(null);
    }
  };

  const abrirChatMobile = () => {
    if (typeof window !== 'undefined') {
      const fallbackScroll = mobileResultsRef.current?.scrollTop ?? window.scrollY;
      setMobileResultsScrollY(fallbackScroll);
    }
    setMobileChatOpen(true);
  };

  const irAResultadosMobile = () => {
    setMobileChatOpen(false);
  };

  const resumenEjecutivo = useMemo(
    () => construirResumenEjecutivoResultados(ofertas, totalOfertas),
    [ofertas, totalOfertas]
  );

  return (
    <div className="min-h-screen bg-buscoedu-bg">
      {/* Desktop */}
      <div className="hidden h-[calc(100vh-64px)] md:grid md:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.7fr)]">
        <div className="overflow-y-auto border-r border-buscoedu-border bg-white">
          <div className="h-[68%] min-h-[410px] border-b border-buscoedu-border">
            <NaiaChatPanel
              initialMessage={intention || undefined}
              initialState={chatState}
              onStateChange={setChatState}
              onFiltersDetected={handleFiltersDetected}
              onExploreCurrentFilter={() => undefined}
              className="h-full"
            />
          </div>

          <div className="p-4">
            <h3 className="mb-3 font-bold text-buscoedu-blue">Filtros</h3>
            <FilterPanel filtros={filtros} onFiltrosChange={handleManualFiltersChange} />
          </div>
        </div>

        <div className="flex flex-col overflow-y-auto">
          <ActiveFilterTags
            filtros={filtros}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAllFilters}
          />

          <div className="flex-1 p-6">
            <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-6 border-b border-buscoedu-border bg-buscoedu-bg px-6 pb-4 pt-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-buscoedu-teal">Resultados</p>
                  <h1 className="mb-2 text-2xl font-bold text-buscoedu-blue">Opciones que coinciden con tu búsqueda</h1>
                  <p className="text-sm text-buscoedu-muted">
                    {loading
                      ? 'Cargando resultados...'
                      : totalOfertas === 0
                        ? '0 resultados encontrados'
                        : `${totalOfertas} resultados encontrados · mostrando ${ofertas.length}`}
                  </p>
                </div>
                <SortControl value={sortBy} onChange={setSortBy} />
              </div>
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Las opciones mostradas coinciden con los criterios indicados. No constituyen una garantía de admisión, beca concedida ni disponibilidad de cupo.
              </p>
            </div>

            {!hayDatos ? (
              <div className="rounded-lg border border-buscoedu-border bg-white p-8 text-center">
                <p className="mb-2 font-semibold text-buscoedu-text">No hay ofertas visibles para este entorno</p>
                <p className="text-sm text-buscoedu-muted">
                  Verifica vigencia de fechas y políticas de lectura (RLS) para el rol anon/authenticated en Supabase.
                </p>
              </div>
            ) : loading ? (
              <div className="py-12 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-buscoedu-teal"></div>
                <p className="mt-4 text-buscoedu-muted">Cargando ofertas...</p>
              </div>
            ) : ofertas.length === 0 ? (
              <div className="rounded-lg border border-buscoedu-border bg-white p-8 text-center">
                <p className="mb-2 font-semibold text-buscoedu-text">No se encontraron resultados</p>
                <p className="text-sm text-buscoedu-muted">
                  Intenta ajustar tus filtros o pregúntale a NaIA por otras opciones.
                </p>
              </div>
            ) : (
              <>
                {resumenEjecutivo && (
                  <p className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-buscoedu-blue">
                    {resumenEjecutivo}
                  </p>
                )}
                <div className="grid auto-rows-max content-start items-start gap-4 md:grid-cols-3">
                  {ofertas.map((oferta) => (
                    <OfferCard
                      key={oferta.id}
                      oferta={oferta}
                      onCardClick={() => handleAbrirOferta(oferta)}
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
                      className="rounded-md border border-buscoedu-teal px-6 py-3 font-semibold text-buscoedu-teal transition-colors hover:bg-buscoedu-teal hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
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

      {/* Mobile */}
      <div className="md:hidden">
        {!mobileChatOpen && (
          <div ref={mobileResultsRef} className="h-[calc(100vh-64px)] overflow-y-auto">
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={abrirChatMobile}
                  className="rounded-lg bg-buscoedu-blue px-3 py-2 text-sm font-semibold text-white"
                >
                  Continuar con NaIA
                </button>
                <SortControl value={sortBy} onChange={setSortBy} />
              </div>

              <ActiveFilterTags
                filtros={filtros}
                onRemoveFilter={handleRemoveFilter}
                onClearAll={handleClearAllFilters}
              />

              <h1 className="mt-3 text-xl font-bold text-buscoedu-blue">Explorar opciones</h1>
              <p className="mb-4 text-sm text-buscoedu-muted">
                {loading
                  ? 'Cargando resultados...'
                  : totalOfertas === 0
                    ? '0 resultados encontrados'
                    : `${totalOfertas} resultados encontrados · mostrando ${ofertas.length}`}
              </p>

              <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Las opciones mostradas coinciden con tus criterios actuales.
              </p>

              {!hayDatos ? (
                <div className="rounded-lg border border-buscoedu-border bg-white p-6 text-center">
                  <p className="text-sm text-buscoedu-muted">
                    No hay ofertas visibles en este entorno. Revisa vigencia y políticas RLS para anon/authenticated.
                  </p>
                </div>
              ) : loading ? (
                <div className="py-12 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-buscoedu-teal"></div>
                  <p className="mt-4 text-buscoedu-muted">Cargando ofertas...</p>
                </div>
              ) : ofertas.length === 0 ? (
                <div className="rounded-lg border border-buscoedu-border bg-white p-6 text-center">
                  <p className="text-sm text-buscoedu-muted">No se encontraron resultados.</p>
                </div>
              ) : (
                <>
                  {resumenEjecutivo && (
                    <p className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-buscoedu-blue">
                      {resumenEjecutivo}
                    </p>
                  )}
                  <div className="space-y-3">
                    {ofertas.map((oferta) => (
                      <OfferCard
                        key={oferta.id}
                        oferta={oferta}
                        onCardClick={() => handleAbrirOferta(oferta)}
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
                        className="w-full rounded-md border border-buscoedu-teal px-6 py-3 font-semibold text-buscoedu-teal transition-colors hover:bg-buscoedu-teal hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loadingMore ? 'Cargando...' : 'Ver más resultados'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div
          className={`fixed inset-0 z-50 bg-white transition-transform duration-200 ${
            mobileChatOpen ? 'translate-y-0' : 'pointer-events-none translate-y-full'
          }`}
        >
          <div className="flex h-full flex-col">
            <NaiaChatPanel
              initialMessage={intention || undefined}
              initialState={chatState}
              onStateChange={setChatState}
              onFiltersDetected={handleFiltersDetected}
              onExploreCurrentFilter={irAResultadosMobile}
              showMobileExploreButton
              className="h-full"
            />
          </div>
        </div>
      </div>

      <OfferDetailModal
        oferta={selectedOferta}
        onClose={handleCerrarOferta}
        onAplicacionCompletada={handleAplicacionCompletada}
      />

      {demoToken && (
        <DemoWappModal
          token={demoToken}
          abierto={mostrarDemoWapp}
          autoOpenDelayMs={5000}
          onCerrar={() => setMostrarDemoWapp(false)}
        />
      )}
    </div>
  );
}

export default function ExplorarPage() {
  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-buscoedu-muted">Cargando experiencia de exploración...</div>}
    >
      <ExplorarPageContent />
    </Suspense>
  );
}
