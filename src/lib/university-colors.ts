const DEFAULT_UNIVERSITY_COLOR = '#0f766e';
const DEFAULT_SOFT_BG_COLOR = '#ccfbf1';
const DEFAULT_BORDER_COLOR = '#0f766e';

const UNIVERSITY_COLOR_PALETTE = [
  { solid: '#1d4ed8', soft: '#dbeafe', border: '#1e40af', text: '#ffffff' }, // blue
  { solid: '#0f766e', soft: '#ccfbf1', border: '#115e59', text: '#ffffff' }, // teal
  { solid: '#7c3aed', soft: '#ede9fe', border: '#6d28d9', text: '#ffffff' }, // violet
  { solid: '#be185d', soft: '#fce7f3', border: '#9d174d', text: '#ffffff' }, // pink
  { solid: '#0369a1', soft: '#e0f2fe', border: '#075985', text: '#ffffff' }, // cyan-blue
  { solid: '#166534', soft: '#dcfce7', border: '#14532d', text: '#ffffff' }, // green
  { solid: '#b45309', soft: '#fef3c7', border: '#92400e', text: '#ffffff' }, // amber
  { solid: '#4338ca', soft: '#e0e7ff', border: '#3730a3', text: '#ffffff' }, // indigo
  { solid: '#c2410c', soft: '#ffedd5', border: '#9a3412', text: '#ffffff' }, // orange
  { solid: '#334155', soft: '#e2e8f0', border: '#1e293b', text: '#ffffff' }, // slate
  { solid: '#6d28d9', soft: '#f3e8ff', border: '#5b21b6', text: '#ffffff' }, // purple
  { solid: '#0e7490', soft: '#cffafe', border: '#155e75', text: '#ffffff' } // cyan
] as const;

function hashStable(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeFallbackKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function resolvePaletteEntry(universidadId?: string | null, fallbackKey?: string | null) {
  const id = (universidadId || '').trim();
  const fallback = normalizeFallbackKey((fallbackKey || '').trim());
  const source = id || fallback;

  if (!source) {
    return {
      solid: DEFAULT_UNIVERSITY_COLOR,
      soft: DEFAULT_SOFT_BG_COLOR,
      border: DEFAULT_BORDER_COLOR,
      text: '#ffffff'
    };
  }

  const index = hashStable(source) % UNIVERSITY_COLOR_PALETTE.length;
  return UNIVERSITY_COLOR_PALETTE[index];
}

/**
 * Color principal determinista por universidad.
 * Prioriza universidadId; si no existe, usa fallbackKey (slug/nombre canónico).
 */
export function getUniversityColor(universidadId?: string | null, fallbackKey?: string | null): string {
  return resolvePaletteEntry(universidadId, fallbackKey).solid;
}

/** Color de borde determinista por universidad. */
export function getUniversityBorderColor(universidadId?: string | null, fallbackKey?: string | null): string {
  return resolvePaletteEntry(universidadId, fallbackKey).border;
}

/** Fondo suave complementario para badges o bloques informativos. */
export function getUniversitySoftBgColor(universidadId?: string | null, fallbackKey?: string | null): string {
  return resolvePaletteEntry(universidadId, fallbackKey).soft;
}

/** Color de texto recomendado sobre el color sólido. */
export function getUniversityTextColor(universidadId?: string | null, fallbackKey?: string | null): string {
  return resolvePaletteEntry(universidadId, fallbackKey).text;
}

export { DEFAULT_UNIVERSITY_COLOR, UNIVERSITY_COLOR_PALETTE };
