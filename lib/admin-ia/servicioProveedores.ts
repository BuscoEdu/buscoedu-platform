/**
 * E1 · BA-036 — Proveedores (P1–P10 del README-e1-api): A1–A4, A7, A8, C1.
 *
 * Qué hace: presets, listar/ver/crear/editar proveedor, guardar/reemplazar/revocar la
 * clave en Vault (BA-035, nunca se devuelve), encender (exige clave + un modelo con
 * prueba vigente) y apagar con aviso de impacto y confirmación.
 * Para qué: el asistente «Agregar proveedor» y la pantalla Proveedores, sin código ni
 * redeploy, sin exponer claves.
 * Módulo puro: la BD llega en `ctx`.
 */

import { PRESETS_PROVEEDOR, URLS_PERMITIDAS, validarUrlBase } from '../agentes/llm/proveedores';
import type { TipoAdaptador } from '../agentes/llm/tipos';
import {
  ahoraDe,
  bitacoraSinBloquear,
  conexionDe,
  presetPorCodigo,
  usoPorModelo,
  type CtxAdmin,
  type Peticion
} from './contexto';
import type { EstadoClave, FilaModelo, FilaProveedor } from './datos';
import { CLAVES_PROHIBIDAS, contieneClaveProhibida, esquemaClave, esquemaCrearProveedor, esquemaEditarProveedor, validar } from './esquemas';
import { estadoPanel, estaEncendido, pruebaVigente, type PruebaConexion } from './estados';
import { exito, fallo, type Advertencia, type ResultadoApi } from './http';
import { aplicarInterruptor, exigirConfirmacion, impactoDe, MENSAJE_PRIMERO_PRUEBA, vistaModelo } from './servicioModelos';

const AYUDA_ELEGIR = {
  por_que: 'Cada proveedor habla distinto; elegirlo de una lista evita errores y URLs peligrosas.',
  para_que: 'Precargar el tipo de conexión y la URL permitida.'
};
const LIMITE_BORRADOR_BYTES = 16 * 1024;

// ---------------------------------------------------------------------------
// Bloque 1: P1 presets (lista fija en código, A2).
// ---------------------------------------------------------------------------
export async function listarPresets(): Promise<ResultadoApi> {
  return exito({
    items: PRESETS_PROVEEDOR.map((p) => ({
      codigo: p.codigo,
      nombre: p.nombre,
      tipo_adaptador: p.tipo_adaptador,
      url_base: p.url_base,
      urls_permitidas: URLS_PERMITIDAS[p.tipo_adaptador],
      url_editable: p.codigo === 'otro_compatible',
      variable_env_sugerida: p.codigo === 'abacus_ai' ? 'ABACUS_NAIA_DEPLOYMENT_TOKEN' : `LLM_${p.codigo.toUpperCase()}_API_KEY`,
      ayuda: AYUDA_ELEGIR
    }))
  });
}

