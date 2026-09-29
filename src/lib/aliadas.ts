/**
 * Corredor público fase 1 (A1).
 * Universo visible = estas 5 instituciones. Sustituir por flag
 * `es_aliada_preacuerdo` + vista cuando exista foto de schema (D1/D2).
 *
 * IDs de producción: `NEXT_PUBLIC_ALIADAS_IDS=uuid,uuid,...`
 * Si esa variable falta, se resuelven por nombre/sigla en `universidades`.
 * Allowlist vacía → catálogo público vacío (no se reabre el universo nacional).
 */

import { supabase } from "./supabase";
import { ALIADAS_PUBLICAS } from "./aliadas-publicas";

export { ALIADAS_PUBLICAS, NOMBRES_ALIADAS } from "./aliadas-publicas";
export type { AliadaPublica } from "./aliadas-publicas";

function idsDesdeEnv(): string[] {
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

async function resolverIdsAliadasSinCache(): Promise<string[]> {
  const fromEnv = idsDesdeEnv();
  if (fromEnv.length > 0) return fromEnv;

  const condiciones = ALIADAS_PUBLICAS.flatMap((aliada) =>
    aliada.patrones.flatMap((patron) => {
      const p = likePattern(patron);
      return [`nombre_oficial.ilike.${p}`, `nombre_corto.ilike.${p}`, `sigla.ilike.${p}`];
    })
  );

  const { data, error } = await supabase.from("universidades").select("id").or(condiciones.join(","));

  if (error) {
    console.error("Error resolviendo IDs de aliadas:", error);
    return [];
  }

  return [...new Set((data || []).map((row: { id: string }) => row.id))];
}
