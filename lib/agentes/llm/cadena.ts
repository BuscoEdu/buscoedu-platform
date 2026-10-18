/**
 * BA-034 — Arma la cadena «principal → respaldos» lista para el motor (B2, C2).
 *
 * Qué hace: por cada despliegue crea un eslabón cuyo `preparar()` valida el despliegue
 * (fail-closed), obtiene la clave (Vault → env) y crea el adaptador correcto:
 * Abacus propio o AI SDK. Quita respaldos repetidos o iguales al principal.
 * Para qué: separar «qué despliegues usar» (BD) de «cómo llamarlos» (adaptadores),
 * y poder testear todo con dobles (sin red ni BD).
 */

import { crearAdaptadorAbacus, type ClienteAbacus } from './adaptadorAbacus';
import { crearAdaptadorAiSdk, type FabricaModelo } from './adaptadorAiSdk';
import type { LectorClaves } from './claves';
import type { EslabonLLM } from './motor';
import { validarDespliegue } from './proveedores';
import type { DespliegueLLM } from './tipos';

export interface DependenciasCadena {
  lector: LectorClaves;
  clienteAbacus: ClienteAbacus;
  fabricaModelo?: FabricaModelo;
}

/** Crea un eslabón. `preparar` lanza ErrorLLM si el despliegue no es usable. */
export function crearEslabon(d: DespliegueLLM, esRespaldo: boolean, deps: DependenciasCadena): EslabonLLM {
  return {
    despliegue: d,
    es_respaldo: esRespaldo,
    // C5 aplica a respaldos. El principal conserva el parser tolerante de hoy (B5).
    validar_formato: esRespaldo,
    async preparar() {
      const { tipo, url } = validarDespliegue(d);
      if (tipo === 'abacus') {
        // Vault opcional: si no hay, AbacusAdapter lee su env como antes.
        const token = await deps.lector.obtenerDeVault(d.proveedor_codigo || 'abacus_ai');
        return crearAdaptadorAbacus(d, deps.clienteAbacus, token);
      }
      const { clave } = await deps.lector.obtener({ proveedorCodigo: d.proveedor_codigo, referenciaEnv: d.referencia_secreto });
      return crearAdaptadorAiSdk({ despliegue: d, tipo, url, clave, fabrica: deps.fabricaModelo });
    }
  };
}

/** Principal + respaldos en orden, sin duplicados. Respaldos opcionales (decisión 22). */
export function construirCadena(principal: DespliegueLLM, respaldos: DespliegueLLM[], deps: DependenciasCadena): EslabonLLM[] {
  const vistos = new Set<string>([principal.id]);
  const cadena = [crearEslabon(principal, false, deps)];
  for (const r of respaldos) {
    if (vistos.has(r.id)) continue;
    vistos.add(r.id);
    cadena.push(crearEslabon(r, true, deps));
  }
  return cadena;
}