// ---------------------------------------------------------------------------
// Bloque 2: vista de un proveedor (forma P2).
// ---------------------------------------------------------------------------
function vistaProveedor(
  p: FilaProveedor,
  extra: {
    clave: EstadoClave | null;
    modelos: FilaModelo[];
    pruebas: Map<string, PruebaConexion>;
    uso: Map<string, { principal: number; respaldo: number }>;
    circuito?: (id: string) => number | null;
  }
) {
  const conexion = conexionDe(p);
  const propios = extra.modelos.filter((m) => m.proveedor_id === p.id);
  const marcasDe = (m: FilaModelo) => ({
    modelo_config_en: m.config_actualizada_en ?? null,
    proveedor_config_en: p.config_actualizada_en ?? null,
    clave_actualizada_en: p.clave_actualizada_en ?? null,
    clave_revocada_en: p.clave_revocada_en ?? null
  });
  const pruebasPropias = propios.map((m) => ({ m, prueba: extra.pruebas.get(m.id) ?? null }));
  const ultima = pruebasPropias
    .filter((x) => x.prueba)
    .sort((a, b) => Date.parse(b.prueba!.creado_en) - Date.parse(a.prueba!.creado_en))[0];
  const algunaVigente = pruebasPropias.some((x) => pruebaVigente(x.prueba, marcasDe(x.m)));
  const circuitoHasta = propios.map((m) => extra.circuito?.(m.id) ?? null).filter((x): x is number => !!x).sort((a, b) => b - a)[0] ?? null;
  const uso = propios.reduce(
    (acc, m) => {
      const u = extra.uso.get(m.id);
      return u ? { principal: acc.principal + u.principal, respaldo: acc.respaldo + u.respaldo } : acc;
    },
    { principal: 0, respaldo: 0 }
  );
  const encendido = estaEncendido(p);
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    descripcion: p.descripcion,
    preset_codigo: conexion.preset_codigo,
    tipo_adaptador: conexion.tipo_adaptador,
    url_base: conexion.url_base,
    encendido,
    archivado: p.activo === false || p.estado === 'archivado',
    // Compatibilidad con el panel actual (catálogo de proveedores).
    tipo_proveedor: p.tipo_proveedor ?? null,
    estado: p.estado,
    activo: p.activo,
    estado_panel: estadoPanel({
      clave_configurada: extra.clave?.configurada === true,
      modelos: propios.length,
      alguna_prueba_vigente: algunaVigente,
      ultima_prueba_fallida: !!ultima && ultima.prueba!.exitosa === false,
      encendido,
      circuito_abierto: !!circuitoHasta
    }),
    // Nunca el valor de la clave (A3): solo si está configurada, origen y fechas.
    clave: extra.clave
      ? { configurada: extra.clave.configurada, origen: extra.clave.origen, actualizada_en: extra.clave.actualizada_en, revocada_en: extra.clave.revocada_en }
      : null,
    ultima_prueba: ultima
      ? {
          exitosa: ultima.prueba!.exitosa,
          vigente: pruebaVigente(ultima.prueba, marcasDe(ultima.m)),
          latencia_ms: ultima.prueba!.latencia_ms,
          modelo_respondio: ultima.prueba!.modelo_respondio,
          probado_en: ultima.prueba!.creado_en
        }
      : null,
    salud: { circuito_abierto_hasta: circuitoHasta ? new Date(circuitoHasta).toISOString() : null },
    modelos: propios.length,
    usado_por: uso,
    asistente: { paso: p.asistente_paso ?? null, completo: encendido || (p.asistente_paso ?? 0) >= 5 },
    actualizado_en: p.actualizado_en ?? null
  };
}

async function claveSegura(ctx: CtxAdmin, codigo: string): Promise<EstadoClave | null> {
  try {
    return await ctx.datos.estadoClave(codigo);
  } catch {
    return null;
  }
}

async function proveedorOError(ctx: CtxAdmin, id: string): Promise<FilaProveedor | ResultadoApi> {
  const p = await ctx.datos.obtenerProveedor(id);
  if (!p) return fallo(404, 'no_encontrado', 'No encontramos ese proveedor.');
  return p;
}
const esResultado = (x: unknown): x is ResultadoApi => !!x && typeof x === 'object' && 'status' in (x as object) && 'body' in (x as object);

// ---------------------------------------------------------------------------
// Bloque 3: P2 listar y P4 ver (con bitácora y asistente).
// ---------------------------------------------------------------------------
export async function listarProveedores(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const incluirArchivados = req.query.get('incluir_archivados') === 'true';
  const [proveedores, modelos, versiones] = await Promise.all([
    ctx.datos.listarProveedores(incluirArchivados),
    ctx.datos.listarModelos({}),
    ctx.datos.versionesPublicadas()
  ]);
  const [pruebas, claves] = await Promise.all([
    ctx.datos.ultimasPruebas(modelos.map((m) => m.id)),
    Promise.all(proveedores.map((p) => claveSegura(ctx, p.codigo)))
  ]);
  const uso = usoPorModelo(versiones);
  return exito({
    items: proveedores.map((p, i) => vistaProveedor(p, { clave: claves[i], modelos, pruebas, uso, circuito: ctx.circuitoAbiertoHasta }))
  });
}

