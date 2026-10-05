/**
 * Nombres del corredor. Sin cliente de BD: se puede importar en Client Components.
 * `exactos` es igualdad de nombre o sigla, nunca un patrón con %.
 * "%UNIR%" metía Unired; "UNIR" a secas no.
 */

export type AliadaPublica = {
  slug: string;
  nombre: string;
  exactos: string[];
};

export const ALIADAS_PUBLICAS: AliadaPublica[] = [
  {
    slug: "politecnico-grancolombiano",
    nombre: "Politécnico Grancolombiano",
    exactos: ["Grancolombiano", "Politecnico Grancolombiano", "Politécnico Grancolombiano"]
  },
  {
    slug: "areandina",
    nombre: "Areandina",
    exactos: ["Areandina", "Fundación Universitaria del Área Andina"]
  },
  {
    slug: "sergio-arboleda",
    nombre: "Universidad Sergio Arboleda",
    exactos: ["Sergio Arboleda", "Universidad Sergio Arboleda"]
  },
  {
    slug: "unir-colombia",
    nombre: "UNIR Colombia",
    exactos: ["UNIR", "UNIR Colombia", "Universidad Internacional de La Rioja"]
  },
  {
    slug: "asturias",
    nombre: "Asturias",
    exactos: ["Asturias"]
  }
];

/** PostgREST pide comillas si el valor tiene espacio. Sigue siendo igualdad, no un patrón. */
function valorFiltroExacto(valor: string): string {
  if (/[\s,:]/.test(valor)) return `"${valor.replace(/"/g, "")}"`;
  return valor;
}

/**
 * Filtros PostgREST de igualdad (ilike sin comodín).
 * Si el valor trae %, coma o paréntesis, se descarta: no se rearma un patrón.
 */
export function condicionesExactasAliadas(exactos: string[]): string[] {
  const vistos = new Set<string>();
  const filtros: string[] = [];
  for (const bruto of exactos) {
    const limpio = bruto.trim().replace(/[%,()*]/g, "");
    const clave = limpio.toLowerCase();
    if (limpio.length < 2 || limpio !== bruto.trim() || vistos.has(clave)) continue;
    vistos.add(clave);
    const valor = valorFiltroExacto(limpio);
    filtros.push(`nombre_oficial.ilike.${valor}`);
    filtros.push(`nombre_corto.ilike.${valor}`);
    filtros.push(`sigla.ilike.${valor}`);
  }
  return filtros;
}

export const NOMBRES_ALIADAS = ALIADAS_PUBLICAS.map((item) => item.nombre);
