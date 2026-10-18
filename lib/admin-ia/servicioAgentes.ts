/**
 * E1 · BA-037 — Modelo principal + respaldos por agente (B-1…B-6 del README-e1-api): B1–B4.
 *
 * Qué hace:
 *   - B1: lista solo modelos disponibles (`fn_ia_modelo_disponible`: prueba vigente +
 *     modelo y proveedor encendidos).
 *   - B2: asigna principal + 0..5 respaldos a un BORRADOR (sin respaldo = aviso, no bloqueo).
 *   - B3: al publicar, bloquea respaldos sin las capacidades que la versión usa
 *     (modo JSON si tiene contrato de salida; herramientas si tiene herramientas activas).
 *   - B4: duplicar una versión a borrador y volver a una versión ya publicada
 *     (`fn_ia_restaurar_version`, todo o nada).
 * Para qué: que cambiar de modelo siga Borrador → Probar → Publicar y que la versión
 * anterior quede intacta para volver a ella.
 * Módulo puro: la BD llega en `ctx`.
 */

import { bitacoraSinBloquear, capacidadesDe, type CtxAdmin, type Peticion } from './contexto';
import type { DatosAdminIa, FilaVersion } from './datos';
import { esquemaDuplicar, esquemaModeloVersion, esquemaRestaurar, validar } from './esquemas';
import { exito, fallo, type Advertencia, type ResultadoApi } from './http';
import { modelosDelSnapshot } from './impacto';
import { vistaModelo } from './servicioModelos';

export const AVISO_SIN_RESPALDO = 'Sin respaldo: si el modelo falla, NaIA pasa a una persona';

// ---------------------------------------------------------------------------
// Bloque 1: B-1 modelos disponibles.
// ---------------------------------------------------------------------------
export async function listarDisponibles(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const requiere = new Set((req.query.get('requiere') || '').split(',').map((s) => s.trim()).filter(Boolean));
  const [modelos, proveedores] = await Promise.all([ctx.datos.listarModelos({}), ctx.datos.listarProveedores(false)]);
  const provPorId = new Map(proveedores.map((p) => [p.id, p]));
  const disponibles = await Promise.all(modelos.map((m) => ctx.datos.modeloDisponible(m.id)));
  const items = [];
  for (let i = 0; i < modelos.length; i++) {
    if (!disponibles[i]) continue;
    const m = modelos[i];
    const p = provPorId.get(m.proveedor_id) ?? null;
    const cap = capacidadesDe(m, p);
    if (requiere.has('json') && !cap.json) continue;
    if (requiere.has('herramientas') && !cap.herramientas) continue;
    const precio = await ctx.datos.precioVigente(p?.codigo ?? m.proveedores_ia?.codigo ?? '', m.modelo).catch(() => null);
    items.push({ ...vistaModelo(m, { proveedor: p, precio }), proveedor_nombre: p?.nombre ?? m.proveedores_ia?.nombre ?? null });
  }
  return exito({ items });
}

// ---------------------------------------------------------------------------
// Bloque 2: compatibilidad B3 (compartida por B-2 y por publicar).
// ---------------------------------------------------------------------------
export async function compatibilidadVersion(
  datos: DatosAdminIa,
  versionId: string,
  respaldosIds: string[]
): Promise<{ requiere: { json: boolean; herramientas: boolean }; respaldos_incompatibles: Array<{ despliegue_id: string; nombre: string; falta: string[] }> }> {
  const requiere = await datos.requisitosVersion(versionId);
  const respaldos_incompatibles: Array<{ despliegue_id: string; nombre: string; falta: string[] }> = [];
  for (const id of respaldosIds) {
    const m = await datos.obtenerModelo(id);
    // Capacidad no declarada = false (fail-closed).
    const cap = m ? capacidadesDe(m, m.proveedor_id ? await datos.obtenerProveedor(m.proveedor_id) : null) : { json: false, herramientas: false };
    const falta: string[] = [];
    if (requiere.json && !cap.json) falta.push('json');
    if (requiere.herramientas && !cap.herramientas) falta.push('herramientas');
    if (falta.length > 0) respaldos_incompatibles.push({ despliegue_id: id, nombre: m?.nombre ?? id, falta });
  }
  return { requiere, respaldos_incompatibles };
}

