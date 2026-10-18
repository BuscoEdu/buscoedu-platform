/**
 * E1 · C1 — Aviso de impacto antes de apagar un modelo/proveedor o revocar una clave.
 *
 * Qué hace: con las versiones PUBLICADAS de cada agente (principal + respaldos del
 * snapshot) y el estado encendido/apagado de cada modelo, calcula qué agentes usan lo
 * que se va a apagar, con qué modelo quedan y cuáles quedarían sin IA. Devuelve además
 * un `impacto_hash` para confirmar exactamente lo que el admin vio.
 * Para qué: «N agentes lo usan; M quedarían sin IA» (C1, UX P4) y no confirmar con un
 * aviso viejo si otro admin cambió algo entre ver y confirmar.
 * Módulo puro: sin BD.
 */

import { createHash } from 'node:crypto';

export interface VersionPublicada {
  agente_id: string;
  agente_codigo: string;
  agente_nombre: string;
  version_id: string;
  numero_version: string;
  despliegue_id: string | null;
  respaldos_ids: string[];
}

export interface ModeloEstado {
  id: string;
  nombre: string;
  proveedor_id: string;
  /** Modelo y proveedor encendidos (lo que el motor considera usable). */
  usable: boolean;
}

export interface AgenteImpactado {
  agente_id: string;
  agente_codigo: string;
  agente_nombre: string;
  version_id: string;
  numero_version: string;
  rol: 'principal' | 'respaldo';
  queda_con: { despliegue_id: string; nombre: string } | null;
}

export interface Impacto {
  objetivo: { tipo: 'despliegue' | 'proveedor'; id: string; nombre: string };
  agentes_afectados: number;
  agentes_sin_ia: number;
  mensaje: string;
  agentes: AgenteImpactado[];
  borradores_afectados: number;
  impacto_hash: string;
}

/** Lee principal y respaldos de un `configuracion_snapshot` (claves que usa BA-034). */
export function modelosDelSnapshot(snapshot: unknown): { despliegue_id: string | null; respaldos_ids: string[] } {
  const s = (snapshot && typeof snapshot === 'object' ? snapshot : {}) as Record<string, unknown>;
  const principal = typeof s.despliegue_id === 'string' && s.despliegue_id ? s.despliegue_id : null;
  const respaldos = Array.isArray(s.despliegues_respaldo_ids)
    ? (s.despliegues_respaldo_ids as unknown[]).filter((x): x is string => typeof x === 'string' && x !== principal)
    : [];
  return { despliegue_id: principal, respaldos_ids: respaldos.slice(0, 5) };
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * Calcula el impacto de dejar NO usables los modelos de `apagar` (ids).
 * `borradores` = cuántos borradores usan alguno (no afectan a estudiantes).
 */
export function calcularImpacto(p: {
  objetivo: Impacto['objetivo'];
  apagar: string[];
  versiones: VersionPublicada[];
  modelos: ModeloEstado[];
  borradores: number;
}): Impacto {
  const apagados = new Set(p.apagar);
  const porId = new Map(p.modelos.map((m) => [m.id, m]));
  const usableTrasCambio = (id: string) => !apagados.has(id) && porId.get(id)?.usable === true;

  const agentes: AgenteImpactado[] = [];
  for (const v of p.versiones) {
    const cadena = [v.despliegue_id, ...v.respaldos_ids].filter((x): x is string => !!x);
    const usaPrincipal = !!v.despliegue_id && apagados.has(v.despliegue_id);
    const usaRespaldo = v.respaldos_ids.some((id) => apagados.has(id));
    if (!usaPrincipal && !usaRespaldo) continue;
    const queda = cadena.find(usableTrasCambio) ?? null;
    agentes.push({
      agente_id: v.agente_id,
      agente_codigo: v.agente_codigo,
      agente_nombre: v.agente_nombre,
      version_id: v.version_id,
      numero_version: v.numero_version,
      rol: usaPrincipal ? 'principal' : 'respaldo',
      queda_con: queda ? { despliegue_id: queda, nombre: porId.get(queda)?.nombre ?? queda } : null
    });
  }
  agentes.sort((a, b) => a.agente_id.localeCompare(b.agente_id));
  const sinIa = agentes.filter((a) => !a.queda_con).length;
  const mensaje =
    agentes.length === 0
      ? 'Ningún agente publicado lo usa.'
      : `${plural(agentes.length, 'agente lo usa', 'agentes lo usan')}; ${plural(sinIa, 'quedaría sin IA', 'quedarían sin IA')}.`;

  // Hash del conjunto afectado: cambia si cambia quién se afecta o con qué queda.
  const base = JSON.stringify({
    o: p.objetivo.id,
    a: agentes.map((a) => [a.agente_id, a.version_id, a.rol, a.queda_con?.despliegue_id ?? null])
  });
  const impacto_hash = `sha256:${createHash('sha256').update(base).digest('hex')}`;

  return { objetivo: p.objetivo, agentes_afectados: agentes.length, agentes_sin_ia: sinIa, mensaje, agentes, borradores_afectados: p.borradores, impacto_hash };
}

/**
 * Protocolo de confirmación (P7, P10, M6): sin `confirmar` → hay que mostrar el aviso;
 * con un hash distinto al actual → el impacto cambió; con el mismo → se puede aplicar.
 */
export function revisarConfirmacion(
  impacto: Impacto,
  body: { confirmar?: boolean; impacto_hash?: string }
): 'aplicar' | 'confirmacion_requerida' | 'impacto_cambio' {
  if (body.confirmar !== true) return 'confirmacion_requerida';
  if (body.impacto_hash !== impacto.impacto_hash) return 'impacto_cambio';
  return 'aplicar';
}
