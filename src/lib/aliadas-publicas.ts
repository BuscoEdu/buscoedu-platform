/** Nombres del corredor. Sin cliente de BD: se puede importar en Client Components. */

export type AliadaPublica = {
  slug: string;
  nombre: string;
  patrones: string[];
};

export const ALIADAS_PUBLICAS: AliadaPublica[] = [
  {
    slug: "politecnico-grancolombiano",
    nombre: "Politécnico Grancolombiano",
    patrones: ["Grancolombiano", "Politecnico Grancolombiano", "Politécnico Grancolombiano"]
  },
  {
    slug: "areandina",
    nombre: "Areandina",
    patrones: ["Areandina", "Fundación Universitaria del Área Andina"]
  },
  {
    slug: "sergio-arboleda",
    nombre: "Universidad Sergio Arboleda",
    patrones: ["Sergio Arboleda"]
  },
  {
    slug: "unir-colombia",
    nombre: "UNIR Colombia",
    patrones: ["UNIR", "Universidad Internacional de La Rioja"]
  },
  {
    slug: "asturias",
    nombre: "Asturias",
    patrones: ["Asturias"]
  }
];

export const NOMBRES_ALIADAS = ALIADAS_PUBLICAS.map((item) => item.nombre);