const NOMBRE_CAPACIDAD: Record<string, string> = { json: 'modo JSON', herramientas: 'herramientas' };

/** Modelos de la versión que NO están disponibles (B1). */
async function noDisponibles(datos: DatosAdminIa, ids: string[]): Promise<string[]> {
  const r = await Promise.all(ids.map((id) => datos.modeloDisponible(id)));
  return ids.filter((_, i) => !r[i]);
}

/**
 * Validación extra para publicar (B-5): principal y respaldos disponibles (B1) y
 * respaldos compatibles (B3). `null` = se puede publicar.
 */
export async function validarModelosParaPublicar(datos: DatosAdminIa, version: { id: string; configuracion_snapshot: unknown }): Promise<ResultadoApi | null> {
  const s = modelosDelSnapshot(version.configuracion_snapshot);
  const ids = [s.despliegue_id, ...s.respaldos_ids].filter((x): x is string => !!x);
  const faltan = await noDisponibles(datos, ids);
  if (faltan.length > 0) {
    return fallo(409, 'modelo_no_disponible', 'Ese modelo no está encendido y probado.', { detalles: { ids: faltan } });
  }
  const c = await compatibilidadVersion(datos, version.id, s.respaldos_ids);
  if (c.respaldos_incompatibles.length > 0) {
    const r = c.respaldos_incompatibles[0];
    return fallo(
      409,
      'respaldo_incompatible',
      `El respaldo «${r.nombre}» no soporta ${r.falta.map((f) => NOMBRE_CAPACIDAD[f]).join(' ni ')}, que este agente usa. Quítalo o elige otro.`,
      { detalles: c.respaldos_incompatibles }
    );
  }
  return null;
}

async function versionOError(ctx: CtxAdmin, id: string): Promise<FilaVersion | ResultadoApi> {
  const v = await ctx.datos.obtenerVersion(id);
  if (!v) return fallo(404, 'no_encontrado', 'No encontramos esa versión.');
  return v;
}
const esResultado = (x: unknown): x is ResultadoApi => !!x && typeof x === 'object' && 'status' in (x as object) && 'body' in (x as object);

// ---------------------------------------------------------------------------
// Bloque 3: B-2 asignar principal + respaldos a un borrador (B1, B2, B4).
// ---------------------------------------------------------------------------
export async function asignarModelo(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const val = validar(esquemaModeloVersion, req.body);
  if (!val.ok) return (val as Extract<typeof val, { ok: false }>).resultado;
  const d = (val as Extract<typeof val, { ok: true }>).datos;
  const respaldos = d.respaldos_ids ?? [];
  if (new Set(respaldos).size !== respaldos.length || respaldos.includes(d.despliegue_id)) {
    return fallo(400, 'respaldo_duplicado', 'Un modelo no puede repetirse ni ser respaldo de sí mismo.', { campo: 'respaldos_ids' });
  }
  const version = await versionOError(ctx, req.params.id);
  if (esResultado(version)) return version;
  if (version.estado !== 'borrador') {
    return fallo(409, 'version_inmutable_publicada', 'Esta versión ya está publicada. Duplícala para cambiar el modelo.');
  }
  const faltan = await noDisponibles(ctx.datos, [d.despliegue_id, ...respaldos]);
  if (faltan.length > 0) return fallo(409, 'modelo_no_disponible', 'Ese modelo no está encendido y probado.', { detalles: { ids: faltan } });

  const actual = modelosDelSnapshot(version.configuracion_snapshot);
  const advertencias: Advertencia[] = respaldos.length === 0 ? [{ codigo: 'sin_respaldo', mensaje: AVISO_SIN_RESPALDO }] : [];
  const compatibilidad = await compatibilidadVersion(ctx.datos, version.id, respaldos);
  const item = { version_id: version.id, despliegue_id: d.despliegue_id, respaldos_ids: respaldos };
  if (actual.despliegue_id === d.despliegue_id && JSON.stringify(actual.respaldos_ids) === JSON.stringify(respaldos)) {
    return exito({ item, sin_cambios: true, advertencias, compatibilidad });
  }
  await ctx.datos.actualizarVersion(version.id, {
    configuracion_snapshot: { ...(version.configuracion_snapshot || {}), despliegue_id: d.despliegue_id, despliegues_respaldo_ids: respaldos },
    actualizado_en: (ctx.ahora ? ctx.ahora() : new Date()).toISOString()
  });
  await bitacoraSinBloquear(
    ctx,
    {
      entidad: 'version',
      entidad_id: version.id,
      accion: 'asignar_modelo',
      valor_anterior: { despliegue_id: actual.despliegue_id, respaldos_ids: actual.respaldos_ids },
      valor_nuevo: { despliegue_id: d.despliegue_id, respaldos_ids: respaldos },
      actor_usuario_id: ctx.actorId
    },
    advertencias
  );
  return exito({ item, advertencias, compatibilidad });
}

