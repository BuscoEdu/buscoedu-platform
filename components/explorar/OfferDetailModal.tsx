"use client";

import { useEffect, useRef, useState } from 'react';
import type { OfertaAcademica } from '@/src/lib/ofertas';
import { useMyList } from '@/src/contexts/MyListContext';
import { trackOfferOpened, trackOfferClosed, trackApplyAttempt } from '@/src/lib/events';
import AplicacionConsentimientoModal from '@/components/leadcenter/AplicacionConsentimientoModal';
import {
  getUniversityBorderColor,
  getUniversityColor,
  getUniversitySoftBgColor,
  getUniversityTextColor
} from '@/src/lib/university-colors';

interface OfferDetailModalProps {
  oferta: OfertaAcademica | null;
  onClose: () => void;
  onAplicacionCompletada?: (resultado: any) => void;
}

export default function OfferDetailModal({ oferta, onClose, onAplicacionCompletada }: OfferDetailModalProps) {
  const { isInMyList, addToMyList, removeFromMyList } = useMyList();
  const [mostrarAplicacion, setMostrarAplicacion] = useState(false);

  // Overlay de "solicitud enviada" con cuenta regresiva de cierre automático.
  const SEGUNDOS_CIERRE = 10;
  const [mostrarExito, setMostrarExito] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(SEGUNDOS_CIERRE);
  const resultadoAplicacionRef = useRef<any>(null);

  // Cierra el overlay de éxito y también la ficha de la oferta, notificando
  // al componente padre con el resultado de la aplicación.
  const cerrarConExito = () => {
    setMostrarExito(false);
    setSegundosRestantes(SEGUNDOS_CIERRE);
    onAplicacionCompletada?.(resultadoAplicacionRef.current);
    resultadoAplicacionRef.current = null;
    onClose();
  };

  // Cuenta regresiva: decrementa cada segundo mientras el overlay está visible.
  useEffect(() => {
    if (!mostrarExito) return;
    setSegundosRestantes(SEGUNDOS_CIERRE);
    const intervalo = setInterval(() => {
      setSegundosRestantes((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    // Limpieza obligatoria para evitar fugas de memoria (memory leaks).
    return () => clearInterval(intervalo);
  }, [mostrarExito]);

  // Cuando la cuenta llega a cero, cierra automáticamente el overlay y la ficha.
  useEffect(() => {
    if (mostrarExito && segundosRestantes === 0) {
      cerrarConExito();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarExito, segundosRestantes]);

  // Prevenir scroll del body cuando el modal está abierto y registrar eventos.
  useEffect(() => {
    if (oferta) {
      document.body.style.overflow = 'hidden';
      trackOfferOpened(oferta.id, oferta.programa_id, oferta.universidad_id);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      if (oferta) {
        trackOfferClosed(oferta.id);
      }
    };
  }, [oferta]);

  // Manejar tecla Escape para cierre accesible de la ficha.
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && oferta) {
        if (mostrarExito) {
          cerrarConExito();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oferta, onClose, mostrarExito]);

  if (!oferta) return null;

  const inMyList = isInMyList(oferta.id);
  const universidadNombre = oferta.universidad?.nombre ?? '';
  const universityColor = getUniversityColor(oferta.universidad_id, universidadNombre);
  const universityBorderColor = getUniversityBorderColor(oferta.universidad_id, universidadNombre);
  const universitySoftBg = getUniversitySoftBgColor(oferta.universidad_id, universidadNombre);
  const universityTextColor = getUniversityTextColor(oferta.universidad_id, universidadNombre);
  const universityInitial = universidadNombre ? universidadNombre.charAt(0).toUpperCase() : 'U';

  const handleToggleMyList = () => {
    if (inMyList) {
      removeFromMyList(oferta.id);
    } else {
      addToMyList(oferta.id);
    }
  };

  const handleApplyClick = () => {
    if (oferta) {
      trackApplyAttempt(oferta.id, oferta.programa_id, oferta.universidad_id);
    }
    setMostrarAplicacion(true);
  };

  return (
    <>
      {/* Overlay oscuro para enfoque y cierre con clic externo. */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal centrado que nunca excede el ancho del viewport en móvil ni desktop. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-2 sm:p-4"
      >
        <div
          className="my-4 w-full min-w-0 max-w-[calc(100vw-1rem)] overflow-x-hidden rounded-lg border-t-4 bg-white shadow-2xl sm:my-8 sm:max-w-3xl xl:max-w-4xl"
          style={{ borderTopColor: universityBorderColor }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header fijo con textos truncables para evitar desbordes horizontales. */}
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-buscoedu-border bg-white px-4 py-4 sm:px-6">
            <div className="min-w-0 flex-1 pr-1 sm:pr-4">
              <h2 id="detail-modal-title" className="break-words text-xl font-bold text-buscoedu-blue sm:text-2xl">
                {oferta.programa?.nombre || oferta.nombre}
              </h2>
              <div className="mt-2 flex min-w-0 items-center gap-2">
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ backgroundColor: universityColor, color: universityTextColor }}
                  aria-hidden="true"
                >
                  {universityInitial}
                </span>
                <p
                  className="min-w-0 break-words rounded-md px-2 py-1 text-sm"
                  style={{ backgroundColor: universitySoftBg, color: universityBorderColor }}
                >
                  {oferta.universidad?.nombre}
                  {oferta.sede?.nombre && ` • ${oferta.sede.nombre}`}
                  {oferta.sede?.ciudad && ` • ${oferta.sede.ciudad}`}
                  {oferta.sede?.pais && `, ${oferta.sede.pais}`}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {oferta.programa?.nivel_academico && (
                  <span className="inline-block rounded bg-buscoedu-blue/10 px-2 py-1 text-xs font-medium text-buscoedu-blue break-words">
                    {oferta.programa.nivel_academico}
                  </span>
                )}
                {oferta.programa?.modalidad && (
                  <span className="inline-block rounded bg-buscoedu-teal/10 px-2 py-1 text-xs font-medium text-buscoedu-teal break-words">
                    {oferta.programa.modalidad}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-10 w-10 shrink-0 rounded-full transition-colors hover:bg-buscoedu-bg"
              aria-label="Cerrar ficha"
            >
              <svg
                className="h-6 w-6 text-buscoedu-text"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Contenido con break-words y overflow controlado para evitar scroll lateral. */}
          <div className="max-h-[calc(100dvh-16rem)] space-y-6 overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-6">
            {oferta.descripcion && (
              <section>
                <h3 className="mb-3 text-lg font-bold text-buscoedu-blue">Información académica</h3>
                <div className="space-y-2 text-sm">
                  <p className="break-words leading-relaxed text-buscoedu-text">{oferta.descripcion}</p>

                  {oferta.programa?.duracion && (
                    <p className="break-words">
                      <span className="font-semibold text-buscoedu-text">Duración:</span>{' '}
                      <span className="text-buscoedu-muted">{oferta.programa.duracion}</span>
                    </p>
                  )}
                </div>
              </section>
            )}

            {oferta.beneficios && oferta.beneficios.length > 0 && (
              <section>
                <h3 className="mb-3 text-lg font-bold text-buscoedu-blue">Oferta y beneficios</h3>
                <div className="space-y-3">
                  {oferta.beneficios.map((beneficio, index) => (
                    <div key={index} className="rounded-lg bg-buscoedu-bg p-4">
                      <p className="mb-1 break-words font-semibold text-buscoedu-blue">{beneficio.tipo}</p>
                      {beneficio.descripcion && (
                        <p className="break-words text-sm text-buscoedu-muted">{beneficio.descripcion}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-2 text-lg font-bold text-buscoedu-blue">Precios y condiciones</h3>
              <p className="break-words text-sm text-amber-800">
                Los precios específicos se consultarán directamente con la universidad. La información mostrada es orientativa y puede variar según condiciones, periodos y validaciones de la institución.
              </p>
            </section>

            <section>
              <h3 className="mb-3 text-lg font-bold text-buscoedu-blue">Requisitos de acceso</h3>
              <p className="mb-2 break-words text-sm text-buscoedu-muted">
                Los requisitos específicos del programa y de la oferta se confirman con la institución educativa.
              </p>
              <p className="rounded bg-buscoedu-bg p-3 text-xs italic text-buscoedu-muted break-words">
                La revisión definitiva de requisitos corresponde a la institución.
              </p>
            </section>

            {oferta.cupos_disponibles !== undefined && oferta.cupos_disponibles !== null && (
              <section>
                <h3 className="mb-2 text-lg font-bold text-buscoedu-blue">Disponibilidad</h3>
                <p className="break-words text-sm text-buscoedu-text">
                  <span className="font-semibold">Cupos disponibles:</span> {oferta.cupos_disponibles}
                </p>
              </section>
            )}
          </div>

          {/* Acciones finales con anchos fluidos para no romper en pantallas angostas. */}
          <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-buscoedu-border bg-white px-4 py-4 sm:px-6">
            <button
              onClick={handleToggleMyList}
              className={`min-w-0 flex-1 rounded-lg border-2 px-4 py-3 font-semibold transition-colors sm:min-w-[200px] sm:px-6 ${
                inMyList
                  ? 'border-red-600 bg-red-50 text-red-600 hover:bg-red-100'
                  : 'border-buscoedu-blue bg-white text-buscoedu-blue hover:bg-buscoedu-blue/5'
              }`}
            >
              {inMyList ? 'Quitar de Mi lista' : 'Guardar en Mi lista'}
            </button>

            <button
              onClick={handleApplyClick}
              className="min-w-0 flex-1 rounded-lg bg-buscoedu-teal px-4 py-3 font-semibold text-white transition-colors hover:bg-buscoedu-teal/90 sm:min-w-[200px] sm:px-6"
            >
              Aplicar a beca
            </button>
          </div>
        </div>
      </div>

      {mostrarAplicacion && oferta && (
        <AplicacionConsentimientoModal
          ofertaId={oferta.id}
          ofertaNombre={oferta.nombre || (oferta as any).nombre_oferta || 'Oferta'}
          modeloNegocio={(oferta as any).modelo_negocio ?? null}
          onCerrar={() => setMostrarAplicacion(false)}
          onConvertido={(resultado) => {
            // No cerramos la ficha de inmediato: mostramos el overlay de éxito
            // con cuenta regresiva. El cierre real ocurre en cerrarConExito().
            setMostrarAplicacion(false);
            resultadoAplicacionRef.current = resultado;
            setMostrarExito(true);
          }}
        />
      )}

      {/* Overlay de solicitud enviada con cuenta regresiva. */}
      {mostrarExito && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exito-titulo"
        >
          <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 text-center shadow-2xl">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-12 w-12 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h2 id="exito-titulo" className="mb-2 text-2xl font-bold text-buscoedu-blue">
              ¡Tu solicitud fue enviada exitosamente!
            </h2>
            <p className="mb-6 break-words text-buscoedu-muted">
              {oferta.programa?.nombre || oferta.nombre}
            </p>

            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-buscoedu-bg">
              <div
                className="h-full rounded-full bg-buscoedu-teal transition-all duration-1000 ease-linear"
                style={{ width: `${(segundosRestantes / SEGUNDOS_CIERRE) * 100}%` }}
              />
            </div>

            <p className="mb-6 text-sm text-buscoedu-muted">
              Cerrando en {segundosRestantes} segundo{segundosRestantes === 1 ? '' : 's'}...
            </p>

            <button
              onClick={cerrarConExito}
              className="w-full rounded-lg bg-buscoedu-teal px-6 py-3 font-semibold text-white transition-colors hover:bg-buscoedu-teal/90"
            >
              Cerrar ahora
            </button>
          </div>
        </div>
      )}
    </>
  );
}
