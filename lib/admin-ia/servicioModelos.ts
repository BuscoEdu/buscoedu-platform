/**
 * E1 · BA-036 — Modelos de un proveedor (M1–M8 del README-e1-api): A5, A6, A7, C1.
 *
 * Qué hace: listar, crear y editar modelos (`despliegues_ia`) con validación de rangos;
 * probar conexión con el mensaje fijo; encender solo con prueba vigente (A7);
 * apagar con aviso de impacto y confirmación (C1); precios versionados.
 * Para qué: que el admin configure un modelo sin código y que nada llegue a un
 * estudiante sin una prueba exitosa.
 * Módulo puro: la BD y el probador llegan en `ctx`.
 */

import { despliegueDesdeFila, validarUrlBase, type FilaDespliegue } from '../agentes/llm/proveedores';
import type { DespliegueLLM, TipoAdaptador } from '../agentes/llm/tipos';
import {
  ahoraDe,
  bitacoraSinBloquear,
  capacidadesDe,
  conexionDe,
  errorInterruptor,
  parametrosDe,
  QUE_HACER,
  usoPorModelo,
  type CtxAdmin,
  type Peticion
} from './contexto';
import type { FilaModelo, FilaProveedor, PrecioVigente } from './datos';
import { esquemaConfirmacion, esquemaCrearModelo, esquemaEditarModelo, esquemaPrecio, validar } from './esquemas';
import { estaEncendido, pruebaVigente, type PruebaConexion } from './estados';
import { exito, fallo, type Advertencia, type ResultadoApi } from './http';
import { calcularImpacto, revisarConfirmacion, type Impacto } from './impacto';

// ---------------------------------------------------------------------------
// Bloque 1: vista de un modelo (forma M1) y cálculo de impacto compartido.
// ---------------------------------------------------------------------------

export function vistaModelo(
  m: FilaModelo,
  extra: { proveedor?: FilaProveedor | null; prueba?: PruebaConexion | null; precio?: PrecioVigente | null; uso?: { principal: number; respaldo: number } }
) {
  const p = extra.proveedor ?? null;
  const prueba = extra.prueba ?? null;
  const vigente = pruebaVigente(prueba, {
    modelo_config_en: m.config_actualizada_en ?? null,
    proveedor_config_en: p?.config_actualizada_en ?? null,
    clave_actualizada_en: p?.clave_actualizada_en ?? null,
    clave_revocada_en: p?.clave_revocada_en ?? null
  });
  const encendido = estaEncendido(m);
  return {
    id: m.id,
    proveedor_id: m.proveedor_id,
    proveedor_codigo: m.proveedores_ia?.codigo ?? p?.codigo ?? null,
    nombre: m.nombre,
    modelo: m.modelo,
    encendido,
    archivado: m.activo === false || m.estado === 'archivado',
    // Compatibilidad con el panel actual (lista de despliegues en versiones/[id]).
    estado: m.estado,
    activo: m.activo,
    estado_panel: prueba && !prueba.exitosa ? 'error' : !vigente ? 'configurado' : encendido ? 'encendido' : 'probado',
    parametros: parametrosDe(m),
    capacidades: capacidadesDe(m, p),
    precio_vigente: extra.precio ?? null,
    ultima_prueba: prueba
      ? {
          exitosa: prueba.exitosa,
          vigente,
          latencia_ms: prueba.latencia_ms,
          modelo_respondio: prueba.modelo_respondio,
          motivo_codigo: prueba.motivo_codigo,
          probado_en: prueba.creado_en
        }
      : null,
    usado_por: extra.uso ?? { principal: 0, respaldo: 0 }
  };
}

/** Impacto de dejar NO usables los modelos `apagar` (C1, §0.2 del contrato). */
export async function impactoDe(ctx: CtxAdmin, objetivo: Impacto['objetivo'], apagar: string[]): Promise<Impacto> {
  const [versiones, modelos, proveedores, borradores] = await Promise.all([
    ctx.datos.versionesPublicadas(),
    ctx.datos.listarModelos({}),
    ctx.datos.listarProveedores(false),
    ctx.datos.contarBorradoresQueUsan(apagar)
  ]);
  const provPorId = new Map(proveedores.map((p) => [p.id, p]));
  return calcularImpacto({
    objetivo,
    apagar,
    versiones,
    borradores,
    modelos: modelos.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      proveedor_id: m.proveedor_id,
      usable: estaEncendido(m) && !!provPorId.get(m.proveedor_id) && estaEncendido(provPorId.get(m.proveedor_id)!)
    }))
  });
}