// ---------------------------------------------------------------------------
// Bloque 4: B-3 duplicar a borrador y B-6 restaurar (B4).
// ---------------------------------------------------------------------------
export async function duplicarVersion(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const val = validar(esquemaDuplicar, req.body);
  if (!val.ok) return (val as Extract<typeof val, { ok: false }>).resultado;
  const d = (val as Extract<typeof val, { ok: true }>).datos;
  const origen = await versionOError(ctx, req.params.id);
  if (esResultado(origen)) return origen;
  if (await ctx.datos.existeNumeroVersion(origen.agente_id, d.numero_version)) {
    return fallo(409, 'numero_version_existente', 'Ya existe una versión con ese número.', { campo: 'numero_version' });
  }
  const nueva = await ctx.datos.duplicarVersion(origen, d.numero_version, d.notas_cambio ?? null, ctx.actorId);
  const advertencias: Advertencia[] = [];
  await bitacoraSinBloquear(
    ctx,
    { entidad: 'version', entidad_id: nueva.id, accion: 'crear', valor_nuevo: { duplicada_de: origen.id, numero_version: nueva.numero_version }, actor_usuario_id: ctx.actorId },
    advertencias
  );
  return exito({ item: nueva, advertencias }, 201);
}

export async function restaurarVersion(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const val = validar(esquemaRestaurar, req.body);
  if (!val.ok) return (val as Extract<typeof val, { ok: false }>).resultado;
  const d = (val as Extract<typeof val, { ok: true }>).datos;
  const version = await versionOError(ctx, req.params.id);
  if (esResultado(version)) return version;
  // Sus modelos tienen que seguir encendidos y probados; si no, mejor duplicar y elegir otro.
  const s = modelosDelSnapshot(version.configuracion_snapshot);
  const ids = [s.despliegue_id, ...s.respaldos_ids].filter((x): x is string => !!x);
  if (version.estado !== 'publicada' && (await noDisponibles(ctx.datos, ids)).length > 0) {
    return fallo(409, 'modelo_no_disponible', 'Esa versión usa un modelo apagado. Duplícala y elige otro modelo.');
  }
  // N5: desactivar la actual + publicar esta + apuntar el agente + bitácora, todo o nada.
  const r = await ctx.datos.restaurarVersionRpc({ versionId: version.id, nota: d.nota, actorId: ctx.actorId });
  if (r.ok === false) {
    if (r.error === 'no_encontrado') return fallo(404, 'no_encontrado', 'No encontramos esa versión.');
    if (r.error === 'no_restaurable') return fallo(409, 'no_restaurable', 'Solo puedes volver a una versión que ya estuvo publicada.');
    return fallo(500, 'error_interno', 'No pudimos restaurar la versión. Intenta de nuevo.');
  }
  return exito({
    item: { id: version.id, estado: 'publicada' },
    anterior_version_id: r.version_anterior_id ?? null,
    sin_cambios: r.sin_cambios === true,
    aplica_en_s: 60
  });
}

