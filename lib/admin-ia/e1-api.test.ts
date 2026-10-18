/**
 * E1 · BA-036/037/038 parte API — Tests del contrato docs/backend/README-e1-api.md.
 *
 * Qué prueba (sin red ni BD; la BD es un doble en memoria):
 *   - 403 para quien no es super_admin y que cada ruta E1 pasa por `rutaAdminIa`.
 *   - Validaciones (A5 rangos con campo, D3/D4/máx. USD 1000, clave en borrador).
 *   - Aviso de impacto + confirmación con `impacto_hash` (apagar/revocar).
 *   - Encender exige prueba vigente (A7); B1/B3 al asignar/publicar.
 *   - Motor: tope cortado → C3 + alerta; alerta → registra y sigue; fallo de consulta
 *     o canal_inexistente → bloquea (fail-closed); canal `panel` no consulta ni alerta.
 *   - Costo con el precio vigente (Abacus `'*'` `estimado-2026-10`).
 * Para qué: que el contrato no se rompa sin que lo note `npm test`.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import type { CtxAdmin, Peticion } from './contexto';
import type { DatosAdminIa, FilaModelo, FilaProveedor } from './datos';
import { conSuperAdmin, ErrorDependenciaBd, resultadoDeError } from './http';
import { calcularImpacto } from './impacto';
import { crearLimitadorPruebas } from './limitador';
import { crearProbador } from './probador';
import { asignarModelo, restaurarVersion, validarModelosParaPublicar } from './servicioAgentes';
import { apagarModelo, crearModelo, editarModelo, encenderModelo, probarModelo } from './servicioModelos';
import { apagarProveedor, editarProveedor, revocarClave } from './servicioProveedores';
import { consumo, guardarTope, listarTopes, marcarAlertaVista } from './servicioTopes';
import { calcularCostoUsd, type RegistroLlamadaIa } from '../agentes/llm/costo';
import { CANAL_PANEL, verificarGastoAntesDeIa, type ControlGasto, type EstadoGastoCanal } from '../agentes/llm/gasto';
import { MENSAJE_SIN_IA_C3 } from '../agentes/llm/motor';
import { crearResolutorPrecios } from '../agentes/llm/precios';
import { prepararLlamadaIa } from '../agentes/llm/preparar';
import type { DespliegueLLM } from '../agentes/llm/tipos';

// ---------------------------------------------------------------------------
// Dobles
// ---------------------------------------------------------------------------
const P1 = '11111111-1111-4111-8111-111111111111';
const M1 = '22222222-2222-4222-8222-222222222222';
const M2 = '33333333-3333-4333-8333-333333333333';
const V1 = '44444444-4444-4444-8444-444444444444';

function proveedor(extra: Partial<FilaProveedor> = {}): FilaProveedor {
  return { id: P1, codigo: 'openai', nombre: 'OpenAI', descripcion: null, capacidades: null, estado: 'activo', activo: true, preset_codigo: 'openai', tipo_adaptador: 'openai', url_base: 'https://api.openai.com/v1', ...extra };
}
function modelo(extra: Partial<FilaModelo> = {}): FilaModelo {
  return {
    id: M1, proveedor_id: P1, nombre: 'GPT mini', modelo: 'gpt-4o-mini', identificador_externo: null, referencia_secreto: null,
    configuracion_tecnica: { tipo_adaptador: 'openai', capacidades: { json: true, herramientas: false } }, estado: 'activo', activo: true,
    proveedores_ia: { codigo: 'openai', estado: 'activo', activo: true }, ...extra
  };
}

function fakeDatos(over: Partial<DatosAdminIa> = {}): DatosAdminIa & { llamadas: string[] } {
  const llamadas: string[] = [];
  const base: DatosAdminIa = {
    listarProveedores: async () => [proveedor()],
    obtenerProveedor: async () => proveedor(),
    proveedorPorCodigo: async () => proveedor(),
    insertarProveedor: async (f) => ({ ...proveedor(), ...(f as object) }) as FilaProveedor,
    actualizarProveedor: async (_id, p) => ({ ...proveedor(), ...(p as object) }) as FilaProveedor,
    estadoClave: async () => ({ configurada: true, origen: 'vault', actualizada_en: null, revocada_en: null }),
    guardarClave: async () => ({ ok: true }),
    revocarClave: async () => { llamadas.push('revocarClave'); return { ok: true }; },
    bitacoraClaves: async () => [],
    listarModelos: async () => [modelo()],
    obtenerModelo: async () => modelo(),
    insertarModelo: async (f) => ({ ...modelo(), ...(f as object), id: M2 }) as FilaModelo,
    actualizarModelo: async (_id, p) => ({ ...modelo(), ...(p as object) }) as FilaModelo,
    ultimasPruebas: async () => new Map(),
    insertarPrueba: async (f) => { llamadas.push(`insertarPrueba:${f.exitosa}:${f.motivo_codigo}`); },
    registrarBitacora: async () => {},
    leerBitacora: async () => [],
    cambiarInterruptorRpc: async (p) => { llamadas.push(`interruptor:${p.tipo}:${p.encender}`); return { ok: true, sin_cambios: false }; },
    restaurarVersionRpc: async () => ({ ok: true, sin_cambios: false, version_anterior_id: null, version_activa_id: V1 }),
    pruebaVigente: async () => true,
    modeloDisponible: async () => true,
    versionesPublicadas: async () => [
      { agente_id: 'a1', agente_codigo: 'naia', agente_nombre: 'NaIA', version_id: V1, numero_version: '1', despliegue_id: M1, respaldos_ids: [] }
    ],
    contarBorradoresQueUsan: async () => 0,
    obtenerVersion: async () => ({ id: V1, agente_id: 'a1', numero_version: '2', estado: 'borrador', configuracion_snapshot: {}, publicada_en: null }),
    actualizarVersion: async (id) => ({ id, agente_id: 'a1', numero_version: '2', estado: 'borrador', configuracion_snapshot: {}, publicada_en: null }),
    requisitosVersion: async () => ({ json: true, herramientas: false }),
    existeNumeroVersion: async () => false,
    duplicarVersion: async (o, n) => ({ ...o, id: 'nueva', numero_version: n, estado: 'borrador' }),
    listarPrecios: async () => [],
    registrarPrecio: async () => { llamadas.push('registrarPrecio'); return { ok: true, precio_id: 'pr1' }; },
    precioVigente: async () => ({ entrada_usd_1k: 0.002, salida_usd_1k: 0.01, version: 'estimado-2026-10', es_estimado: true, modelo: '*' }),
    listarCanales: async () => [{ id: 'c1', codigo: 'web', nombre: 'Web', activo: true }],
    gastoHoy: async () => ({ ok: true, canal: 'web', dia_bogota: '2026-10-18', gasto_usd: 1, tope_diario_usd: 5, umbral_alerta_pct: 80, pct_usado: 20, estado: 'normal', motivos_alerta: [], precio_estimado: true, intentos_sin_costo: 0 }),
    actualizarTope: async () => { llamadas.push('actualizarTope'); return { ok: true }; },
    bitacoraTope: async () => [],
    consumo: async () => [],
    listarAlertas: async () => [],
    marcarAlertaVista: async () => ({ encontrada: true, ya_vista: false }),
    nombresActores: async () => new Map()
  };
  return Object.assign(base, over, { llamadas });
}

const ctxDe = (datos: DatosAdminIa, extra: Partial<CtxAdmin> = {}): CtxAdmin => ({ datos, actorId: 'actor-1', ahora: () => new Date('2026-10-18T15:00:00Z'), avisar: () => {}, ...extra });
const req = (p: Partial<Peticion> = {}): Peticion => ({ params: {}, query: new URLSearchParams(), body: {}, ...p });

// ---------------------------------------------------------------------------
// 1. Permisos (A9)
// ---------------------------------------------------------------------------
test('403: sin super_admin no corre el handler', async () => {
  let corrio = false;
  const r = await conSuperAdmin(async () => ({ ok: false }), async () => { corrio = true; return { status: 200, body: {} }; });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'forbidden');
  assert.equal(r.body.mensaje, 'No tienes permiso para esta sección.');
  assert.equal(corrio, false);
  const r2 = await conSuperAdmin(async () => { throw new Error('x'); }, async () => ({ status: 200, body: {} }));
  assert.equal(r2.status, 403);
});

test('403: cada route.ts E1 usa rutaAdminIa (requireSuperAdminApi)', () => {
  const raiz = join(process.cwd(), 'app/api/admin/ia');
  const e1 = [
    'proveedores/presets', 'proveedores', 'proveedores/[id]', 'proveedores/[id]/clave', 'proveedores/[id]/clave/revocar',
    'proveedores/[id]/impacto', 'proveedores/[id]/encender', 'proveedores/[id]/apagar', 'despliegues', 'despliegues/[id]',
    'despliegues/[id]/probar', 'despliegues/[id]/encender', 'despliegues/[id]/apagar', 'despliegues/[id]/impacto', 'precios',
    'modelos-disponibles', 'versiones/[id]/modelo', 'versiones/[id]/duplicar', 'versiones/[id]/restaurar', 'topes',
    'topes/[canal_codigo]', 'consumo', 'alertas', 'alertas/[id]/vista'
  ];
  for (const r of e1) {
    const src = readFileSync(join(raiz, r, 'route.ts'), 'utf8');
    const exportados = src.match(/export const (GET|POST|PUT|PATCH|DELETE)\b/g) || [];
    const envueltos = src.match(/export const (GET|POST|PUT|PATCH|DELETE) = rutaAdminIa\(/g) || [];
    assert.ok(exportados.length > 0 && exportados.length === envueltos.length, `${r} debe envolver todo en rutaAdminIa`);
  }
  // Y ninguna ruta del árbol admin/ia queda sin guard.
  const recorrer = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? recorrer(join(d, f)) : f === 'route.ts' ? [join(d, f)] : []));
  for (const f of recorrer(raiz)) {
    const src = readFileSync(f, 'utf8');
    assert.ok(/rutaAdminIa|protegerYObtenerServicio|crearHandlers(Coleccion|Elemento|Asociacion)|requireSuperAdminApi/.test(src), `${f} sin guard`);
  }
  assert.ok(readFileSync(join(process.cwd(), 'lib/admin-ia/ruta.ts'), 'utf8').includes('requireSuperAdminApi'));
});

test('errores de BD: objeto faltante → 503 dependencia_bd_pendiente; otro → 500 sin detalle', () => {
  const a = resultadoDeError(new ErrorDependenciaBd('20261018150000'), () => {});
  assert.equal(a.status, 503);
  assert.equal(a.body.error, 'dependencia_bd_pendiente');
  const b = resultadoDeError(new Error('detalle sql secreto'), () => {});
  assert.equal(b.status, 500);
  assert.equal(b.body.error, 'error_interno');
  assert.ok(!JSON.stringify(b.body).includes('secreto'));
});

// ---------------------------------------------------------------------------
// 2. Validaciones
// ---------------------------------------------------------------------------
test('A5: rangos de parámetros con campo; precios obligatorios', async () => {
  const ctx = ctxDe(fakeDatos());
  const base = { proveedor_id: P1, nombre: 'X', modelo: 'gpt-4o-mini', precios: { entrada_usd_1k: 0.1, salida_usd_1k: 0.2 } };
  let r = await crearModelo(ctx, req({ body: { ...base, parametros: { temperature: 3 } } }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'fuera_de_rango');
  assert.equal(r.body.campo, 'parametros.temperature');
  r = await crearModelo(ctx, req({ body: { ...base, parametros: { max_tokens: 9000 } } }));
  assert.equal(r.body.campo, 'parametros.max_tokens');
  r = await crearModelo(ctx, req({ body: { ...base, parametros: { timeout_ms: 500 } } }));
  assert.equal(r.body.campo, 'parametros.timeout_ms');
  r = await crearModelo(ctx, req({ body: { ...base, precios: { entrada_usd_1k: -1, salida_usd_1k: 0 } } }));
  assert.equal(r.body.error, 'precio_invalido');
  r = await crearModelo(ctx, req({ body: { ...base, referencia_secreto: 'PATH' } }));
  assert.equal(r.body.error, 'variable_no_permitida');
  r = await crearModelo(ctx, req({ body: base }));
  assert.equal(r.status, 201);
  assert.equal((r.body.item as { encendido: boolean }).encendido, false);
});

test('M3: estado/activo no se editan; cambiar el modelo encendido → 409', async () => {
  const ctx = ctxDe(fakeDatos());
  let r = await editarModelo(ctx, req({ params: { id: M1 }, body: { estado: 'activo' } }));
  assert.equal(r.body.error, 'campo_no_editable');
  r = await editarModelo(ctx, req({ params: { id: M1 }, body: { modelo: 'gpt-4o' } }));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'apaga_o_crea_otro_modelo');
});

test('A8: el borrador del asistente no acepta claves', async () => {
  const ctx = ctxDe(fakeDatos());
  const r = await editarProveedor(ctx, req({ params: { id: P1 }, body: { asistente: { paso: 2, borrador: { otro: { api_key: 'sk-xxxx' } } } } }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'borrador_con_clave');
  const r2 = await editarProveedor(ctx, req({ params: { id: P1 }, body: { clave: 'x' } }));
  assert.equal(r2.body.error, 'campo_no_editable');
});

test('D3/D4: tope > 0, máximo USD 1000 (tope_maximo), umbral 1–99', async () => {
  const datos = fakeDatos();
  const ctx = ctxDe(datos);
  const put = (body: unknown) => guardarTope(ctx, req({ params: { canal_codigo: 'web' }, body }));
  let r = await put({ tope_diario_usd: 0 });
  assert.equal(r.body.error, 'tope_invalido');
  assert.equal(r.body.campo, 'tope_diario_usd');
  r = await put({ tope_diario_usd: 1000.01 });
  assert.equal(r.body.error, 'tope_maximo');
  assert.equal(r.body.mensaje, 'El tope máximo es USD 1000 al día');
  r = await put({ umbral_alerta_pct: 100 });
  assert.equal(r.body.error, 'umbral_invalido');
  r = await put({});
  assert.equal(r.body.error, 'sin_cambios');
  assert.equal(datos.llamadas.includes('actualizarTope'), false);
  r = await put({ tope_diario_usd: 1000 });
  assert.equal(r.status, 200);
  assert.equal(datos.llamadas.includes('actualizarTope'), true);
});

test('T3: errores de fn_ia_actualizar_tope se traducen (tope_maximo de la BD)', async () => {
  const ctx = ctxDe(fakeDatos({ actualizarTope: async () => ({ ok: false, error: 'tope_maximo', motivo: 'El tope máximo es USD 1000 al día' }) }));
  const r = await guardarTope(ctx, req({ params: { canal_codigo: 'web' }, body: { tope_diario_usd: 10 } }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'tope_maximo');
  const ctx2 = ctxDe(fakeDatos({ actualizarTope: async () => ({ ok: false, error: 'canal_inexistente' }) }));
  assert.equal((await guardarTope(ctx2, req({ params: { canal_codigo: 'xx' }, body: { tope_diario_usd: 10 } }))).status, 404);
});

// ---------------------------------------------------------------------------
// 3. Impacto y confirmación (C1)
// ---------------------------------------------------------------------------
test('C1: apagar sin confirmar → 409 con impacto; hash distinto → impacto_cambio; hash igual → aplica (N4)', async () => {
  const datos = fakeDatos();
  const ctx = ctxDe(datos);
  let r = await apagarModelo(ctx, req({ params: { id: M1 } }));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'confirmacion_requerida');
  const impacto = r.body.impacto as { impacto_hash: string; mensaje: string; agentes_sin_ia: number };
  assert.equal(impacto.mensaje, '1 agente lo usa; 1 quedaría sin IA.');
  assert.match(impacto.impacto_hash, /^sha256:/);
  r = await apagarModelo(ctx, req({ params: { id: M1 }, body: { confirmar: true, impacto_hash: 'sha256:otro' } }));
  assert.equal(r.body.error, 'impacto_cambio');
  assert.equal(datos.llamadas.some((l) => l.startsWith('interruptor')), false);
  r = await apagarModelo(ctx, req({ params: { id: M1 }, body: { confirmar: true, impacto_hash: impacto.impacto_hash } }));
  assert.equal(r.status, 200);
  assert.ok(datos.llamadas.includes('interruptor:despliegue:false'));
});

test('C1: revocar clave y apagar proveedor exigen confirmación', async () => {
  const datos = fakeDatos();
  const ctx = ctxDe(datos);
  let r = await revocarClave(ctx, req({ params: { id: P1 } }));
  assert.equal(r.body.error, 'confirmacion_requerida');
  assert.equal(datos.llamadas.includes('revocarClave'), false);
  const hash = (r.body.impacto as { impacto_hash: string }).impacto_hash;
  r = await revocarClave(ctx, req({ params: { id: P1 }, body: { confirmar: true, impacto_hash: hash } }));
  assert.equal(r.status, 200);
  assert.ok(datos.llamadas.includes('revocarClave'));
  r = await apagarProveedor(ctx, req({ params: { id: P1 } }));
  assert.equal(r.body.error, 'confirmacion_requerida');
});

test('C1: el hash cambia si cambia lo afectado', () => {
  const base = {
    objetivo: { tipo: 'despliegue' as const, id: M1, nombre: 'm' },
    apagar: [M1],
    modelos: [{ id: M1, nombre: 'm', proveedor_id: P1, usable: true }, { id: M2, nombre: 'r', proveedor_id: P1, usable: true }],
    borradores: 0
  };
  const v = { agente_id: 'a', agente_codigo: 'a', agente_nombre: 'A', version_id: V1, numero_version: '1', despliegue_id: M1 };
  const a = calcularImpacto({ ...base, versiones: [{ ...v, respaldos_ids: [] }] });
  const b = calcularImpacto({ ...base, versiones: [{ ...v, respaldos_ids: [M2] }] });
  assert.equal(a.agentes_sin_ia, 1);
  assert.equal(b.agentes_sin_ia, 0);
  assert.notEqual(a.impacto_hash, b.impacto_hash);
});

test('N4: errores del interruptor se traducen (archivado → 409)', async () => {
  const ctx = ctxDe(fakeDatos({ obtenerModelo: async () => modelo({ estado: 'inactivo' }), cambiarInterruptorRpc: async () => ({ ok: false, error: 'archivado' }) }));
  const r = await encenderModelo(ctx, req({ params: { id: M1 } }));
  assert.equal(r.status, 409);
});

// ---------------------------------------------------------------------------
// 4. Probar / encender (A6, A7) y modelo por agente (B1, B3) y restaurar (N5)
// ---------------------------------------------------------------------------
test('A7: encender sin prueba vigente → 409 «Primero prueba la conexión»', async () => {
  const datos = fakeDatos({ obtenerModelo: async () => modelo({ estado: 'inactivo' }), pruebaVigente: async () => false });
  const r = await encenderModelo(ctxDe(datos), req({ params: { id: M1 } }));
  assert.equal(r.status, 409);
  assert.equal(r.body.mensaje, 'Primero prueba la conexión');
  assert.equal(datos.llamadas.some((l) => l.startsWith('interruptor')), false);
});

test('A6: probar guarda la prueba (motivo null si sale bien) y respeta el límite', async () => {
  const datos = fakeDatos();
  const ctx = ctxDe(datos, { probador: async () => ({ ok: true, latencia_ms: 120, modelo: 'gpt-4o-mini', motivo: null, motivo_codigo: null }), permitirPrueba: crearLimitadorPruebas({ maximo: 1 }) });
  const r = await probarModelo(ctx, req({ params: { id: M1 } }));
  assert.equal(r.status, 200);
  assert.equal(r.body.puede_encender, true);
  assert.ok(datos.llamadas.includes('insertarPrueba:true:null'));
  const r2 = await probarModelo(ctx, req({ params: { id: M1 } }));
  assert.equal(r2.status, 429);
});

test('Probador real: registra costo en canal panel y no lanza si falta la clave', async () => {
  const registros: RegistroLlamadaIa[] = [];
  const probar = crearProbador({
    lector: { obtener: async () => { throw Object.assign(new Error('sin clave'), { tipo: 'falta_clave' }); }, obtenerDeVault: async () => null } as never,
    clienteAbacus: {} as never,
    registroCosto: { registrar: async (r) => { registros.push(r); } }
  });
  const d: DespliegueLLM = { id: M1, nombre: 'm', proveedor_codigo: 'openai', modelo: 'gpt-4o-mini', identificador_externo: null, referencia_secreto: null, configuracion_tecnica: { tipo_adaptador: 'openai' }, proveedor_activo: true, despliegue_activo: true } as unknown as DespliegueLLM;
  const r = await probar(d);
  assert.equal(r.ok, false);
  assert.equal(registros.length, 1);
  assert.equal(registros[0].canal_codigo, CANAL_PANEL);
});

test('B1/B3: asignar exige modelos disponibles; publicar bloquea respaldo incompatible', async () => {
  let r = await asignarModelo(ctxDe(fakeDatos({ modeloDisponible: async () => false })), req({ params: { id: V1 }, body: { despliegue_id: M1 } }));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'modelo_no_disponible');
  r = await asignarModelo(ctxDe(fakeDatos()), req({ params: { id: V1 }, body: { despliegue_id: M1 } }));
  assert.equal(r.status, 200);
  assert.ok((r.body.advertencias as Array<{ codigo: string }>).some((a) => a.codigo === 'sin_respaldo'));
  r = await asignarModelo(ctxDe(fakeDatos({ obtenerVersion: async () => ({ id: V1, agente_id: 'a', numero_version: '1', estado: 'publicada', configuracion_snapshot: {}, publicada_en: 'x' }) })), req({ params: { id: V1 }, body: { despliegue_id: M1 } }));
  assert.equal(r.body.error, 'version_inmutable_publicada');

  const sinJson = fakeDatos({ obtenerModelo: async (id) => (id === M2 ? modelo({ id: M2, nombre: 'Respaldo', configuracion_tecnica: { capacidades: { json: false } } }) : modelo()) });
  const bloqueo = await validarModelosParaPublicar(sinJson, { id: V1, configuracion_snapshot: { despliegue_id: M1, despliegues_respaldo_ids: [M2] } });
  assert.equal(bloqueo?.status, 409);
  assert.equal(bloqueo?.body.error, 'respaldo_incompatible');
  assert.equal(await validarModelosParaPublicar(fakeDatos(), { id: V1, configuracion_snapshot: { despliegue_id: M1 } }), null);
});

test('N5: restaurar pide nota + confirmar y traduce no_restaurable', async () => {
  let r = await restaurarVersion(ctxDe(fakeDatos()), req({ params: { id: V1 }, body: { nota: 'ok' } }));
  assert.equal(r.status, 400);
  const ctx = ctxDe(fakeDatos({ restaurarVersionRpc: async () => ({ ok: false, error: 'no_restaurable' }) }));
  r = await restaurarVersion(ctx, req({ params: { id: V1 }, body: { nota: 'Volvemos por error', confirmar: true } }));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'no_restaurable');
});

// ---------------------------------------------------------------------------
// 5. Motor: tope antes de llamar a la IA (D5–D7)
// ---------------------------------------------------------------------------
function control(estado: EstadoGastoCanal | Error) {
  const log: string[] = [];
  const c: ControlGasto = {
    consultar: async (canal) => { log.push(`consultar:${canal}`); if (estado instanceof Error) throw estado; return estado; },
    registrarAlerta: async (canal) => { log.push(`alerta:${canal}`); }
  };
  return { c, log };
}
const principal: DespliegueLLM = { id: M1, nombre: 'Abacus', proveedor_codigo: 'abacus_ai', modelo: null, precios: null } as unknown as DespliegueLLM;
const contexto = { agente_codigo: 'naia', version_agente_id: V1, canal_codigo: 'web', modo_simulacion: false };
const resolutor = () => crearResolutorPrecios({ precioVigente: async () => ({ entrada_usd_1k: 0.002, salida_usd_1k: 0.01, version: 'estimado-2026-10', es_estimado: true }) });

test('Motor: cortado → no IA, texto C3, alerta y registro sin_ia', async () => {
  const { c, log } = control({ ok: true, estado: 'cortado', gasto_usd: 5, tope_diario_usd: 5 });
  const registros: RegistroLlamadaIa[] = [];
  const r = await prepararLlamadaIa({ control: c, precios: resolutor(), registroCosto: { registrar: async (x) => { registros.push(x); } }, contexto, principal, respaldos: [], avisar: () => {} });
  assert.equal(r.ok, false);
  assert.equal((r as { mensaje_estudiante: string }).mensaje_estudiante, MENSAJE_SIN_IA_C3);
  assert.equal((r as { motivo: string }).motivo, 'tope_diario');
  assert.deepEqual(log, ['consultar:web', 'alerta:web']);
  assert.equal(registros[0].resultado, 'sin_ia');
  assert.equal(registros[0].tipo_error, 'tope_diario');
  assert.equal(registros[0].evento, 'error_bot');
});

test('Motor: alerta → registra la alerta y sigue (con precio vigente)', async () => {
  const { c, log } = control({ ok: true, estado: 'alerta', motivos_alerta: ['umbral'] });
  const r = await prepararLlamadaIa({ control: c, precios: resolutor(), contexto, principal, respaldos: [], avisar: () => {} });
  assert.equal(r.ok, true);
  assert.deepEqual(log, ['consultar:web', 'alerta:web']);
  assert.equal((r as { principal: DespliegueLLM }).principal.precios?.version, 'estimado-2026-10');
});

test('Motor: si registrar la alerta falla, la decisión no cambia', async () => {
  const c: ControlGasto = { consultar: async () => ({ ok: true, estado: 'alerta' }), registrarAlerta: async () => { throw new Error('x'); } };
  assert.equal((await verificarGastoAntesDeIa(c, 'web', () => {})).permitir, true);
});

test('Motor: fallo de la consulta → bloquea + C3 (fail-closed)', async () => {
  const { c, log } = control(new Error('red'));
  const r = await prepararLlamadaIa({ control: c, precios: resolutor(), contexto, principal, respaldos: [], avisar: () => {} });
  assert.equal(r.ok, false);
  assert.equal((r as { motivo: string }).motivo, 'gasto_no_disponible');
  assert.equal((r as { mensaje_estudiante: string }).mensaje_estudiante, MENSAJE_SIN_IA_C3);
  assert.deepEqual(log, ['consultar:web']);
});

test('Motor: canal_inexistente (que no sea panel) → bloquea + C3', async () => {
  const { c } = control({ ok: false, error: 'canal_inexistente' });
  const r = await prepararLlamadaIa({ control: c, precios: resolutor(), contexto: { ...contexto, canal_codigo: 'telegram' }, principal, respaldos: [], avisar: () => {} });
  assert.equal(r.ok, false);
  assert.equal((r as { motivo: string }).motivo, 'gasto_no_disponible');
});

test('Motor: canal panel NO consulta fn_ia_gasto_hoy ni registra alertas', async () => {
  const { c, log } = control({ ok: false, error: 'canal_inexistente' });
  const d = await verificarGastoAntesDeIa(c, CANAL_PANEL, () => {});
  assert.equal(d.permitir, true);
  assert.deepEqual(log, []);
});

test('Motor: las simulaciones también pasan por el tope', async () => {
  const { c, log } = control({ ok: true, estado: 'cortado' });
  const r = await prepararLlamadaIa({ control: c, precios: resolutor(), contexto: { ...contexto, modo_simulacion: true }, principal, respaldos: [], avisar: () => {} });
  assert.equal(r.ok, false);
  assert.ok(log.includes('consultar:web'));
});

// ---------------------------------------------------------------------------
// 6. Costo con el precio vigente
// ---------------------------------------------------------------------------
test('Costo: Abacus * estimado-2026-10 → costo_estimado_usd con precio_version', async () => {
  const { c } = control({ ok: true, estado: 'normal' });
  const r = await prepararLlamadaIa({ control: c, precios: resolutor(), contexto, principal, respaldos: [{ ...principal, id: M2 }], avisar: () => {} });
  const listo = r as { principal: DespliegueLLM; respaldos: DespliegueLLM[] };
  assert.equal(listo.principal.precios?.es_estimado, true);
  assert.equal(listo.respaldos[0].precios?.version, 'estimado-2026-10');
  // 1.000 tokens de entrada + 500 de salida = 0,002 + 0,005.
  assert.equal(calcularCostoUsd(1000, 500, listo.principal.precios), 0.007);
});

test('Costo: si falla el precio vigente se queda el de la configuración', async () => {
  const res = crearResolutorPrecios({ precioVigente: async () => { throw new Error('x'); } }, { avisar: () => {} });
  const conConfig = { ...principal, precios: { entrada_usd_1k: 1, salida_usd_1k: 1, version: 'config' } } as DespliegueLLM;
  const { c } = control({ ok: true, estado: 'normal' });
  const r = await prepararLlamadaIa({ control: c, precios: res, contexto, principal: conConfig, respaldos: [], avisar: () => {} });
  assert.equal((r as { principal: DespliegueLLM }).principal.precios?.version, 'config');
});

test('T4: consumo usa el precio vigente cuando el costo es null y cuenta sin costo', async () => {
  const filas = [
    { proveedor_codigo: 'abacus_ai', modelo: null, resultado: 'exitoso', evento: null, tokens_entrada: 1000, tokens_salida: 1000, costo_estimado_usd: null, precio_version: null, modo_simulacion: false },
    { proveedor_codigo: 'abacus_ai', modelo: null, resultado: 'exitoso', evento: null, tokens_entrada: null, tokens_salida: null, costo_estimado_usd: null, precio_version: null, modo_simulacion: true }
  ];
  const ctx = ctxDe(fakeDatos({ consumo: async () => filas }));
  const r = await consumo(ctx, req({ query: new URLSearchParams('canal_codigo=web&dia=2026-10-18') }));
  const total = r.body.total as { gasto_usd: number; intentos_sin_costo: number; simulaciones: number };
  assert.equal(total.gasto_usd, 0.012);
  assert.equal(total.intentos_sin_costo, 1);
  assert.equal(total.simulaciones, 1);
  const malo = await consumo(ctx, req({ query: new URLSearchParams('canal_codigo=web&dia=2025-01-01') }));
  assert.equal(malo.body.error, 'dia_invalido');
});

test('T1/T6: avisos «precio estimado» y sin costo; marcar vista idempotente', async () => {
  const ctx = ctxDe(fakeDatos({ gastoHoy: async () => ({ ok: true, estado: 'alerta', dia_bogota: '2026-10-18', precio_estimado: true, intentos_sin_costo: 2, motivos_alerta: ['sin_costo'] }) }));
  const r = await listarTopes(ctx);
  const item = (r.body.items as Array<{ avisos: Array<{ mensaje: string }>; reinicia_en: string }>)[0];
  assert.deepEqual(item.avisos.map((a) => a.mensaje), ['precio estimado', 'Hay llamadas sin precio: carga el precio']);
  assert.equal(item.reinicia_en, '2026-10-19T00:00:00-05:00');
  const v = await marcarAlertaVista(ctxDe(fakeDatos({ marcarAlertaVista: async () => ({ encontrada: true, ya_vista: true }) })), req({ params: { id: 'x' } }));
  assert.equal(v.body.sin_cambios, true);
  const n = await marcarAlertaVista(ctxDe(fakeDatos({ marcarAlertaVista: async () => ({ encontrada: false, ya_vista: false }) })), req({ params: { id: 'x' } }));
  assert.equal(n.status, 404);
});