/**
 * Protocolo de apagar/revocar (P7, P10, M6): sin confirmar → 409 con el impacto;
 * hash distinto → 409 impacto_cambio; mismo hash → `null` (se puede aplicar).
 */
export function exigirConfirmacion(impacto: Impacto, body: unknown): ResultadoApi | null {
  const v = validar(esquemaConfirmacion, body);
  if (!v.ok) return (v as Extract<typeof v, { ok: false }>).resultado;
  const decision = revisarConfirmacion(impacto, (v as Extract<typeof v, { ok: true }>).datos);
  if (decision === 'confirmacion_requerida') {
    return fallo(409, 'confirmacion_requerida', 'Revisa el impacto y confirma.', { impacto });
  }
  if (decision === 'impacto_cambio') {
    return fallo(409, 'impacto_cambio', 'Cambió lo que se vería afectado. Revisa el aviso otra vez.', { impacto });
  }
  return null;
}

async function modeloOError(ctx: CtxAdmin, id: string): Promise<FilaModelo | ResultadoApi> {
  const m = await ctx.datos.obtenerModelo(id);
  if (!m) return fallo(404, 'no_encontrado', 'No encontramos ese modelo.');
  return m;
}
const esResultado = (x: unknown): x is ResultadoApi => !!x && typeof x === 'object' && 'status' in (x as object) && 'body' in (x as object);

// ---------------------------------------------------------------------------
// Bloque 2: M1 listar.
// ---------------------------------------------------------------------------
export async function listarModelos(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const proveedorId = req.query.get('proveedor_id') || undefined;
  const [modelos, proveedores, versiones] = await Promise.all([
    ctx.datos.listarModelos({ proveedorId }),
    ctx.datos.listarProveedores(true),
    ctx.datos.versionesPublicadas()
  ]);
  const pruebas = await ctx.datos.ultimasPruebas(modelos.map((m) => m.id));
  const provPorId = new Map(proveedores.map((p) => [p.id, p]));
  const uso = usoPorModelo(versiones);
  const precios = await Promise.all(
    modelos.map((m) => ctx.datos.precioVigente(m.proveedores_ia?.codigo ?? provPorId.get(m.proveedor_id)?.codigo ?? '', m.modelo).catch(() => null))
  );
  return exito({
    items: modelos.map((m, i) =>
      vistaModelo(m, { proveedor: provPorId.get(m.proveedor_id), prueba: pruebas.get(m.id), precio: precios[i], uso: uso.get(m.id) })
    )
  });
}

/** Detalle de un modelo (misma forma que M1). */
export async function verModelo(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const m = await modeloOError(ctx, req.params.id);
  if (esResultado(m)) return m;
  const [proveedor, pruebas, versiones] = await Promise.all([
    ctx.datos.obtenerProveedor(m.proveedor_id),
    ctx.datos.ultimasPruebas([m.id]),
    ctx.datos.versionesPublicadas()
  ]);
  const precio = await ctx.datos.precioVigente(m.proveedores_ia?.codigo ?? proveedor?.codigo ?? '', m.modelo).catch(() => null);
  return exito({ item: vistaModelo(m, { proveedor, prueba: pruebas.get(m.id), precio, uso: usoPorModelo(versiones).get(m.id) }) });
}

// ---------------------------------------------------------------------------
// Bloque 3: M2 crear y M3 editar (A5).
// ---------------------------------------------------------------------------

