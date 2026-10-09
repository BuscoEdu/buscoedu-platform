/**
 * Corredor público fase 1 (A1).
 * Universo visible = estas 5 instituciones. Sustituir por flag
 * `es_aliada_preacuerdo` + vista cuando exista foto de schema (D1/D2).
 *
 * Prioridad: `NEXT_PUBLIC_ALIADAS_IDS=uuid,uuid,...`
 * Si esa variable no trae UUIDs, cada aliada se resuelve por igualdad
 * exacta de nombre oficial, nombre corto o sigla. Nunca por subcadena:
 * «UNIR» no es «Unired» ni «Fundación Unired Colombia».
 * Error de consulta o cero coincidencias → [] (el catálogo queda vacío;
 * no se reabre el universo nacional).
 */

import { supabase } from "./supabase";
import {
  ALIADAS_PUBLICAS,
  valoresExactosDeAliada,
  type AliadaPublica
} from "./aliadas-publicas";

export { ALIADAS_PUBLICAS, NOMBRES_ALIADAS, valoresExactosDeAliada } from "./aliadas-publicas";
export type { AliadaPublica } from "./aliadas-publicas";

/** UUIDs de `NEXT_PUBLIC_ALIADAS_IDS`. Lo usan el corredor y los logos del Home. */
export function idsAliadasDesdeEnv(): string[] {
  const raw = process.env.NEXT_PUBLIC_ALIADAS_IDS || "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[0-9a-f-]{36}$/i.test(value));
}

/**
 * Forma canónica para comparar identidad.
 * Minúsculas, sin tildes y con espacios seguidos colapsados a uno.
 * No borra letras ni guiones: «unir» sigue distinto de «unired».
 */
export function normalizarIdentidadAliada(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type FilaIdentidadUniversidad = {
  id: string;
  nombre_oficial?: string | null;
  nombre_corto?: string | null;
  sigla?: string | null;
};

export type ConsultarIdentidadesUniversidades = () => Promise<{
  data: FilaIdentidadUniversidad[] | null;
  error: { message?: string } | null;
}>;

/** Valores ya normalizados de una aliada. Un vacío no entra al conjunto. */
function aceptadosDe(aliada: AliadaPublica): Set<string> {
  const aceptados = new Set<string>();

  for (const valor of valoresExactosDeAliada(aliada)) {
    const normalizado = normalizarIdentidadAliada(valor);
    if (normalizado) aceptados.add(normalizado);
  }

  return aceptados;
}

/**
 * Ids cuya fila iguala, en alguno de los tres campos, un valor aceptado.
 * `faltantes` son los nombres visibles de las aliadas que no aparecieron.
 */
export function resolverIdsDesdeFilas(filas: readonly FilaIdentidadUniversidad[]): {
  ids: string[];
  faltantes: string[];
} {
  const aliadas = ALIADAS_PUBLICAS.map((aliada) => ({
    nombre: aliada.nombre,
    aceptados: aceptadosDe(aliada)
  }));
  const ids: string[] = [];
  const vistos = new Set<string>();
  const resueltas = new Set<string>();

  for (const fila of filas) {
    const id = typeof fila?.id === "string" ? fila.id.trim() : "";
    if (!id) continue;

    const campos = [fila.nombre_oficial, fila.nombre_corto, fila.sigla]
      .map((valor) => (valor == null ? "" : normalizarIdentidadAliada(String(valor))))
      .filter(Boolean);
    let coincide = false;

    for (const aliada of aliadas) {
      const igual = campos.some((campo) => aliada.aceptados.has(campo));
      if (!igual) continue;
      resueltas.add(aliada.nombre);
      coincide = true;
    }

    if (coincide && !vistos.has(id)) {
      vistos.add(id);
      ids.push(id);
    }
  }

  const faltantes = aliadas
    .map((aliada) => aliada.nombre)
    .filter((nombre) => !resueltas.has(nombre));

  return { ids, faltantes };
}

/** Tope por página de PostgREST. Por encima hay que pedir otro rango. */
const PAGINA_IDENTIDADES = 1000;

/** 10 000 filas cubren el universo nacional de IES sin un `or()` gigante. */
const MAX_PAGINAS_IDENTIDADES = 10;

/**
 * Candidatas de `universidades`: solo id y los tres nombres.
 * No usa `ilike` ni `%`. La igualdad (tildes, mayúsculas, espacios) se
 * decide en TypeScript. Un `or()` de `ilike` exacto por cada valor puede
 * pasar el límite de URL (414), ya visto en este proyecto.
 * Si una página falla, se descarta el lote entero: fail closed.
 */
async function consultarIdentidadesUniversidades(): Promise<{
  data: FilaIdentidadUniversidad[] | null;
  error: { message?: string } | null;
}> {
  const filas: FilaIdentidadUniversidad[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS_IDENTIDADES; pagina += 1) {
    const desde = pagina * PAGINA_IDENTIDADES;
    const hasta = desde + PAGINA_IDENTIDADES - 1;
    const { data, error } = await supabase
      .from("universidades")
      .select("id, nombre_oficial, nombre_corto, sigla")
      .order("id", { ascending: true })
      .range(desde, hasta);

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    const lote = (data || []) as FilaIdentidadUniversidad[];
    filas.push(...lote);

    if (lote.length < PAGINA_IDENTIDADES) {
      return { data: filas, error: null };
    }
  }

  console.warn(
    "La lectura de universidades alcanzó el tope de páginas; la resolución por nombre puede quedar incompleta."
  );
  return { data: filas, error: null };
}

/** Avisa cuáles aliadas no tuvieron igualdad exacta. No inventa ids. */
function avisarAliadasFaltantes(faltantes: string[]): void {
  console.warn(
    `Catálogo de aliadas incompleto (${faltantes.length} de ${ALIADAS_PUBLICAS.length} sin igualdad exacta): ${faltantes.join(", ")}. ` +
      "Se devuelven solo las encontradas. Configura NEXT_PUBLIC_ALIADAS_IDS en Vercel; es la fuente de verdad del corredor."
  );
}

/**
 * Ids del corredor, sin caché.
 * 1. Si hay UUIDs en el entorno, se devuelven y no se consulta por nombre.
 * 2. Si la consulta falla o no hay filas útiles, [].
 * 3. Con menos de 5 aliadas reconocidas, se avisa por nombre y se devuelven las halladas.
 */
export async function resolverIdsAliadasSinCache(
  consultar: ConsultarIdentidadesUniversidades = consultarIdentidadesUniversidades
): Promise<string[]> {
  const fromEnv = idsAliadasDesdeEnv();
  if (fromEnv.length > 0) return fromEnv;

  const { data, error } = await consultar();

  if (error) {
    console.error("Error resolviendo IDs de aliadas:", error);
    return [];
  }

  const { ids, faltantes } = resolverIdsDesdeFilas(data || []);

  if (faltantes.length > 0) {
    avisarAliadasFaltantes(faltantes);
  }

  return ids;
}

let cacheIds: Promise<string[]> | null = null;

export function invalidarCacheAliadas(): void {
  cacheIds = null;
}

/** Misma resolución que `resolverIdsAliadasSinCache`, recordada en el proceso. */
export async function resolverIdsAliadas(): Promise<string[]> {
  if (!cacheIds) {
    cacheIds = resolverIdsAliadasSinCache().catch((error) => {
      cacheIds = null;
      throw error;
    });
  }
  return cacheIds;
}