export async function verProveedor(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const p = await proveedorOError(ctx, req.params.id);
  if (esResultado(p)) return p;
  const [modelos, versiones, clave, bitClaves, bitConfig] = await Promise.all([
    ctx.datos.listarModelos({ proveedorId: p.id }),
    ctx.datos.versionesPublicadas(),
    claveSegura(ctx, p.codigo),
    ctx.datos.bitacoraClaves(p.id),
    ctx.datos.leerBitacora('proveedor', p.id)
  ]);
  const pruebas = await ctx.datos.ultimasPruebas(modelos.map((m) => m.id));
  const uso = usoPorModelo(versiones);
  const precios = await Promise.all(modelos.map((m) => ctx.datos.precioVigente(p.codigo, m.modelo).catch(() => null)));
  const eventos = [
    ...bitClaves.map((b) => ({ accion: `clave_${b.accion}`, actor_usuario_id: b.actor_usuario_id, creado_en: b.creado_en })),
    ...bitConfig.map((b) => ({
      accion: b.accion as string,
      actor_usuario_id: (b.actor_usuario_id as string) ?? null,
      creado_en: b.creado_en as string,
      valor_anterior: b.valor_anterior ?? null,
      valor_nuevo: b.valor_nuevo ?? null,
      nota: b.nota ?? null
    }))
  ]
    .sort((a, b) => Date.parse(b.creado_en) - Date.parse(a.creado_en))
    .slice(0, 50);
  const nombres = await ctx.datos.nombresActores(eventos.map((e) => e.actor_usuario_id).filter(Boolean) as string[]);
  return exito({
    item: {
      ...vistaProveedor(p, { clave, modelos, pruebas, uso, circuito: ctx.circuitoAbiertoHasta }),
      modelos: modelos.map((m, i) => vistaModelo(m, { proveedor: p, prueba: pruebas.get(m.id), precio: precios[i], uso: uso.get(m.id) })),
      bitacora: eventos.map(({ actor_usuario_id, ...e }) => ({
        ...e,
        actor: actor_usuario_id ? { id: actor_usuario_id, nombre: nombres.get(actor_usuario_id) ?? null } : null
      })),
      asistente: { paso: p.asistente_paso ?? null, borrador: p.asistente_borrador ?? null }
    }
  });
}

// ---------------------------------------------------------------------------
// Bloque 4: P3 crear (paso 1 «Elegir») y P5 editar (A2, A8).
// ---------------------------------------------------------------------------
export async function crearProveedor(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const v = validar(esquemaCrearProveedor, req.body);
  if (!v.ok) return (v as Extract<typeof v, { ok: false }>).resultado;
  const d = (v as Extract<typeof v, { ok: true }>).datos;
  const preset = presetPorCodigo(d.preset_codigo)!;
  const esOtro = preset.codigo === 'otro_compatible';
  const codigo = d.codigo ?? (esOtro ? undefined : preset.codigo);
  if (!codigo) return fallo(400, 'codigo_invalido', 'El código solo admite minúsculas, números y _ (3 a 40).', { campo: 'codigo' });

  // A2: «Otro compatible» solo con URL de la lista; los demás usan la del preset.
  let url = preset.url_base;
  if (esOtro) {
    const r = validarUrlBase(preset.tipo_adaptador, d.url_base ?? null);
    if (!r.ok) return fallo(400, 'url_no_permitida', (r as Extract<typeof r, { ok: false }>).motivo, { campo: 'url_base' });
    url = (r as Extract<typeof r, { ok: true }>).url;
  }

  const existente = await ctx.datos.proveedorPorCodigo(codigo);
  if (existente) {
    return fallo(409, 'codigo_existente', 'Ya existe un proveedor con ese código.', { detalles: { id: existente.id } });
  }
  const fila = await ctx.datos.insertarProveedor({
    codigo,
    nombre: d.nombre ?? preset.nombre,
    descripcion: d.descripcion ?? null,
    tipo_proveedor: 'llm',
    estado: 'inactivo', // P5: configurado ≠ en uso; se enciende tras probar.
    activo: true,
    preset_codigo: preset.codigo,
    tipo_adaptador: preset.tipo_adaptador,
    url_base: url,
    asistente_paso: 2
  });
  const advertencias: Advertencia[] = [];
  await bitacoraSinBloquear(
    ctx,
    { entidad: 'proveedor', entidad_id: fila.id, accion: 'crear', valor_nuevo: { codigo, preset_codigo: preset.codigo, url_base: url }, actor_usuario_id: ctx.actorId },
    advertencias
  );
  return exito(
    { item: vistaProveedor(fila, { clave: null, modelos: [], pruebas: new Map(), uso: new Map() }), advertencias },
    201
  );
}

