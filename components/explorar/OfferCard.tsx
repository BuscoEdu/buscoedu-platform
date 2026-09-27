"use client";

import type { OfertaAcademica } from '@/src/lib/ofertas';
import {
  getUniversityBorderColor,
  getUniversityColor,
  getUniversityTextColor
} from '@/src/lib/university-colors';

interface OfferCardProps {
  oferta: OfertaAcademica;
  onCardClick: () => void;
  isInMyList?: boolean;
  onToggleMyList: () => void;
}

function tituloSinDuplicado(valor?: string): string {
  const titulo = (valor || '').trim().replace(/\s+/g, ' ');
  if (!titulo) return 'Programa por confirmar';
  const palabras = titulo.split(' ');
  if (palabras.length % 2 !== 0) return titulo;
  const mitad = palabras.length / 2;
  const primera = palabras.slice(0, mitad).join(' ');
  const segunda = palabras.slice(mitad).join(' ');
  return primera.localeCompare(segunda, 'es', { sensitivity: 'base' }) === 0 ? primera : titulo;
}

function textoVisible(valor?: string | null): string {
  return (valor ?? '').trim();
}

/**
 * BA-016: si el dato no vino en la oferta, se muestra un placeholder honesto.
 * Nunca una etiqueta con el valor en blanco.
 */
function valorOPorConfirmar(valor: string, placeholder: string): string {
  return valor || placeholder;
}

export default function OfferCard({ oferta, onCardClick, isInMyList = false, onToggleMyList }: OfferCardProps) {
  const nombreUniversidad = textoVisible(oferta.universidad?.nombre);
  const universityNameOrSlug = nombreUniversidad;
  const universityColor = getUniversityColor(oferta.universidad_id, universityNameOrSlug);
  const universityBorderColor = getUniversityBorderColor(oferta.universidad_id, universityNameOrSlug);
  const universityTextColor = getUniversityTextColor(oferta.universidad_id, universityNameOrSlug);
  const tituloPrograma = tituloSinDuplicado(oferta.programa?.nombre || oferta.nombre);
  const nombreSede = textoVisible(oferta.sede?.nombre);
  const etiquetaGuardar = isInMyList ? 'Quitar de Mi lista' : 'Guardar en Mi lista';

  const nivelModalidad = [textoVisible(oferta.programa?.nivel_academico), textoVisible(oferta.programa?.modalidad)]
    .filter(Boolean)
    .join(' • ');
  const ubicacion = [textoVisible(oferta.sede?.ciudad), textoVisible(oferta.sede?.pais)].filter(Boolean).join(', ');
  const area = textoVisible(oferta.programa?.area);
  const duracion = textoVisible(oferta.programa?.duracion);
  const beneficio = textoVisible(oferta.beneficios?.[0]?.tipo) || textoVisible(oferta.tipo_beneficio);

  // Campos de decisión. Los dos primeros siempre se ven, con placeholder si faltan.
  const fields = [
    {
      label: 'Nivel y modalidad',
      value: valorOPorConfirmar(nivelModalidad, 'Por confirmar')
    },
    {
      label: 'Ubicación',
      value: valorOPorConfirmar(ubicacion, 'Por confirmar')
    },
    area
      ? {
          label: 'Área',
          value: area
        }
      : null,
    duracion
      ? {
          label: 'Duración',
          value: duracion
        }
      : null,
    beneficio
      ? {
          label: 'Beneficio',
          value: beneficio
        }
      : null
  ].filter((field): field is { label: string; value: string } => Boolean(field && field.value)).slice(0, 5);

  const lineaInstitucion = [nombreUniversidad || 'Institución por confirmar', nombreSede].filter(Boolean).join(' • ');

  return (
    <article
      className="self-start h-fit bg-white border border-buscoedu-border border-l-4 rounded-lg overflow-hidden hover:shadow-card transition-shadow cursor-pointer"
      style={{ borderLeftColor: universityBorderColor }}
    >
      {/* Imagen o placeholder de institución */}
      <div className="relative h-40 bg-gradient-to-br from-buscoedu-blue/10 to-buscoedu-teal/10" onClick={onCardClick}>
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-4">
              <div
                className="w-16 h-16 mx-auto rounded-full flex items-center justify-center font-bold text-2xl"
                style={{ backgroundColor: universityColor, color: universityTextColor }}
              >
                {(nombreUniversidad || 'I').charAt(0).toUpperCase()}
              </div>
              <p className="mt-2 text-xs text-buscoedu-muted font-medium line-clamp-2">
                {nombreUniversidad || 'Institución por confirmar'}
              </p>
            </div>
          </div>

        {/* BA-010: guardar en la lista local. No envía datos ni contacta a la universidad. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMyList();
          }}
          className="absolute top-3 right-3 w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:scale-110 transition-transform"
          aria-label={etiquetaGuardar}
          aria-pressed={isInMyList}
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
        <h3 className="font-bold text-buscoedu-blue mb-1 line-clamp-2 text-base">
          {tituloPrograma}
        </h3>

        <p className="text-sm text-buscoedu-muted mb-3">
          {lineaInstitucion}
        </p>

        <div className="space-y-2">
          {fields.map((field) => (
            <div key={field.label} className="text-sm">
              <span className="text-buscoedu-muted">{field.label}:</span>{' '}
              <span className={`font-medium ${field.value === 'Por confirmar' ? 'text-buscoedu-muted' : 'text-buscoedu-text'}`}>
                {field.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMyList();
          }}
          className={`inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors ${
            isInMyList
              ? 'border-red-600 bg-red-50 text-red-600 hover:bg-red-100'
              : 'border-buscoedu-blue bg-white text-buscoedu-blue hover:bg-buscoedu-blue/5'
          }`}
          aria-pressed={isInMyList}
        >
          {etiquetaGuardar}
        </button>
      </div>
    </article>
  );
}
