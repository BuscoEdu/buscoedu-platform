"use client";

import { useEffect, useRef, useState } from 'react';
import type { OfertaAcademica } from '@/src/lib/ofertas';
import { useMyList } from '@/src/contexts/MyListContext';
import { trackOfferOpened, trackOfferClosed, trackApplyAttempt } from '@/src/lib/events';
import AplicacionConsentimientoModal from '@/components/leadcenter/AplicacionConsentimientoModal';
import PillButton from '@/components/restyle/PillButton';
import { etiquetaBeneficio } from '@/src/lib/etiquetas-beneficio';

function fechaLegible(iso?: string): string | null {
  const valor = (iso ?? '').trim();
  if (!valor) return null;
  const fecha = new Date(valor.length === 10 ? `${valor}T00:00:00` : valor);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(fecha);
}

interface OfferDetailModalProps {
  oferta: OfertaAcademica | null;
  onClose: () => void;
  onAplicacionCompletada?: (resultado: any) => void;
}

export default function OfferDetailModal({ oferta, onClose, onAplicacionCompletada }: OfferDetailModalProps) {
  const { isInMyList, addToMyList, removeFromMyList } = useMyList();
  const [mostrarAplicacion, setMostrarAplicacion] = useState(false);
  /* Feedback de Guardar, distinto del de Aplicar y del de Autorizar contacto. */
  const [avisoLista, setAvisoLista] = useState<string | null>(null);

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
  // BA-016: un nombre vacío no se pinta como blanco; se dice que falta el dato.
  const universidadNombre = (oferta.universidad?.nombre ?? '').trim();
  const tituloPrograma = (oferta.programa?.nombre || oferta.nombre || '').trim() || 'Programa por confirmar';
  const ciudadSede = (oferta.sede?.ciudad ?? '').trim();
  const modalidadPrograma = (oferta.programa?.modalidad ?? '').trim();
  const meta = [universidadNombre, modalidadPrograma, ciudadSede].filter(Boolean).join(' · ');
  const vigenciaHasta = fechaLegible(oferta.vigente_hasta);
  /*
    La sección existe solo si el helper devuelve etiqueta. El código que se
    le pasa es tipo_beneficio (con guion bajo). El tipo ya aplanado a espacios
    no es el código y no se pinta. Una descripción que no es el código sí.
  */
  const etiquetaBeneficioVisible = etiquetaBeneficio(oferta.tipo_beneficio);
  const codigoBeneficio = (oferta.tipo_beneficio ?? '').trim().toLowerCase();
  const notasBeneficio = etiquetaBeneficioVisible
    ? (oferta.beneficios ?? [])
        .map((beneficio) => (beneficio.descripcion ?? '').trim())
        .filter((texto) => {
          if (!texto) return false;
          const norm = texto.toLowerCase();
          return (
            norm !== etiquetaBeneficioVisible.toLowerCase() &&
            norm !== codigoBeneficio &&
            norm !== codigoBeneficio.replaceAll('_', ' ')
          );
        })
    : [];

  const handleToggleMyList = () => {
    if (inMyList) {
      removeFromMyList(oferta.id);
      setAvisoLista('Quitado de Mi lista');
    } else {
      addToMyList(oferta.id);
      setAvisoLista('Guardado en Mi lista');
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
      {/*
        BA-001: la ficha va por encima del panel de resultados móvil (z-[70])
        y del FAB. Ola 2: jerarquía qué es → vigencia (si hay fecha) → becas → acciones.
        No se pinta precio: la oferta no trae ese campo. Un dato ausente no se inventa.
        «Becas y beneficios» solo si etiquetaBeneficio() devuelve una etiqueta.
      */}
      <div
        className="fixed inset-0 z-[80] bg-[var(--color-text)]/50"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-modal-title"
        className="fixed inset-0 z-[80] flex items-end justify-center overflow-hidden p-2 sm:items-center sm:overflow-y-auto sm:p-4"
      >
        <div
          className="my-0 flex max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[var(--radius-card)] border-2 border-[var(--color-text)] bg-[var(--color-bg)] shadow-[var(--shadow-hard)] sm:my-8 sm:max-h-[calc(100dvh-2rem)] sm:max-w-5xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-end px-4 pt-3 sm:px-6">
            <button
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--color-text)] bg-white text-[var(--color-text)]"
              aria-label="Cerrar"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="a2-fab-safe min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 sm:px-6 md:pb-6">
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-4">
                <div>
                  <span className="inline-flex rounded-full bg-[var(--color-band)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text)]">
                    Aliada
                  </span>
                  <h2 id="detail-modal-title" className="mt-3 break-words font-display text-[34px] leading-[1.05] text-[var(--color-text)] sm:text-[44px]">
                    {tituloPrograma}
                  </h2>
                  {meta ? <p className="mt-2 break-words text-sm text-[var(--color-muted)]">{meta}</p> : null}
                </div>

                {oferta.descripcion ? (
                  <section className="rounded-[var(--radius-card)] border-2 border-[var(--color-text)] bg-white p-4 shadow-[var(--shadow-hard)]">
                    <h3 className="text-lg font-bold text-[var(--color-text)]">Qué es</h3>
                    <p className="mt-2 break-words text-sm leading-relaxed text-[var(--color-text)]">{oferta.descripcion}</p>
                    {oferta.programa?.duracion ? (
                      <p className="mt-2 break-words text-sm text-[var(--color-muted)]">Duración: {oferta.programa.duracion}</p>
                    ) : null}
                  </section>
                ) : null}

                {vigenciaHasta ? (
                  <section className="rounded-[var(--radius-card)] border-2 border-[var(--color-text)] bg-white p-4 shadow-[var(--shadow-hard)]">
                    <h3 className="text-lg font-bold text-[var(--color-text)]">Vigencia</h3>
                    <p className="mt-2 text-sm text-[var(--color-text)]">Vigente hasta {vigenciaHasta}</p>
                  </section>
                ) : null}

                {etiquetaBeneficioVisible ? (
                  <section className="rounded-[var(--radius-card)] border-2 border-[var(--color-text)] bg-white p-4 shadow-[var(--shadow-hard)]">
                    <h3 className="text-lg font-bold text-[var(--color-text)]">Becas y beneficios</h3>
                    <p className="mt-2 break-words text-sm font-semibold text-[var(--color-text)]">{etiquetaBeneficioVisible}</p>
                    {notasBeneficio.length > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {notasBeneficio.map((nota) => (
                          <li key={nota} className="break-words text-sm text-[var(--color-muted)]">
                            {nota}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ) : null}

                {oferta.cupos_disponibles !== undefined && oferta.cupos_disponibles !== null ? (
                  <p className="break-words text-sm text-[var(--color-text)]">
                    Cupos disponibles: {oferta.cupos_disponibles}
                  </p>
                ) : null}
              </div>

              {/*
                D2: Aplicar es índigo. Guardar en Mi lista es contorno.
                Autorizar contacto no está en esta tarjeta: es el paso de consentimiento.
              */}
              <section className="rounded-[var(--radius-card)] border-2 border-[var(--color-text)] bg-white p-4 shadow-[var(--shadow-hard)] lg:sticky lg:top-0">
                <h3 className="text-lg font-bold text-[var(--color-text)]">¿Qué quieres hacer?</h3>
                <div className="mt-4 flex flex-col gap-3">
                  <PillButton type="button" onClick={handleApplyClick} className="w-full">
                    Aplicar
                  </PillButton>
                  <PillButton type="button" variant="secondary" onClick={handleToggleMyList} className="w-full" aria-pressed={inMyList}>
                    {inMyList ? 'Quitar de Mi lista' : 'Guardar en Mi lista'}
                  </PillButton>
                </div>
                {avisoLista ? (
                  <p className="mt-3 text-sm font-semibold text-[var(--color-success)]" role="status">
                    {avisoLista}
                  </p>
                ) : null}
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
                  Guardar no envía tus datos. Aplicar no autoriza el contacto: eso es un paso aparte.
                </p>
              </section>
            </div>
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
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

            <h2 id="exito-titulo" className="mb-2 text-2xl font-bold text-[var(--color-text)]">
              Autorización registrada
            </h2>
            <p className="mb-6 break-words text-[var(--color-muted)]">
              Tu solicitud quedó enviada para {oferta.programa?.nombre || oferta.nombre}. Esto no es lo mismo que guardarla en Mi lista.
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
              className="w-full rounded-full border-2 border-[var(--color-text)] bg-[var(--color-primary)] px-6 py-3 font-bold text-white"
            >
              Cerrar ahora
            </button>
          </div>
        </div>
      )}
    </>
  );
}