const NO_EDITABLES = ['codigo', 'estado', 'activo', 'preset_codigo', 'tipo_adaptador', 'origen_secreto', 'referencia_secreto', ...CLAVES_PROHIBIDAS];

export async function editarProveedor(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  for (const k of Object.keys(body)) {
    if (NO_EDITABLES.includes(k.toLowerCase())) {
      return fallo(400, 'campo_no_editable', 'Ese dato se cambia con su botón (Encender/Apagar o Clave).', { campo: k });
    }
  }
  const v = validar(esquemaEditarProveedor, body);
  if (!v.ok) return (v as Extract<typeof v, { ok: false }>).resultado;
  const d = (v as Extract<typeof v, { ok: true }>).datos;
  const p = await proveedorOError(ctx, req.params.id);
  if (esResultado(p)) return p;

  // A8: el borrador del asistente nunca lleva claves y tiene tamaño acotado.
  if (d.asistente?.borrador !== undefined) {
    if (contieneClaveProhibida(d.asistente.borrador)) {
      return fallo(400, 'borrador_con_clave', 'La clave no se guarda en el borrador; usa el paso Clave.', { campo: 'asistente.borrador' });
    }
    if (JSON.stringify(d.asistente.borrador).length > LIMITE_BORRADOR_BYTES) {
      return fallo(400, 'borrador_muy_grande', 'El borrador es demasiado grande.', { campo: 'asistente.borrador' });
    }
  }

  const patch: Record<string, unknown> = {};
  const conexion = conexionDe(p);
  if (d.nombre !== undefined && d.nombre !== p.nombre) patch.nombre = d.nombre;
  if (d.descripcion !== undefined && d.descripcion !== p.descripcion) patch.descripcion = d.descripcion;
  if (d.url_base !== undefined && d.url_base !== conexion.url_base) {
    if (conexion.preset_codigo !== 'otro_compatible') {
      return fallo(400, 'url_no_editable', 'La URL de este proveedor es fija.', { campo: 'url_base' });
    }
    if (estaEncendido(p)) return fallo(409, 'apaga_antes_de_cambiar_url', 'Apaga el proveedor antes de cambiar la URL.', { campo: 'url_base' });
    const r = validarUrlBase((conexion.tipo_adaptador || 'openai_compatible') as TipoAdaptador, d.url_base);
    if (!r.ok) return fallo(400, 'url_no_permitida', (r as Extract<typeof r, { ok: false }>).motivo, { campo: 'url_base' });
    patch.url_base = (r as Extract<typeof r, { ok: true }>).url;
  }
  if (d.asistente) {
    if (d.asistente.paso !== p.asistente_paso) patch.asistente_paso = d.asistente.paso;
    if (d.asistente.borrador !== undefined) patch.asistente_borrador = d.asistente.borrador;
  }
  if (Object.keys(patch).length === 0) return exito({ item: { id: p.id }, sin_cambios: true });

  const ahora = ahoraDe(ctx).toISOString();
  patch.actualizado_en = ahora;
  if (patch.url_base) patch.config_actualizada_en = ahora; // N2: invalida pruebas de sus modelos.
  const fila = await ctx.datos.actualizarProveedor(p.id, patch);

  const advertencias: Advertencia[] = [];
  const visibles = Object.keys(patch).filter((k) => !['actualizado_en', 'config_actualizada_en', 'asistente_borrador'].includes(k));
  if (visibles.length > 0) {
    await bitacoraSinBloquear(
      ctx,
      {
        entidad: 'proveedor',
        entidad_id: p.id,
        accion: 'editar',
        valor_anterior: Object.fromEntries(visibles.map((k) => [k, (p as unknown as Record<string, unknown>)[k] ?? null])),
        valor_nuevo: Object.fromEntries(visibles.map((k) => [k, patch[k]])),
        actor_usuario_id: ctx.actorId
      },
      advertencias
    );
  }
  if (patch.url_base) advertencias.push({ codigo: 'probar_de_nuevo', mensaje: 'Cambiaste la URL: prueba la conexión de nuevo.' });
  return exito({
    item: { id: fila.id, nombre: fila.nombre, url_base: fila.url_base ?? null, asistente: { paso: fila.asistente_paso ?? null } },
    advertencias
  });
}