/** Versión de precio cargada desde el panel: `panel-YYYYMMDDHHmmss` (UTC). */
export function versionPrecioPanel(ahora: Date): string {
  return `panel-${ahora.toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
}

async function guardarPrecio(
  ctx: CtxAdmin,
  proveedorCodigo: string,
  modelo: string | null,
  precios: { entrada_usd_1k: number; salida_usd_1k: number; es_estimado?: boolean }
): Promise<ResultadoApi | null> {
  const r = await ctx.datos.registrarPrecio({
    proveedor_codigo: proveedorCodigo,
    modelo: modelo || '*',
    entrada_usd_1k: precios.entrada_usd_1k,
    salida_usd_1k: precios.salida_usd_1k,
    version: versionPrecioPanel(ahoraDe(ctx)),
    fuente: 'panel',
    es_estimado: precios.es_estimado === true,
    actorId: ctx.actorId
  });
  if (r.ok === false) return errorPrecio(r);
  return null;
}

function errorPrecio(r: Record<string, unknown>): ResultadoApi {
  const motivo = typeof r.motivo === 'string' ? r.motivo : 'No pudimos guardar el precio.';
  switch (r.error) {
    case 'datos_incompletos':
    case 'precio_invalido':
      return fallo(400, String(r.error), motivo, { campo: 'precios' });
    case 'proveedor_inexistente':
      return fallo(404, 'proveedor_inexistente', 'No encontramos ese proveedor.');
    case 'version_existente':
      return fallo(409, 'version_existente', motivo);
    default:
      return fallo(500, 'error_guardar_precio', 'No pudimos guardar el precio. Intenta de nuevo.');
  }
}

export async function crearModelo(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const v = validar(esquemaCrearModelo, req.body);
  if (!v.ok) return (v as Extract<typeof v, { ok: false }>).resultado;
  const d = (v as Extract<typeof v, { ok: true }>).datos;

  const proveedor = await ctx.datos.obtenerProveedor(d.proveedor_id);
  if (!proveedor || proveedor.activo === false) return fallo(404, 'proveedor_inexistente', 'No encontramos ese proveedor.');
  const conexion = conexionDe(proveedor);
  const esAbacus = conexion.tipo_adaptador === 'abacus';

  // Abacus: identificador y token por NOMBRE de variable (el motor los exige). Otros: modelo obligatorio.
  if (!esAbacus && !d.modelo) return fallo(400, 'campo_requerido', 'Este dato es obligatorio.', { campo: 'modelo' });
  if (esAbacus && (!d.abacus?.identificador_externo || !d.abacus?.referencia_secreto)) {
    return fallo(400, 'campo_requerido', 'Abacus necesita los nombres de las variables del deployment y del token.', {
      campo: !d.abacus?.identificador_externo ? 'abacus.identificador_externo' : 'abacus.referencia_secreto'
    });
  }
  if (!esAbacus && conexion.tipo_adaptador) {
    const url = validarUrlBase(conexion.tipo_adaptador as TipoAdaptador, conexion.url_base);
    if (!url.ok) return fallo(400, 'url_no_permitida', (url as Extract<typeof url, { ok: false }>).motivo, { campo: 'url_base' });
  }

  // Precio primero: si falla, no queda un modelo sin precio (un precio huérfano es inocuo).
  const errPrecio = await guardarPrecio(ctx, proveedor.codigo, d.modelo ?? null, d.precios);
  if (errPrecio) return errPrecio;

  const parametros = { temperature: 0.4, max_tokens: 800, timeout_ms: 20000, ...(d.parametros || {}) };
  const fila = await ctx.datos.insertarModelo({
    proveedor_id: proveedor.id,
    nombre: d.nombre,
    modelo: d.modelo ?? null,
    identificador_externo: esAbacus ? d.abacus!.identificador_externo : null,
    referencia_secreto: esAbacus ? d.abacus!.referencia_secreto : d.referencia_secreto ?? null,
    estado: 'inactivo',
    activo: true,
    configuracion_tecnica: {
      tipo_adaptador: conexion.tipo_adaptador,
      url_base: esAbacus ? null : conexion.url_base,
      ...parametros,
      capacidades: { json: d.capacidades?.json === true, herramientas: d.capacidades?.herramientas === true }
    }
  });
  const advertencias: Advertencia[] = [];
  await bitacoraSinBloquear(
    ctx,
    { entidad: 'despliegue', entidad_id: fila.id, accion: 'crear', valor_nuevo: { nombre: fila.nombre, modelo: fila.modelo }, actor_usuario_id: ctx.actorId },
    advertencias
  );
  const precio = await ctx.datos.precioVigente(proveedor.codigo, fila.modelo).catch(() => null);
  return exito({ item: vistaModelo(fila, { proveedor, precio }), advertencias }, 201);
}

export async function editarModelo(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  for (const prohibido of ['estado', 'activo', 'proveedor_id']) {
    if (prohibido in body) {
      return fallo(400, 'campo_no_editable', 'Ese dato se cambia con su botón (Encender/Apagar).', { campo: prohibido });
    }
  }
  const v = validar(esquemaEditarModelo, body);
  if (!v.ok) return (v as Extract<typeof v, { ok: false }>).resultado;
  const d = (v as Extract<typeof v, { ok: true }>).datos;
  const actual = await modeloOError(ctx, req.params.id);
  if (esResultado(actual)) return actual;
  const proveedor = await ctx.datos.obtenerProveedor(actual.proveedor_id);

  const patch: Record<string, unknown> = {};
  let cambiaConexion = false;
  if (d.nombre !== undefined && d.nombre !== actual.nombre) patch.nombre = d.nombre;
  if (d.modelo !== undefined && d.modelo !== actual.modelo) {
    // B4: cambiar el modelo de algo en uso pasa por un borrador del agente.
    if (estaEncendido(actual)) {
      return fallo(409, 'apaga_o_crea_otro_modelo', 'Este modelo está en uso. Crea otro modelo y asígnalo al agente con Probar → Publicar.', {
        campo: 'modelo'
      });
    }
    patch.modelo = d.modelo;
    cambiaConexion = true;
  }
  const refs = { identificador_externo: d.abacus?.identificador_externo, referencia_secreto: d.abacus?.referencia_secreto ?? d.referencia_secreto };
  for (const [k, val] of Object.entries(refs)) {
    if (val !== undefined && val !== (actual as unknown as Record<string, unknown>)[k]) {
      patch[k] = val;
      cambiaConexion = true;
    }
  }
  const configActual = (actual.configuracion_tecnica || {}) as Record<string, unknown>;
  const configNueva: Record<string, unknown> = { ...configActual };
  if (d.parametros) Object.assign(configNueva, d.parametros);
  if (d.capacidades) configNueva.capacidades = { ...((configActual.capacidades as object) || {}), ...d.capacidades };
  if (JSON.stringify(configNueva) !== JSON.stringify(configActual)) patch.configuracion_tecnica = configNueva;

  if (Object.keys(patch).length === 0 && !d.precios) {
    return exito({ item: vistaModelo(actual, { proveedor }), sin_cambios: true });
  }
  if (d.precios) {
    const errPrecio = await guardarPrecio(ctx, proveedor?.codigo ?? actual.proveedores_ia?.codigo ?? '', actual.modelo, d.precios);
    if (errPrecio) return errPrecio;
  }
  let fila = actual;
  if (Object.keys(patch).length > 0) {
    const ahora = ahoraDe(ctx).toISOString();
    patch.actualizado_en = ahora;
    // N2: un cambio de conexión invalida la prueba (hay que probar de nuevo antes de encender).
    if (cambiaConexion) patch.config_actualizada_en = ahora;
    fila = await ctx.datos.actualizarModelo(actual.id, patch);
  }
  const advertencias: Advertencia[] = [];
  if (cambiaConexion) advertencias.push({ codigo: 'probar_de_nuevo', mensaje: 'Cambiaste la conexión: prueba la conexión de nuevo.' });
  const { actualizado_en: _a, config_actualizada_en: _c, ...visible } = patch;
  await bitacoraSinBloquear(
    ctx,
    {
      entidad: 'despliegue',
      entidad_id: actual.id,
      accion: 'editar',
      valor_anterior: Object.fromEntries(Object.keys(visible).map((k) => [k, (actual as unknown as Record<string, unknown>)[k] ?? null])),
      valor_nuevo: { ...visible, ...(d.precios ? { precios: d.precios } : {}) },
      actor_usuario_id: ctx.actorId
    },
    advertencias
  );
  return exito({ item: vistaModelo(fila, { proveedor }), advertencias });
}

// ---------------------------------------------------------------------------
// Bloque 4: M4 probar conexión (A6). Funciona con el modelo apagado.
// ---------------------------------------------------------------------------

/** Despliegue listo para probar: se fuerza «encendido» solo para esta prueba. */
export function despliegueParaPrueba(m: FilaModelo, p: FilaProveedor | null): DespliegueLLM {
  const conexion = p ? conexionDe(p) : { tipo_adaptador: null, url_base: null };
  const config = { ...((m.configuracion_tecnica || {}) as Record<string, unknown>) };
  if (!config.tipo_adaptador && conexion.tipo_adaptador) config.tipo_adaptador = conexion.tipo_adaptador;
  if (!config.url_base && conexion.url_base) config.url_base = conexion.url_base;
  const d = despliegueDesdeFila({
    ...(m as unknown as FilaDespliegue),
    configuracion_tecnica: config,
    proveedores_ia: { codigo: m.proveedores_ia?.codigo ?? p?.codigo ?? null, activo: true, estado: 'activo' }
  });
  return { ...d, proveedor_activo: true, despliegue_activo: true };
}

export async function probarModelo(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const m = await modeloOError(ctx, req.params.id);
  if (esResultado(m)) return m;
  if (ctx.permitirPrueba && !ctx.permitirPrueba(m.id)) {
    return fallo(429, 'demasiadas_pruebas', 'Espera un momento antes de probar otra vez.');
  }
  if (!ctx.probador) return fallo(500, 'error_interno', 'La prueba no está disponible.');
  const proveedor = await ctx.datos.obtenerProveedor(m.proveedor_id);
  const r = await ctx.probador(despliegueParaPrueba(m, proveedor));
  const exitosa = r.ok === true;
  await ctx.datos.insertarPrueba({
    despliegue_id: m.id,
    proveedor_id: m.proveedor_id,
    exitosa,
    latencia_ms: Math.max(0, Math.round(r.latencia_ms)),
    modelo_respondio: r.modelo,
    // CHECK de N1: una prueba exitosa no lleva motivo.
    motivo_codigo: exitosa ? null : r.motivo_codigo ?? 'respuesta_invalida',
    actor_usuario_id: ctx.actorId
  });
  const puedeEncender = exitosa ? await ctx.datos.pruebaVigente(m.id) : false;
  return exito({
    prueba: {
      exitosa,
      latencia_ms: r.latencia_ms,
      modelo_respondio: r.modelo,
      motivo_codigo: exitosa ? null : r.motivo_codigo,
      motivo: exitosa ? null : r.motivo,
      que_hacer: exitosa ? null : QUE_HACER[r.motivo_codigo || ''] ?? null,
      probado_en: ahoraDe(ctx).toISOString()
    },
    puede_encender: puedeEncender
  });
}

// ---------------------------------------------------------------------------
// Bloque 5: M5 encender (A7), M6 apagar y M7 impacto (C1), archivar.
// ---------------------------------------------------------------------------
export const MENSAJE_PRIMERO_PRUEBA = 'Primero prueba la conexión';

async function aplicarInterruptor(
  ctx: CtxAdmin,
  tipo: 'proveedor' | 'despliegue',
  id: string,
  encender: boolean,
  impacto: Impacto | null
): Promise<{ ok: true; sin_cambios: boolean } | { ok: false; resultado: ResultadoApi }> {
  // N4: estado + bitácora (con el impacto visto) en la misma transacción.
  const r = await ctx.datos.cambiarInterruptorRpc({ tipo, id, encender, impacto, actorId: ctx.actorId });
  if (r.ok === false) {
    const e = errorInterruptor(r);
    return { ok: false, resultado: fallo(e.status, e.error, e.mensaje) };
  }
  return { ok: true, sin_cambios: r.sin_cambios === true };
}
export { aplicarInterruptor };

export async function encenderModelo(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const m = await modeloOError(ctx, req.params.id);
  if (esResultado(m)) return m;
  if (estaEncendido(m)) return exito({ item: vistaModelo(m, {}), sin_cambios: true, aplica_en_s: 60 });
  if (!(await ctx.datos.pruebaVigente(m.id))) return fallo(409, 'primero_prueba_la_conexion', MENSAJE_PRIMERO_PRUEBA);
  const r = await aplicarInterruptor(ctx, 'despliegue', m.id, true, null);
  if (!r.ok) return (r as Extract<typeof r, { ok: false }>).resultado;
  const proveedor = await ctx.datos.obtenerProveedor(m.proveedor_id);
  const advertencias: Advertencia[] = [];
  if (!proveedor || !estaEncendido(proveedor)) {
    advertencias.push({ codigo: 'proveedor_apagado', mensaje: 'El proveedor está apagado: este modelo no se usará hasta encenderlo.' });
  }
  const fila = (await ctx.datos.obtenerModelo(m.id)) ?? m;
  return exito({ item: vistaModelo(fila, { proveedor }), sin_cambios: (r as { sin_cambios: boolean }).sin_cambios, aplica_en_s: 60, advertencias });
}

export async function impactoModelo(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const m = await modeloOError(ctx, req.params.id);
  if (esResultado(m)) return m;
  return exito({ impacto: await impactoDe(ctx, { tipo: 'despliegue', id: m.id, nombre: m.nombre }, [m.id]) });
}

export async function apagarModelo(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const m = await modeloOError(ctx, req.params.id);
  if (esResultado(m)) return m;
  if (!estaEncendido(m)) return exito({ item: vistaModelo(m, {}), sin_cambios: true });
  const impacto = await impactoDe(ctx, { tipo: 'despliegue', id: m.id, nombre: m.nombre }, [m.id]);
  const pendiente = exigirConfirmacion(impacto, req.body);
  if (pendiente) return pendiente;
  const r = await aplicarInterruptor(ctx, 'despliegue', m.id, false, impacto);
  if (!r.ok) return (r as Extract<typeof r, { ok: false }>).resultado;
  const fila = (await ctx.datos.obtenerModelo(m.id)) ?? m;
  return exito({ item: vistaModelo(fila, {}), impacto, sin_cambios: (r as { sin_cambios: boolean }).sin_cambios, aplica_en_s: 60 });
}

/** DELETE: archivado lógico; solo si está apagado (para apagar está el aviso de impacto). */
export async function archivarModelo(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const m = await modeloOError(ctx, req.params.id);
  if (esResultado(m)) return m;
  if (m.activo === false || m.estado === 'archivado') return exito({ item: { id: m.id, archivado: true }, sin_cambios: true });
  if (estaEncendido(m)) return fallo(409, 'apaga_antes_de_archivar', 'Apaga el modelo antes de archivarlo.');
  await ctx.datos.actualizarModelo(m.id, { estado: 'archivado', activo: false, actualizado_en: ahoraDe(ctx).toISOString() });
  const advertencias: Advertencia[] = [];
  await bitacoraSinBloquear(ctx, { entidad: 'despliegue', entidad_id: m.id, accion: 'archivar', actor_usuario_id: ctx.actorId }, advertencias);
  return exito({ item: { id: m.id, archivado: true }, advertencias });
}

// ---------------------------------------------------------------------------
// Bloque 6: M8 precios versionados.
// ---------------------------------------------------------------------------
export async function listarPrecios(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const proveedorId = req.query.get('proveedor_id');
  if (!proveedorId) return fallo(400, 'campo_requerido', 'Este dato es obligatorio.', { campo: 'proveedor_id' });
  return exito({ items: await ctx.datos.listarPrecios(proveedorId) });
}

export async function crearPrecio(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const v = validar(esquemaPrecio, req.body);
  if (!v.ok) return (v as Extract<typeof v, { ok: false }>).resultado;
  const d = (v as Extract<typeof v, { ok: true }>).datos;
  const r = await ctx.datos.registrarPrecio({
    proveedor_codigo: d.proveedor_codigo,
    modelo: d.modelo,
    entrada_usd_1k: d.entrada_usd_1k,
    salida_usd_1k: d.salida_usd_1k,
    version: d.version || versionPrecioPanel(ahoraDe(ctx)),
    fuente: d.fuente ?? 'panel',
    es_estimado: d.es_estimado === true,
    actorId: ctx.actorId
  });
  if (r.ok === false) return errorPrecio(r);
  return exito({ precio_id: r.precio_id ?? null, reemplaza_precio_id: r.reemplaza_precio_id ?? null }, 201);
}
