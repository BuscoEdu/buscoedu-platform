"use client";

import { useState } from 'react';
import type { OfertaAcademica } from '@/src/lib/ofertas';
import { getUniversityColor } from '@/src/lib/university-colors';

interface OfferCardProps {
  oferta: OfertaAcademica;
  onCardClick: () => void;
  isInMyList?: boolean;
  onToggleMyList: () => void;
}

export default function OfferCard({ oferta, onCardClick, isInMyList = false, onToggleMyList }: OfferCardProps) {
  const [imageError, setImageError] = useState(false);
  const universityNameOrSlug = oferta.universidad?.nombre ?? '';
  const universityColor = getUniversityColor(universityNameOrSlug);

  // Información para mostrar (máximo 5 campos)
  const fields = [
    {
      label: 'Nivel y modalidad',
      value: [oferta.programa?.nivel_academico, oferta.programa?.modalidad].filter(Boolean).join(' • ')
    },
    {
      label: 'Ubicación',
      value: [oferta.sede?.ciudad, oferta.sede?.pais].filter(Boolean).join(', ')
    },
    oferta.programa?.duracion && {
      label: 'Duración',
      value: oferta.programa.duracion
    },
    oferta.beneficios && oferta.beneficios.length > 0 && {
      label: 'Beneficio',
      value: oferta.beneficios[0].tipo
    }
  ].filter(Boolean).slice(0, 5);

  return (
    <article
      className="self-start h-fit bg-white border border-buscoedu-border rounded-lg overflow-hidden hover:shadow-card transition-shadow cursor-pointer"
    >
      {/* Imagen o placeholder */}
      <div className="relative h-40 bg-gradient-to-br from-buscoedu-blue/10 to-buscoedu-teal/10" onClick={onCardClick}>
        {!imageError && oferta.universidad?.nombre && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-4">
              <div 
                className="w-16 h-16 mx-auto rounded-full flex items-center justify-center text-white font-bold text-2xl"
                style={{ backgroundColor: universityColor }}
              >
                {oferta.universidad.nombre.charAt(0).toUpperCase()}
              </div>
              <p className="mt-2 text-xs text-buscoedu-muted font-medium line-clamp-2">
                {oferta.universidad.nombre}
              </p>
            </div>
          </div>
        )}
        
        {/* Botón corazón */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMyList();
          }}
          className="absolute top-3 right-3 w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:scale-110 transition-transform"
          aria-label={isInMyList ? 'Quitar de Mi lista' : 'Guardar en Mi lista'}
        >
          <svg
            className={`w-6 h-6 ${isInMyList ? 'fill-red-500 stroke-red-500' : 'fill-none stroke-buscoedu-text'}`}
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        </button>
      </div>

      {/* Contenido */}
      <div className="p-4" onClick={onCardClick}>
        {/* Título */}
        <h3 className="font-bold text-buscoedu-blue mb-1 line-clamp-2 text-base">
          {oferta.programa?.nombre || oferta.nombre}
        </h3>
        
        <p className="text-sm text-buscoedu-muted mb-3">
          {oferta.universidad?.nombre}
          {oferta.sede?.nombre && ` • ${oferta.sede.nombre}`}
        </p>

        {/* Campos de decisión (máximo 5) */}
        <div className="space-y-2">
          {fields.map((field: any, index) => (
            field && (
              <div key={index} className="text-sm">
                <span className="text-buscoedu-muted">{field.label}:</span>{' '}
                <span className="text-buscoedu-text font-medium">{field.value}</span>
              </div>
            )
          ))}
        </div>
      </div>
    </article>
  );
}