// ---------------------------------------------------------------------------
// Bloque 5: P6 guardar/reemplazar clave y P7 revocar (A3, A4). La clave no se loguea.
// ---------------------------------------------------------------------------
export async function guardarClave(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const v = validar(esquemaClave, req.body);
  if (!v.ok) return (v as Extract<typeof v, { ok: false }>).resultado;
  const p = await proveedorOError(ctx, req.params.id);
  if (esResultado(p)) return p;
  const r = await ctx.datos.guardarClave(p.codigo, (v as Extract<typeof v, { ok: true }>).datos.clave, ctx.actorId);
  if (r.ok === false) {
    if (r.error === 'clave_invalida') return fallo(400, 'clave_invalida', 'La clave es demasiado corta o demasiado larga.', { campo: 'clave' });
    if (r.error === 'proveedor_inexistente') return fallo(404, 'proveedor_inexistente', 'No encontramos ese proveedor.');
    return fallo(500, 'error_guardar_clave', 'No pudimos guardar la clave. Intenta de nuevo.', { detalles: { sqlstate: r.sqlstate ?? null } });
  }
  const clave = await claveSegura(ctx, p.codigo);
  return exito({
    accion: r.accion ?? 'guardar',
    clave: clave ?? { configurada: true, origen: 'vault', actualizada_en: null, revocada_en: null },
    advertencias: [{ codigo: 'probar_de_nuevo', mensaje: 'Cambiaste la clave: prueba la conexión de nuevo.' }]
  });
}

export async function revocarClave(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const p = await proveedorOError(ctx, req.params.id);
  if (esResultado(p)) return p;
  const modelos = await ctx.datos.listarModelos({ proveedorId: p.id });
  const impacto = await impactoDe(ctx, { tipo: 'proveedor', id: p.id, nombre: p.nombre }, modelos.map((m) => m.id));
  const pendiente = exigirConfirmacion(impacto, req.body);
  if (pendiente) return pendiente;
  const r = await ctx.datos.revocarClave(p.codigo, ctx.actorId);
  if (r.ok === false) {
    if (r.error === 'sin_clave_en_vault') return fallo(409, 'sin_clave_en_vault', 'Este proveedor no tiene una clave guardada en Vault.');
    if (r.error === 'proveedor_inexistente') return fallo(404, 'proveedor_inexistente', 'No encontramos ese proveedor.');
    return fallo(500, 'error_revocar_clave', 'No pudimos revocar la clave. Intenta de nuevo.', { detalles: { sqlstate: r.sqlstate ?? null } });
  }
  const clave = await claveSegura(ctx, p.codigo);
  return exito({ accion: 'revocar', clave: clave ?? { configurada: false }, impacto });
}

