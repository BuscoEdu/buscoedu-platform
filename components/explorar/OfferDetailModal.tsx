"use client";

import { useEffect, useState } from 'react';
import type { OfertaAcademica } from '@/src/lib/ofertas';
import { useMyList } from '@/src/contexts/MyListContext';
import { trackOfferOpened, trackOfferClosed, trackApplyAttempt } from '@/src/lib/events';
import AplicacionConsentimientoModal from '@/components/leadcenter/AplicacionConsentimientoModal';
interface OfferDetailModalProps {
  oferta: OfertaAcademica | null;
  onClose: () => void;
  onAplicacionCompletada?: (resultado: any) => void;
}

export default function OfferDetailModal({ oferta, onClose, onAplicacionCompletada }: OfferDetailModalProps) {
  const { isInMyList, addToMyList, removeFromMyList } = useMyList();
  const [mostrarAplicacion, setMostrarAplicacion] = useState(false);

  // Prevenir scroll del body cuando el modal está abierto y registrar eventos
  useEffect(() => {
    if (oferta) {
      document.body.style.overflow = 'hidden';
      // Registrar apertura de ficha
      trackOfferOpened(oferta.id, oferta.programa_id, oferta.universidad_id);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      // Registrar cierre de ficha si había una oferta abierta
      if (oferta) {
        trackOfferClosed(oferta.id);
      }
    };
  }, [oferta]);

  // Manejar tecla Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && oferta) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [oferta, onClose]);

  if (!oferta) return null;

  const inMyList = isInMyList(oferta.id);

  const handleToggleMyList = () => {
    if (inMyList) {
      removeFromMyList(oferta.id);
    } else {
      addToMyList(oferta.id);
    }
  };

  const handleApplyClick = () => {
    // Registrar intento de aplicación (evento existente, intacto).
    if (oferta) {
      trackApplyAttempt(oferta.id, oferta.programa_id, oferta.universidad_id);
    }
    // Abrir el flujo consent-first de aplicación (identidad + consentimientos + conversión).
    setMostrarAplicacion(true);
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      >
        <div
          className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header fijo */}
          <div className="sticky top-0 bg-white border-b border-buscoedu-border px-6 py-4 flex items-start justify-between z-10">
            <div className="flex-1 pr-4">
              <h2 id="detail-modal-title" className="text-2xl font-bold text-buscoedu-blue mb-1">
                {oferta.programa?.nombre || oferta.nombre}
              </h2>
              <p className="text-sm text-buscoedu-muted">
                {oferta.universidad?.nombre}
                {oferta.sede?.nombre && ` • ${oferta.sede.nombre}`}
                {oferta.sede?.ciudad && ` • ${oferta.sede.ciudad}`}
                {oferta.sede?.pais && `, ${oferta.sede.pais}`}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {oferta.programa?.nivel_academico && (
                  <span className="inline-block px-2 py-1 bg-buscoedu-blue/10 text-buscoedu-blue text-xs font-medium rounded">
                    {oferta.programa.nivel_academico}
                  </span>
                )}
                {oferta.programa?.modalidad && (
                  <span className="inline-block px-2 py-1 bg-buscoedu-teal/10 text-buscoedu-teal text-xs font-medium rounded">
                    {oferta.programa.modalidad}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-buscoedu-bg transition-colors flex-shrink-0"
              aria-label="Cerrar ficha"
            >
              <svg
                className="w-6 h-6 text-buscoedu-text"
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

          {/* Contenido */}
          <div className="px-6 py-6 space-y-6">
            {/* Información académica */}
            {oferta.descripcion && (
              <section>
                <h3 className="text-lg font-bold text-buscoedu-blue mb-3">Información académica</h3>
                <div className="space-y-2 text-sm">
                  <p className="text-buscoedu-text leading-relaxed">{oferta.descripcion}</p>
                  
                  {oferta.programa?.duracion && (
                    <p>
                      <span className="font-semibold text-buscoedu-text">Duración:</span>{' '}
                      <span className="text-buscoedu-muted">{oferta.programa.duracion}</span>
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Oferta y beneficios */}
            {oferta.beneficios && oferta.beneficios.length > 0 && (
              <section>
                <h3 className="text-lg font-bold text-buscoedu-blue mb-3">Oferta y beneficios</h3>
                <div className="space-y-3">
                  {oferta.beneficios.map((beneficio, index) => (
                    <div key={index} className="bg-buscoedu-bg p-4 rounded-lg">
                      <p className="font-semibold text-buscoedu-blue mb-1">{beneficio.tipo}</p>
                      {beneficio.descripcion && (
                        <p className="text-sm text-buscoedu-muted">{beneficio.descripcion}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Precios y condiciones */}
            <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="text-lg font-bold text-buscoedu-blue mb-2">Precios y condiciones</h3>
              <p className="text-sm text-amber-800">
                Los precios específicos se consultarán directamente con la universidad. La información mostrada es orientativa y puede variar según condiciones, periodos y validaciones de la institución.
              </p>
            </section>

            {/* Requisitos de acceso */}
            <section>
              <h3 className="text-lg font-bold text-buscoedu-blue mb-3">Requisitos de acceso</h3>
              <p className="text-sm text-buscoedu-muted mb-2">
                Los requisitos específicos del programa y de la oferta se confirman con la institución educativa.
              </p>
              <p className="text-xs text-buscoedu-muted italic bg-buscoedu-bg p-3 rounded">
                La revisión definitiva de requisitos corresponde a la institución.
              </p>
            </section>

            {/* Cupos disponibles (solo si están publicados) */}
            {oferta.cupos_disponibles !== undefined && oferta.cupos_disponibles !== null && (
              <section>
                <h3 className="text-lg font-bold text-buscoedu-blue mb-2">Disponibilidad</h3>
                <p className="text-sm text-buscoedu-text">
                  <span className="font-semibold">Cupos disponibles:</span> {oferta.cupos_disponibles}
                </p>
              </section>
            )}
          </div>

          {/* Acciones finales */}
          <div className="sticky bottom-0 bg-white border-t border-buscoedu-border px-6 py-4 flex flex-wrap gap-3">
            <button
              onClick={handleToggleMyList}
              className={`flex-1 min-w-[200px] px-6 py-3 rounded-lg font-semibold transition-colors ${
                inMyList
                  ? 'bg-red-50 text-red-600 border-2 border-red-600 hover:bg-red-100'
                  : 'bg-white text-buscoedu-blue border-2 border-buscoedu-blue hover:bg-buscoedu-blue/5'
              }`}
            >
              {inMyList ? 'Quitar de Mi lista' : 'Guardar en Mi lista'}
            </button>

            <button
              onClick={handleApplyClick}
              className="flex-1 min-w-[200px] bg-buscoedu-teal text-white px-6 py-3 rounded-lg font-semibold hover:bg-buscoedu-teal/90 transition-colors"
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
            setMostrarAplicacion(false);
            onAplicacionCompletada?.(resultado);
            onClose();
          }}
        />
      )}
    </>
  );
}
