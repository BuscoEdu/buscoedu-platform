/**
 * E1 · Frontend — Adaptador REAL (fetch) del panel «IA multiproveedor».
 *
 * Qué hace: implementa `ClienteAdminIa` llamando a las rutas `/api/admin/ia/...` del contrato
 * `docs/backend/README-e1-api.md` y traduce cada respuesta:
 *   - `{ ok: true, ... }` → `{ tipo: 'ok', datos }`;
 *   - 403 → `{ tipo: 'sin_permiso' }` (A9);
 *   - `{ ok: false, error, mensaje, campo, detalles, impacto }` → `ErrorApi` con el HTTP.
 * Para qué: que las pantallas usen datos reales sin llamar `fetch` directo.
 *
 * Estado: EN USO. Backend implementó todas las rutas en 2759bc2 (fase 2). Aquí además se
 * normalizan los campos que la API puede mandar en null (clave de un proveedor nuevo, actor de
 * la bitácora, cifras de gasto) para que las pantallas no tengan que adivinar.
 */

import type { ClienteAdminIa } from './cliente';
import type { AgenteConVersiones, ErrorApi, Resultado, VersionAgente } from './tipos';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Petición genérica.
 * Qué hace: hace la llamada con cookies de sesión y sin caché, y normaliza éxito/errores.
 * Para qué: un solo lugar para el formato de error común (§0) y el 403.
 * ──────────────────────────────────────────────────────────────────────────── */

const BASE = '/api/admin/ia';

/** Mensaje de respaldo cuando la API no trae `mensaje` (rutas genéricas antiguas solo traen `error`). */
const MENSAJE_GENERICO = 'No pudimos completar la acción. Intenta de nuevo.';

type Json = Record<string, unknown>;

async function pedir<T>(metodo: 'GET' | 'POST' | 'PUT' | 'PATCH', ruta: string, body?: unknown, extraer?: (j: Json) => T): Promise<Resultado<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    return { tipo: 'error', http: 0, codigo: 'sin_conexion', mensaje: 'No hay conexión con el servidor. Revisa tu internet y reintenta.' };
  }
  if (res.status === 403) return { tipo: 'sin_permiso' };
  let json: Json = {};
  try {
    json = (await res.json()) as Json;
  } catch {
    /* respuesta sin JSON: se trata como error genérico */
  }
  if (res.ok && json.ok === true) {
    return { tipo: 'ok', datos: extraer ? extraer(json) : (json as unknown as T) };
  }
  const error: ErrorApi = {
    tipo: 'error',
    http: res.status,
    // Solo se usa `error` si es un código del contrato (snake_case); las rutas antiguas mandan
    // el mensaje crudo de la BD en `error` y eso nunca se muestra.
    codigo: typeof json.error === 'string' && /^[a-z0-9_]{1,60}$/.test(json.error) ? json.error : `http_${res.status}`,
    mensaje: typeof json.mensaje === 'string' ? json.mensaje : MENSAJE_GENERICO,
    campo: typeof json.campo === 'string' ? json.campo : undefined,
    detalles: json.detalles,
    impacto: (json.impacto as ErrorApi['impacto']) ?? undefined
  };
  return error;
}