// ---------------------------------------------------------------------------
// Bloque 6: P8 impacto, P9 encender (A7), P10 apagar (C1), archivar.
// ---------------------------------------------------------------------------
async function impactoProveedorDe(ctx: CtxAdmin, p: FilaProveedor) {
  const modelos = await ctx.datos.listarModelos({ proveedorId: p.id });
  return impactoDe(ctx, { tipo: 'proveedor', id: p.id, nombre: p.nombre }, modelos.map((m) => m.id));
}

export async function impactoProveedor(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const p = await proveedorOError(ctx, req.params.id);
  if (esResultado(p)) return p;
  return exito({ impacto: await impactoProveedorDe(ctx, p) });
}

export async function encenderProveedor(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const p = await proveedorOError(ctx, req.params.id);
  if (esResultado(p)) return p;
  if (estaEncendido(p)) return exito({ item: { id: p.id, encendido: true }, sin_cambios: true, aplica_en_s: 60 });
  const conexion = conexionDe(p);
  if (conexion.tipo_adaptador && conexion.tipo_adaptador !== 'abacus') {
    const r = validarUrlBase(conexion.tipo_adaptador, conexion.url_base);
    if (!r.ok) return fallo(409, 'url_no_permitida', (r as Extract<typeof r, { ok: false }>).motivo);
  }
  const clave = await ctx.datos.estadoClave(p.codigo);
  if (!clave.configurada) return fallo(409, 'falta_clave', 'Primero guarda la clave del proveedor.');
  const modelos = await ctx.datos.listarModelos({ proveedorId: p.id });
  const vigentes = await Promise.all(modelos.map((m) => ctx.datos.pruebaVigente(m.id)));
  if (!vigentes.some(Boolean)) return fallo(409, 'primero_prueba_la_conexion', MENSAJE_PRIMERO_PRUEBA);
  const r = await aplicarInterruptor(ctx, 'proveedor', p.id, true, null);
  if (!r.ok) return (r as Extract<typeof r, { ok: false }>).resultado;
  return exito({ item: { id: p.id, encendido: true }, sin_cambios: (r as { sin_cambios: boolean }).sin_cambios, aplica_en_s: 60 });
}

export async function apagarProveedor(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const p = await proveedorOError(ctx, req.params.id);
  if (esResultado(p)) return p;
  if (!estaEncendido(p)) return exito({ item: { id: p.id, encendido: false }, sin_cambios: true });
  const impacto = await impactoProveedorDe(ctx, p);
  const pendiente = exigirConfirmacion(impacto, req.body);
  if (pendiente) return pendiente;
  const r = await aplicarInterruptor(ctx, 'proveedor', p.id, false, impacto);
  if (!r.ok) return (r as Extract<typeof r, { ok: false }>).resultado;
  return exito({ item: { id: p.id, encendido: false }, impacto, sin_cambios: (r as { sin_cambios: boolean }).sin_cambios, aplica_en_s: 60 });
}

export async function archivarProveedor(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const p = await proveedorOError(ctx, req.params.id);
  if (esResultado(p)) return p;
  if (p.activo === false || p.estado === 'archivado') return exito({ item: { id: p.id, archivado: true }, sin_cambios: true });
  if (estaEncendido(p)) return fallo(409, 'apaga_antes_de_archivar', 'Apaga el proveedor antes de archivarlo.');
  await ctx.datos.actualizarProveedor(p.id, { estado: 'archivado', activo: false, actualizado_en: ahoraDe(ctx).toISOString() });
  const advertencias: Advertencia[] = [];
  await bitacoraSinBloquear(ctx, { entidad: 'proveedor', entidad_id: p.id, accion: 'archivar', actor_usuario_id: ctx.actorId }, advertencias);
  return exito({ item: { id: p.id, archivado: true }, advertencias });
}
