const DEFAULT_UNIVERSITY_COLOR = '#14b8a6';

const UNIVERSITY_COLORS_BY_SLUG: Record<string, string> = {
  areandina: '#00843D',
  'fundacion-universitaria-areandina': '#00843D',
  arealinda: '#00843D',
  'politecnico-grancolombiano': '#003DA5',
  'politecnico-granamericano': '#003DA5',
  unad: '#003087',
  'universidad-de-los-andes': '#C8102E',
  javeriana: '#001F5B',
  'universidad-nacional': '#4A4F54',
  'universidad-de-antioquia': '#004A8F',
  ean: '#007749',
  ceipa: '#E87722',
  'konrad-lorenz': '#0072CE',
  eafit: '#CC0000',
  'universidad-del-rosario': '#1D4F21',
  'universidad-externado': '#3D3D3D',
  cun: '#0099CC',
  'universidad-libre': '#003C71',
  unired: '#7C3AED',
  'fundacion-unired-colombia': '#7C3AED',
  'sin-identificar': '#14b8a6',
  demo: '#14b8a6'
};

function normalizeUniversityKey(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function getUniversityColor(nombre: string): string {
  if (!nombre) {
    return DEFAULT_UNIVERSITY_COLOR;
  }

  const normalizedName = normalizeUniversityKey(nombre);

  const colorByExactSlug = UNIVERSITY_COLORS_BY_SLUG[normalizedName];
  if (colorByExactSlug) {
    return colorByExactSlug;
  }

  const colorByPartialMatch = Object.entries(UNIVERSITY_COLORS_BY_SLUG).find(([key]) => {
    return normalizedName.includes(key) || key.includes(normalizedName);
  })?.[1];

  return colorByPartialMatch ?? DEFAULT_UNIVERSITY_COLOR;
}

export { DEFAULT_UNIVERSITY_COLOR, UNIVERSITY_COLORS_BY_SLUG };
