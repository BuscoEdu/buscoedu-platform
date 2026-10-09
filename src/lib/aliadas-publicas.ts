/**
 * Nombres del corredor público. Sin cliente de BD: se puede importar en Client Components.
 * Cada aliada trae valores exactos (oficial, corto, sigla). No son fragmentos:
 * la comparación en `aliadas.ts` exige igualdad, nunca subcadena.
 *
 * Los nombres oficiales salen del SNIES (consulta pública, oct 2026).
 * La sigla solo se afirma cuando este corredor o el SNIES la dejan explícita.
 * El arreglo de producción sigue siendo `NEXT_PUBLIC_ALIADAS_IDS`.
 */

export type AliadaPublica = {
  slug: string;
  /** Nombre visible en el portal. No se usa como filtro de BD. */
  nombre: string;
  /** Nombre oficial aceptado tal cual. Puede haber más de una forma escrita. */
  nombresOficiales: string[];
  /** Nombre corto aceptado tal cual. */
  nombresCortos: string[];
  /** Sigla aceptada tal cual. Vacío si este repo no la confirma. */
  siglas: string[];
};

export const ALIADAS_PUBLICAS: AliadaPublica[] = [
  {
    slug: "politecnico-grancolombiano",
    nombre: "Politécnico Grancolombiano",
    /* SNIES 2725: POLITECNICO GRANCOLOMBIANO. */
    nombresOficiales: [
      "Politécnico Grancolombiano",
      "Institución Universitaria Politécnico Grancolombiano"
    ],
    nombresCortos: ["Politécnico Grancolombiano"],
    siglas: []
  },
  {
    slug: "areandina",
    nombre: "Areandina",
    /* SNIES 2728: FUNDACION UNIVERSITARIA DEL AREA ANDINA. */
    nombresOficiales: ["Fundación Universitaria del Área Andina"],
    nombresCortos: ["Areandina"],
    siglas: []
  },
  {
    slug: "sergio-arboleda",
    nombre: "Universidad Sergio Arboleda",
    /* SNIES 1728: UNIVERSIDAD SERGIO ARBOLEDA. */
    nombresOficiales: ["Universidad Sergio Arboleda"],
    nombresCortos: ["Sergio Arboleda"],
    siglas: []
  },
  {
    slug: "unir-colombia",
    nombre: "UNIR Colombia",
    /*
     * SNIES 9926: FUNDACION UNIVERSITARIA INTERNACIONAL DE LA RIOJA - UNIR.
     * «Universidad Internacional de La Rioja» es la fundadora española; se
     * acepta solo si el campo es exactamente ese texto (el corredor ya lo usaba).
     * «UNIR» es igualdad exacta: no alcanza con «Unired».
     */
    nombresOficiales: [
      "Fundación Universitaria Internacional de La Rioja - UNIR",
      "Fundación Universitaria Internacional de La Rioja-UNIR",
      "Fundación Universitaria Internacional de La Rioja – UNIR",
      "Fundación Universitaria Internacional de La Rioja",
      "Universidad Internacional de La Rioja"
    ],
    nombresCortos: ["UNIR", "UNIR Colombia"],
    siglas: ["UNIR"]
  },
  {
    slug: "asturias",
    nombre: "Asturias",
    /* SNIES 9913: CORPORACION UNIVERSITARIA DE ASTURIAS. */
    nombresOficiales: ["Corporación Universitaria de Asturias"],
    nombresCortos: ["Asturias"],
    siglas: []
  }
];

/** Unión de oficial, corto y sigla, sin vacíos ni repetidos. */
export function valoresExactosDeAliada(aliada: AliadaPublica): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];

  for (const valor of [...aliada.nombresOficiales, ...aliada.nombresCortos, ...aliada.siglas]) {
    const limpio = valor.trim();
    if (!limpio || vistos.has(limpio)) continue;
    vistos.add(limpio);
    salida.push(limpio);
  }

  return salida;
}

export const NOMBRES_ALIADAS = ALIADAS_PUBLICAS.map((item) => item.nombre);
