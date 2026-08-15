"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getOrCreateVisitorId } from '@/src/lib/visitor';
import { trackNaiaModalOpened, trackSearchIntention } from '@/src/lib/events';

interface NaiaEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUGGESTIONS = [
  "Quiero encontrar una carrera.",
  "Busco una beca o descuento.",
  "Quiero estudiar virtual.",
  "No sé qué estudiar todavía.",
  "Quiero comparar universidades.",
];

export default function NaiaEntryModal({ isOpen, onClose }: NaiaEntryModalProps) {
  const [intention, setIntention] = useState('');
  const [showWarning, setShowWarning] = useState(false);
  const router = useRouter();

  // Inicializar visitante y registrar evento al abrir el modal
  useEffect(() => {
    if (isOpen) {
      getOrCreateVisitorId()
        .then(() => {
          trackNaiaModalOpened();
        })
        .catch(console.error);
    }
  }, [isOpen]);

  // Prevenir scroll del body cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleSearch = () => {
    const trimmedIntention = intention.trim();
    
    if (!trimmedIntention) {
      setShowWarning(true);
      return;
    }

    // Registrar evento de búsqueda
    trackSearchIntention(trimmedIntention);

    // Redirigir a /explorar con la intención como query param
    router.push(`/explorar?q=${encodeURIComponent(trimmedIntention)}`);

    // Cerrar el modal y limpiar el estado. Sin esto, si el usuario ya está en
    // /explorar la URL cambia pero el modal permanece abierto (parece que "no
    // pasa nada" hasta dar clic en la X).
    setIntention('');
    setShowWarning(false);
    onClose();
  };

  const handleSuggestionClick = (suggestion: string) => {
    setIntention(suggestion);
    setShowWarning(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="naia-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          className="bg-white rounded-lg shadow-card max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-buscoedu-border px-6 py-4 flex items-center justify-between">
            <div>
              <h2 id="naia-modal-title" className="text-2xl font-bold text-buscoedu-blue">
                Hola, soy NaIA
              </h2>
              <p className="text-sm text-buscoedu-muted">La asesora virtual de BuscoEdu</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-buscoedu-bg transition-colors"
              aria-label="Cerrar modal"
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

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Orientación */}
            <p className="text-buscoedu-text">
              Cuéntame qué te gustaría estudiar, dónde, en qué modalidad o qué tipo de beneficio buscas.
            </p>

            {/* Textarea */}
            <div>
              <label htmlFor="intention-input" className="sr-only">
                Describe tu intención de búsqueda
              </label>
              <textarea
                id="intention-input"
                value={intention}
                onChange={(e) => {
                  setIntention(e.target.value);
                  setShowWarning(false);
                }}
                onKeyDown={handleKeyPress}
                placeholder="Por ejemplo: Busco una maestría en administración, virtual, con beca..."
                rows={4}
                className="w-full px-4 py-3 border border-buscoedu-border rounded-lg focus:ring-2 focus:ring-buscoedu-blue focus:border-transparent resize-none"
              />
              {showWarning && (
                <p className="mt-2 text-sm text-amber-600">
                  Por favor, describe brevemente lo que buscas o elige una de las sugerencias.
                </p>
              )}
            </div>

            {/* Botón principal */}
            <button
              onClick={handleSearch}
              className="w-full bg-buscoedu-blue text-white px-6 py-3 rounded-lg font-semibold hover:bg-buscoedu-blue/90 transition-colors"
            >
              Buscar con NaIA
            </button>

            {/* Sugerencias */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-buscoedu-muted">
                O elige una sugerencia:
              </p>
              <div className="space-y-2">
                {SUGGESTIONS.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-4 py-3 border border-buscoedu-border rounded-lg hover:border-buscoedu-teal hover:bg-buscoedu-teal/5 transition-colors text-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
