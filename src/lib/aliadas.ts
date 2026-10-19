/**
 * Corredor público fase 1 (A1).
 * Universo visible = estas 5 instituciones. Sustituir por flag
 * `es_aliada_preacuerdo` + vista cuando exista foto de schema (D1/D2).
 *
 * IDs de producción: `NEXT_PUBLIC_ALIADAS_IDS=uuid,uuid,...`
 * Si esa variable falta, se resuelven por nombre/sigla en `universidades` (palabra completa, C-57).
 * Allowlist vacía → catálogo público vacío (no se reabre el universo nacional).
 */

import { supabase } from "./supabase";
import { ALIADAS_PUBLICAS } from "./aliadas-publicas";

export { ALIADAS_PUBLICAS, NOMBRES_ALIADAS } from "./aliadas-publicas";
export type { AliadaPublica } from "./aliadas-publicas";

/** UUIDs de `NEXT_PUBLIC_ALIADAS_IDS`. Lo usan el corredor y los logos del Home. */
export function idsAliadasDesdeEnv(): string[] {
  const raw = process.env.NEXT_PUBLIC_ALIADAS_IDS || "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[0-9a-f-]{36}$/i.test(value));
}

function likePattern(value: string): string {
  const clean = value.trim().replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim();
  return `%${clean}%`;
}

let cacheIds: Promise<string[]> | null = null;

export function invalidarCacheAliadas(): void {
  cacheIds = null;
}

export async function resolverIdsAliadas(): Promise<string[]> {
  if (!cacheIds) {
    cacheIds = resolverIdsAliadasSinCache().catch((error) => {
      cacheIds = null;
      throw error;
    });
  }
  return cacheIds;
}

// Bloque: normaliza un nombre para comparar (minúsculas, sin tildes, solo letras/números separados por espacio).
function normalizarNombre(valor: string): string {
  return (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Bloque: ¿la fila de `universidades` es una aliada según sus patrones? (C-57)
 * Qué: coincidencia por palabra completa sobre nombre normalizado, o sigla exacta.
 * Por qué: el ilike '%UNIR%' también traía «Fundación Unired», una universidad NO aliada.
 */
export function coincideAliada(
  fila: { nombre_oficial?: string | null; nombre_corto?: string | null; sigla?: string | null },
  patrones: string[]
): boolean {
  const nombres = [fila.nombre_oficial, fila.nombre_corto].map((n) => ` ${normalizarNombre(n || "")} `);
  const sigla = normalizarNombre(fila.sigla || "");
  return patrones.some((patron) => {
    const p = normalizarNombre(patron);
    if (!p) return false;
    if (sigla && sigla === p) return true;
    return nombres.some((n) => n.includes(` ${p} `));
  });
}

async function resolverIdsAliadasSinCache(): Promise<string[]> {
  // Con NEXT_PUBLIC_ALIADAS_IDS: coincidencia exacta por id (fuente preferida).
  const fromEnv = idsAliadasDesdeEnv();
  if (fromEnv.length > 0) return fromEnv;

  // Bloque: sin la variable (hoy en Vercel) se mantiene el respaldo por patrones, pero filtrado por palabra
  // completa en código. Se avisa una vez por instancia para que Ops cargue los ids.
  console.warn(JSON.stringify({ origen: "aliadas", evento: "aliadas_ids_ausente" }));
  const condiciones = ALIADAS_PUBLICAS.flatMap((aliada) =>
    aliada.patrones.flatMap((patron) => {
      const p = likePattern(patron);
      return [`nombre_oficial.ilike.${p}`, `nombre_corto.ilike.${p}`, `sigla.ilike.${p}`];
    })
  );

  const { data, error } = await supabase
    .from("universidades")
    .select("id, nombre_oficial, nombre_corto, sigla")
    .or(condiciones.join(","));

  if (error) {
    // Sin el objeto completo en el log (puede traer valores de la consulta).
    // Error ≠ vacío (C-13): se lanza para que obtenerOfertas responda ok:false y no «0 resultados».
    console.error(JSON.stringify({ origen: "aliadas", evento: "aliadas_error", codigo: (error as { code?: string }).code ?? null }));
    throw new Error("aliadas_query_failed");
  }

  const patrones = ALIADAS_PUBLICAS.flatMap((a) => a.patrones);
  const filas = (data || []) as Array<{ id: string; nombre_oficial?: string; nombre_corto?: string; sigla?: string }>;
  return [...new Set(filas.filter((f) => coincideAliada(f, patrones)).map((f) => f.id))];
}