/** Extractores frecuentes. El tipo final lo fija la firma de `ClienteAdminIa` (contrato). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const item = (j: Json): any => j.item;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const items = (j: Json): any => (Array.isArray(j.items) ? j.items : []);
const enc = encodeURIComponent;

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1b · Normalizadores de lo que la API puede mandar en null.
 * Qué hace: rellena con valores seguros (clave «sin configurar», actor «Sistema», cifras en 0).
 * Para qué: que un proveedor recién creado o un evento sin actor no rompan la pantalla.
 * ──────────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cualquiera = any;
const CLAVE_VACIA = { configurada: false, origen: null, actualizada_en: null, revocada_en: null };
const actorSeguro = (a: Cualquiera) => ({ id: a?.id ?? '', nombre: a?.nombre ?? (a?.id ? 'Usuario sin nombre' : 'Sistema') });
const proveedor = (p: Cualquiera): Cualquiera =>
  p && {
    ...p,
    clave: p.clave ?? CLAVE_VACIA,
    usado_por: p.usado_por ?? { principal: 0, respaldo: 0 },
    salud: p.salud ?? { circuito_abierto_hasta: null },
    asistente: p.asistente ?? { paso: null, completo: false }
  };
const detalle = (p: Cualquiera): Cualquiera =>
  p && {
    ...proveedor(p),
    modelos: Array.isArray(p.modelos) ? p.modelos : [],
    bitacora: (Array.isArray(p.bitacora) ? p.bitacora : []).map((e: Cualquiera) => ({ ...e, actor: actorSeguro(e.actor) }))
  };
const gasto = (g: Cualquiera): Cualquiera =>
  g && {
    ...g,
    tope_diario_usd: g.tope_diario_usd ?? 0,
    umbral_alerta_pct: g.umbral_alerta_pct ?? 80,
    gasto_usd: g.gasto_usd ?? 0,
    pct_usado: g.pct_usado ?? 0,
    estado: g.estado ?? 'normal',
    intentos_sin_costo: g.intentos_sin_costo ?? 0,
    avisos: Array.isArray(g.avisos) ? g.avisos : [],
    bitacora: Array.isArray(g.bitacora) ? g.bitacora.map((e: Cualquiera) => ({ ...e, actor: actorSeguro(e.actor) })) : undefined
  };
const disponible = (m: Cualquiera): Cualquiera => ({ ...m, proveedor_nombre: m.proveedor_nombre ?? m.proveedor_codigo ?? 'Proveedor' });

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 2 · Agentes con versiones (rutas EXISTENTES, no del contrato E1).
 * Qué hace: lee `/agentes` y `/versiones?agente_id=` y saca del snapshot el principal y respaldos.
 * Para qué: la pantalla «Modelo por agente» (B1–B4) necesita saber qué versión editar.
 * TODO(README-e1-api.md): `requiere` (B3) no lo da ninguna ruta; se deja en false hasta que
 * Backend exponga `compatibilidad.requiere` también en lectura (hoy solo viene en B-2).
 * ──────────────────────────────────────────────────────────────────────────── */

