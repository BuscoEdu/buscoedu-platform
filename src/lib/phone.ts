/**
 * Normalización de teléfonos a formato E.164 (p. ej. +573001234567).
 *
 * Implementación ligera sin dependencias externas, orientada a los países
 * objetivo de BuscoEdu (Colombia por defecto). No pretende cubrir todos los
 * planes de numeración del mundo: valida longitud y prefijo razonables y deja
 * registrado el país usado para normalizar (trazabilidad → personas.pais_celular).
 */

export interface NormalizedPhone {
  e164: string;
  pais: string; // ISO-2 aproximado del código usado
  valido: boolean;
  motivo?: string;
}

// Códigos de país soportados (prefijo E.164 -> ISO2 + longitud nacional esperada)
const PAISES: Record<string, { iso2: string; longitudes: number[] }> = {
  '57': { iso2: 'CO', longitudes: [10] }, // Colombia (celular: 3XXXXXXXXX)
  '52': { iso2: 'MX', longitudes: [10] }, // México
  '51': { iso2: 'PE', longitudes: [9] }, // Perú
  '56': { iso2: 'CL', longitudes: [9] }, // Chile
  '593': { iso2: 'EC', longitudes: [9, 10] }, // Ecuador
  '58': { iso2: 'VE', longitudes: [10] }, // Venezuela
  '507': { iso2: 'PA', longitudes: [8] }, // Panamá
  '1': { iso2: 'US', longitudes: [10] } // US/CA
};

/**
 * Normaliza un número a E.164. Si no trae prefijo internacional, aplica el
 * código por defecto (Colombia: 57).
 */
export function normalizarE164(
  entrada: string,
  codigoPaisPorDefecto = '57'
): NormalizedPhone {
  if (!entrada || typeof entrada !== 'string') {
    return { e164: '', pais: '', valido: false, motivo: 'Número vacío' };
  }

  // Deja solo dígitos y un posible '+' inicial.
  const tienePlus = entrada.trim().startsWith('+');
  let digitos = entrada.replace(/[^\d]/g, '');

  if (!digitos) {
    return { e164: '', pais: '', valido: false, motivo: 'Sin dígitos' };
  }

  // Descubre el prefijo de país.
  let prefijo = '';
  if (tienePlus || digitos.length > 10) {
    // Intenta emparejar 1..3 dígitos como prefijo conocido.
    for (const len of [3, 2, 1]) {
      const cand = digitos.slice(0, len);
      if (PAISES[cand]) {
        prefijo = cand;
        break;
      }
    }
  }

  if (!prefijo) {
    // Sin prefijo reconocible: usa el país por defecto.
    prefijo = codigoPaisPorDefecto;
  } else {
    digitos = digitos.slice(prefijo.length);
  }

  const meta = PAISES[prefijo];
  if (!meta) {
    return {
      e164: '',
      pais: '',
      valido: false,
      motivo: `Código de país no soportado: +${prefijo}`
    };
  }

  if (!meta.longitudes.includes(digitos.length)) {
    return {
      e164: `+${prefijo}${digitos}`,
      pais: meta.iso2,
      valido: false,
      motivo: `Longitud nacional inválida para ${meta.iso2} (esperado ${meta.longitudes.join('/')} dígitos)`
    };
  }

  return {
    e164: `+${prefijo}${digitos}`,
    pais: meta.iso2,
    valido: true
  };
}

/** Enmascara un E.164 para mostrarlo en UI/logs sin exponerlo completo. */
export function enmascararCelular(e164: string): string {
  if (!e164 || e164.length < 5) return e164 || '';
  const visibleFinal = e164.slice(-3);
  const prefijo = e164.slice(0, 3);
  return `${prefijo}••••••${visibleFinal}`;
}
