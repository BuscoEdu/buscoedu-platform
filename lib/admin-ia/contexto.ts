/**
 * E1 · BA-036/037/038 — Contexto de un handler admin y piezas compartidas.
 *
 * Qué hace:
 *   - `CtxAdmin`: datos, actor (super_admin ya verificado), reloj, probador de conexión,
 *     salud del circuito y limitador de pruebas, todos inyectables.
 *   - `conexionDe`: preset, tipo de adaptador y URL de un proveedor (columnas N6; si
 *     faltan, el preset por código).
 *   - `usoPorModelo`: cuántos agentes publicados usan cada modelo como principal/respaldo.
 *   - `bitacoraSinBloquear`: escribe la bitácora de cambios que no son interruptor ni
 *     restaurar (esos van en la misma transacción vía N4/N5); si falla, avisa y sigue.
 *   - `capacidadesDe`: capacidades declaradas del modelo (o del proveedor); faltante = false.
 * Para qué: que los servicios compartan reglas y que los tests inyecten dobles.
 * Módulo puro: sin alias `@/`.
 */

import type { ResultadoPrueba } from '../agentes/llm/probar';
import { PRESETS_PROVEEDOR, type PresetProveedor } from '../agentes/llm/proveedores';
import type { DespliegueLLM, TipoAdaptador } from '../agentes/llm/tipos';
import type { DatosAdminIa, EventoBitacora, FilaModelo, FilaProveedor } from './datos';
import type { Advertencia } from './http';
import type { VersionPublicada } from './impacto';

export interface CtxAdmin {
  datos: DatosAdminIa;
  actorId: string;
  ahora?: () => Date;
  /** M4: prueba real (adaptador + clave). Lo arma la ruta; en tests es un doble. */
  probador?: (d: DespliegueLLM) => Promise<ResultadoPrueba>;
  /** Salud (C4): hasta cuándo está abierto el circuito de un modelo (ms) o null. */
  circuitoAbiertoHasta?: (despliegueId: string) => number | null;
  /** M4: true si se puede probar ahora (máx. 6 por minuto por modelo). */
  permitirPrueba?: (despliegueId: string) => boolean;
  avisar?: (m: string) => void;
}

export interface Peticion {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export const ahoraDe = (ctx: CtxAdmin) => (ctx.ahora ? ctx.ahora() : new Date());

export function presetPorCodigo(codigo: string | null | undefined): PresetProveedor | undefined {
  return PRESETS_PROVEEDOR.find((p) => p.codigo === codigo);
}

/** Conexión del proveedor: columnas N6 y, si faltan, el preset de su código. */
export function conexionDe(p: FilaProveedor): { preset_codigo: string | null; tipo_adaptador: TipoAdaptador | null; url_base: string | null } {
  const preset = presetPorCodigo(p.preset_codigo ?? p.codigo);
  return {
    preset_codigo: p.preset_codigo ?? preset?.codigo ?? null,
    tipo_adaptador: ((p.tipo_adaptador as TipoAdaptador) ?? preset?.tipo_adaptador ?? null) as TipoAdaptador | null,
    url_base: p.url_base ?? preset?.url_base ?? null
  };
}

export function usoPorModelo(versiones: VersionPublicada[]): Map<string, { principal: number; respaldo: number }> {
  const uso = new Map<string, { principal: number; respaldo: number }>();
  const sumar = (id: string, campo: 'principal' | 'respaldo') => {
    const u = uso.get(id) ?? { principal: 0, respaldo: 0 };
    u[campo] += 1;
    uso.set(id, u);
  };
  for (const v of versiones) {
    if (v.despliegue_id) sumar(v.despliegue_id, 'principal');
    for (const r of v.respaldos_ids) sumar(r, 'respaldo');
  }
  return uso;
}

/** Bitácora de crear/editar/asignar: el cambio ya quedó; si la bitácora falla, se avisa. */
export async function bitacoraSinBloquear(ctx: CtxAdmin, evento: EventoBitacora, advertencias: Advertencia[]): Promise<void> {
  try {
    await ctx.datos.registrarBitacora(evento);
  } catch {
    (ctx.avisar ?? ((m: string) => console.warn(m)))(`[E1 admin IA] No se pudo guardar la bitácora de ${evento.entidad}/${evento.accion}.`);
    advertencias.push({ codigo: 'bitacora_no_guardada', mensaje: 'El cambio se guardó, pero no quedó en la bitácora.' });
  }
}

export function capacidadesDe(m: FilaModelo, p?: FilaProveedor | null): { json: boolean; herramientas: boolean } {
  const c = ((m.configuracion_tecnica || {}) as Record<string, unknown>).capacidades as Record<string, unknown> | undefined;
  const cp = (p?.capacidades || {}) as Record<string, unknown>;
  return {
    json: (c?.json ?? cp.json) === true,
    herramientas: (c?.herramientas ?? cp.herramientas) === true
  };
}

export function parametrosDe(m: FilaModelo): { temperature: number | null; max_tokens: number | null; timeout_ms: number | null } {
  const c = (m.configuracion_tecnica || {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { temperature: num(c.temperature), max_tokens: num(c.max_tokens), timeout_ms: num(c.timeout_ms) };
}

/** Qué hacer ante cada motivo de prueba fallida (UX §3.5). */
export const QUE_HACER: Record<string, string> = {
  autenticacion: 'Reemplaza la clave.',
  sin_saldo: 'Recarga saldo en el proveedor.',
  servidor: 'Intenta más tarde o revisa la URL.',
  timeout: 'Revisa que la URL esté en línea o sube el timeout.',
  limite_tasa: 'Espera unos minutos.',
  sin_clave: 'Guarda la clave.',
  proveedor_no_permitido: 'Elige un proveedor de la lista.',
  respuesta_invalida: 'Revisa el identificador del modelo.',
  contexto_excedido: 'Revisa el máximo de tokens.',
  politica_contenido: 'Contacta al proveedor.',
  proveedor_inactivo: 'Revisa que el proveedor y el modelo existan.'
};

/** Mensajes en español para los errores de `fn_ia_cambiar_interruptor` (N4). */
export function errorInterruptor(r: Record<string, unknown>): { status: number; error: string; mensaje: string } {
  switch (r.error) {
    case 'no_encontrado':
      return { status: 404, error: 'no_encontrado', mensaje: 'No encontramos ese elemento.' };
    case 'archivado':
      return { status: 409, error: 'archivado', mensaje: 'Está archivado: no se puede encender ni apagar.' };
    case 'datos_invalidos':
      return { status: 400, error: 'datos_invalidos', mensaje: 'Los datos del cambio no son válidos.' };
    default:
      return { status: 500, error: 'error_interno', mensaje: 'No pudimos aplicar el cambio. Intenta de nuevo.' };
  }
}