async function listarAgentes(): Promise<Resultado<AgenteConVersiones[]>> {
  const ag = await pedir<Array<{ id: string; codigo: string; nombre: string; version_activa_id: string | null; activo: boolean }>>('GET', '/agentes', undefined, items);
  if (ag.tipo !== 'ok') return ag;
  const lista: AgenteConVersiones[] = [];
  for (const a of ag.datos.filter((x) => x.activo !== false)) {
    const vs = await pedir<Array<{ id: string; numero_version: string; estado: string; publicada_en: string | null; configuracion_snapshot: Json | null }>>('GET', `/versiones?agente_id=${enc(a.id)}`, undefined, items);
    if (vs.tipo !== 'ok') return vs;
    lista.push({
      id: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      version_activa_id: a.version_activa_id,
      versiones: vs.datos.map<VersionAgente>((v) => ({
        id: v.id,
        numero_version: v.numero_version,
        estado: v.estado,
        publicada_en: v.publicada_en,
        despliegue_id: typeof v.configuracion_snapshot?.despliegue_id === 'string' ? (v.configuracion_snapshot.despliegue_id as string) : null,
        respaldos_ids: Array.isArray(v.configuracion_snapshot?.despliegues_respaldo_ids) ? (v.configuracion_snapshot!.despliegues_respaldo_ids as string[]) : [],
        requiere: { json: false, herramientas: false }
      }))
    });
  }
  return { tipo: 'ok', datos: lista };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 3 · Implementación: un método por endpoint (ids del README entre paréntesis).
 * ──────────────────────────────────────────────────────────────────────────── */

export const clienteApi: ClienteAdminIa = {
  esEjemplo: false,

  listarPresets: () => pedir('GET', '/proveedores/presets', undefined, items), // P1
  listarProveedores: () => pedir('GET', '/proveedores', undefined, (j) => items(j).map(proveedor)), // P2
  crearProveedor: (body) => pedir('POST', '/proveedores', body, (j) => proveedor(j.item)), // P3
  obtenerProveedor: (id) => pedir('GET', `/proveedores/${enc(id)}`, undefined, (j) => detalle(j.item)), // P4
  actualizarProveedor: (id, body) => pedir('PATCH', `/proveedores/${enc(id)}`, body, (j) => proveedor(j.item)), // P5
  guardarClave: (id, clave) => pedir('PUT', `/proveedores/${enc(id)}/clave`, { clave }, (j) => ({ clave: (j.clave ?? CLAVE_VACIA) as never, advertencias: (j.advertencias as never) ?? [] })), // P6
  revocarClave: (id, c) => pedir('POST', `/proveedores/${enc(id)}/clave/revocar`, c, (j) => ({ clave: (j.clave ?? CLAVE_VACIA) as never })), // P7
  impactoProveedor: (id) => pedir('GET', `/proveedores/${enc(id)}/impacto`, undefined, (j) => j.impacto as never), // P8
  encenderProveedor: (id) => pedir('POST', `/proveedores/${enc(id)}/encender`, {}, item), // P9
  apagarProveedor: (id, c) => pedir('POST', `/proveedores/${enc(id)}/apagar`, c, item), // P10

  listarModelos: (proveedorId) => pedir('GET', `/despliegues?proveedor_id=${enc(proveedorId)}`, undefined, items), // M1
  crearModelo: (body) => pedir('POST', '/despliegues', body, item), // M2
  actualizarModelo: (id, body) => pedir('PATCH', `/despliegues/${enc(id)}`, body, item), // M3
  probarModelo: (id) => pedir('POST', `/despliegues/${enc(id)}/probar`, {}, (j) => ({ prueba: j.prueba as never, puede_encender: j.puede_encender === true })), // M4
  encenderModelo: (id) => pedir('POST', `/despliegues/${enc(id)}/encender`, {}, (j) => ({ item: j.item as never, advertencias: (j.advertencias as never) ?? [] })), // M5
  apagarModelo: (id, c) => pedir('POST', `/despliegues/${enc(id)}/apagar`, c, item), // M6
  impactoModelo: (id) => pedir('GET', `/despliegues/${enc(id)}/impacto`, undefined, (j) => j.impacto as never), // M7
  listarPrecios: (proveedorId) => pedir('GET', `/precios?proveedor_id=${enc(proveedorId)}`, undefined, items), // M8
  registrarPrecio: (body) => pedir('POST', '/precios', body, (j) => ({ precio_id: j.precio_id as string, reemplaza_precio_id: (j.reemplaza_precio_id as string) ?? null })), // M8

  listarAgentes,
  modelosDisponibles: (requiere) => pedir('GET', `/modelos-disponibles${requiere?.length ? `?requiere=${requiere.join(',')}` : ''}`, undefined, (j) => items(j).map(disponible)), // B-1
  asignarModelo: (versionId, body) => pedir('PUT', `/versiones/${enc(versionId)}/modelo`, body, (j) => ({ item: j.item as never, advertencias: (j.advertencias as never) ?? [], compatibilidad: j.compatibilidad as never })), // B-2
  duplicarVersion: (versionId, numero_version, notas_cambio) => pedir('POST', `/versiones/${enc(versionId)}/duplicar`, { numero_version, notas_cambio }, item), // B-3
  publicarVersion: (versionId) => pedir('POST', `/versiones/${enc(versionId)}/publicar`, {}, item), // B-5
  restaurarVersion: (versionId, nota) => pedir('POST', `/versiones/${enc(versionId)}/restaurar`, { nota, confirmar: true }, (j) => ({ anterior_version_id: (j.anterior_version_id as string) ?? null })), // B-6

  listarTopes: () => pedir('GET', '/topes', undefined, (j) => items(j).map(gasto)), // T1
  obtenerTope: (canal) => pedir('GET', `/topes/${enc(canal)}`, undefined, (j) => gasto(j.item)), // T2 (detalle en `item`, verificado en servicioTopes.verTope)
  guardarTope: (canal, body) => pedir('PUT', `/topes/${enc(canal)}`, body, (j) => gasto(j.item)), // T3
  consumo: (canal, dia) => pedir('GET', `/consumo?canal_codigo=${enc(canal)}${dia ? `&dia=${enc(dia)}` : ''}`, undefined, (j) => j as never), // T4
  listarAlertas: (estado, canal) => pedir('GET', `/alertas?estado=${estado}${canal ? `&canal_codigo=${enc(canal)}` : ''}`, undefined, items), // T5
  marcarAlertaVista: (id) => pedir('POST', `/alertas/${enc(id)}/vista`, {}, (j) => ({ sin_cambios: j.sin_cambios === true })) // T6
};
