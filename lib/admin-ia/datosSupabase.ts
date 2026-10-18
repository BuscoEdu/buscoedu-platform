/**
 * E1 · BA-036/037/038 — Acceso a datos real (Supabase, cliente service_role).
 *
 * Qué hace: implementa `DatosAdminIa` con tablas y RPC de Supabase. El endpoint ya
 * verificó super_admin antes de llegar aquí. Reglas:
 *   - Errores de Supabase → solo su código (nunca `message`, que puede traer datos).
 *   - Objeto inexistente (tabla/columna/función) porque la migración que lo crea aún
 *     no se aplicó en este entorno → `ErrorDependenciaBd` con el nombre de la
 *     migración → 503 `dependencia_bd_pendiente` (fail-closed, nunca se adivina).
 *   - Encender/apagar (N4) y restaurar versión (N5) van por funciones transaccionales.
 *   - La clave solo viaja como parámetro de `fn_ia_guardar_clave`; no se loguea.
 * Para qué: que los servicios no conozcan Supabase y que el orden de despliegue
 * (migraciones antes que código) se note con un error claro si se salta.
 * Sin alias `@/`: recibe el cliente ya creado.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DatosAdminIa,
  EstadoClave,
  FilaCostoIa,
  FilaModelo,
  FilaProveedor,
  FilaVersion,
  GastoHoy,
  PrecioVigente
} from './datos';
import type { PruebaConexion } from './estados';
import { ErrorDependenciaBd, esObjetoInexistente } from './http';
import { modelosDelSnapshot, type VersionPublicada } from './impacto';

/** Error de BD sin detalle (solo el código de Supabase/Postgres). */
export class ErrorBd extends Error {
  codigo: string;
  constructor(codigo: string | null | undefined) {
    super(`error_bd_${codigo || 'desconocido'}`);
    this.name = 'ErrorBd';
    this.codigo = codigo || 'desconocido';
  }
}

type ErrorSb = { code?: string | null } | null | undefined;

/** Lanza el error correcto: dependencia pendiente (si aplica) o error de BD. */
function revisar(error: ErrorSb, dependencia?: string): void {
  if (!error) return;
  if (dependencia && esObjetoInexistente(error)) throw new ErrorDependenciaBd(dependencia);
  throw new ErrorBd(error.code);
}

const COLUMNAS_MODELO =
  'id, proveedor_id, nombre, modelo, identificador_externo, referencia_secreto, configuracion_tecnica, estado, activo, actualizado_en, creado_en, proveedores_ia:proveedor_id(codigo, nombre, estado, activo)';
const COLUMNAS_ASISTENTE = ['asistente_paso', 'asistente_borrador'];
/** Migraciones de las que dependen los endpoints (nombre que viaja en el 503). */
const M110 = '20261018110000_ba035_vault_claves_ia';
const M130 = '20261018130000_ba034_registros_costo_ia';
const M140 = '20261018140000_ba038_tope_gasto_ia';
const M150 = '20261018150000_ba036_037_soporte_panel_ia';

const TIPOS_CONTRATO = new Set(['contrato_salida', 'contrato_salida_canal']);

export function crearDatosSupabase(db: SupabaseClient): DatosAdminIa {
  // Lee una fila de modelo con `select('*')` para recoger N2 (config_actualizada_en) si ya existe.
  const selectModelo = `*, proveedores_ia:proveedor_id(codigo, nombre, estado, activo)`;

  return {
    // --- Proveedores -------------------------------------------------------
    async listarProveedores(incluirArchivados) {
      let q = db.from('proveedores_ia').select('*').order('creado_en', { ascending: false });
      if (!incluirArchivados) q = q.eq('activo', true);
      const { data, error } = await q;
      revisar(error);
      return (data || []) as FilaProveedor[];
    },
    async obtenerProveedor(id) {
      const { data, error } = await db.from('proveedores_ia').select('*').eq('id', id).maybeSingle();
      revisar(error);
      return (data as FilaProveedor) ?? null;
    },
    async proveedorPorCodigo(codigo) {
      const { data, error } = await db.from('proveedores_ia').select('*').eq('codigo', codigo).maybeSingle();
      revisar(error);
      return (data as FilaProveedor) ?? null;
    },
    async insertarProveedor(fila) {
      const { data, error } = await db.from('proveedores_ia').insert(fila).select('*').single();
      revisar(error);
      return data as FilaProveedor;
    },
    async actualizarProveedor(id, patch) {
      const tocaAsistente = Object.keys(patch).some((k) => COLUMNAS_ASISTENTE.includes(k));
      const { data, error } = await db.from('proveedores_ia').update(patch).eq('id', id).select('*').single();
      revisar(error, tocaAsistente ? M150 : undefined);
      return data as FilaProveedor;
    },

    // --- Claves (BA-035, solo service_role) ---------------------------------
    async estadoClave(codigo) {
      const { data, error } = await db.rpc('fn_ia_estado_clave', { p_proveedor_codigo: codigo });
      revisar(error, M110);
      const r = (data || {}) as Record<string, unknown>;
      return {
        configurada: r.configurada === true,
        origen: (r.origen as string) ?? null,
        actualizada_en: (r.actualizada_en as string) ?? null,
        revocada_en: (r.revocada_en as string) ?? null
      } satisfies EstadoClave;
    },
    async guardarClave(codigo, clave, actorId) {
      const { data, error } = await db.rpc('fn_ia_guardar_clave', {
        p_proveedor_codigo: codigo,
        p_clave: clave,
        p_actor_usuario_id: actorId
      });
      revisar(error, M110);
      return (data || {}) as Record<string, unknown>;
    },
    async revocarClave(codigo, actorId) {
      const { data, error } = await db.rpc('fn_ia_revocar_clave', { p_proveedor_codigo: codigo, p_actor_usuario_id: actorId });
      revisar(error, M110);
      return (data || {}) as Record<string, unknown>;
    },
    async bitacoraClaves(proveedorId) {
      const { data, error } = await db
        .from('bitacora_claves_ia')
        .select('accion, actor_usuario_id, creado_en')
        .eq('proveedor_id', proveedorId)
        .order('creado_en', { ascending: false })
        .limit(50);
      revisar(error, M110);
      return (data || []) as Array<{ accion: string; actor_usuario_id: string | null; creado_en: string }>;
    },

    // --- Modelos -------------------------------------------------------------
    async listarModelos(filtro) {
      let q = db.from('despliegues_ia').select(selectModelo).eq('activo', true).order('creado_en', { ascending: false });
      if (filtro.proveedorId) q = q.eq('proveedor_id', filtro.proveedorId);
      const { data, error } = await q;
      revisar(error);
      return (data || []) as unknown as FilaModelo[];
    },
    async obtenerModelo(id) {
      const { data, error } = await db.from('despliegues_ia').select(selectModelo).eq('id', id).maybeSingle();
      revisar(error);
      return (data as unknown as FilaModelo) ?? null;
    },
    async insertarModelo(fila) {
      const { data, error } = await db.from('despliegues_ia').insert(fila).select(COLUMNAS_MODELO).single();
      revisar(error);
      return data as unknown as FilaModelo;
    },
    async actualizarModelo(id, patch) {
      const { data, error } = await db.from('despliegues_ia').update(patch).eq('id', id).select(selectModelo).single();
      revisar(error);
      return data as unknown as FilaModelo;
    },

    // --- Pruebas de conexión (N1) -------------------------------------------
    async ultimasPruebas(ids) {
      const mapa = new Map<string, PruebaConexion>();
      if (ids.length === 0) return mapa;
      const { data, error } = await db
        .from('pruebas_conexion_ia')
        .select('despliegue_id, exitosa, latencia_ms, modelo_respondio, motivo_codigo, creado_en')
        .in('despliegue_id', ids)
        .order('creado_en', { ascending: false })
        .limit(500);
      revisar(error, M150);
      for (const f of (data || []) as Array<PruebaConexion & { despliegue_id: string }>) {
        if (!mapa.has(f.despliegue_id)) mapa.set(f.despliegue_id, f);
      }
      return mapa;
    },
    async insertarPrueba(fila) {
      const { error } = await db.from('pruebas_conexion_ia').insert(fila);
      revisar(error, M150);
    },

    // --- Bitácora de configuración (N3) y funciones atómicas (N4/N5) ---------
    async registrarBitacora(evento) {
      const { error } = await db.from('bitacora_config_ia').insert(evento);
      revisar(error, M150);
    },
    async leerBitacora(entidad, entidadId) {
      const { data, error } = await db
        .from('bitacora_config_ia')
        .select('accion, valor_anterior, valor_nuevo, nota, actor_usuario_id, creado_en')
        .eq('entidad', entidad)
        .eq('entidad_id', entidadId)
        .order('creado_en', { ascending: false })
        .limit(50);
      revisar(error, M150);
      return (data || []) as Array<Record<string, unknown>>;
    },
    async cambiarInterruptorRpc(p) {
      const { data, error } = await db.rpc('fn_ia_cambiar_interruptor', {
        p_tipo: p.tipo,
        p_id: p.id,
        p_encender: p.encender,
        p_impacto: p.impacto ?? null,
        p_actor_usuario_id: p.actorId
      });
      revisar(error, M150);
      return (data || {}) as Record<string, unknown>;
    },
    async restaurarVersionRpc(p) {
      const { data, error } = await db.rpc('fn_ia_restaurar_version', {
        p_version_id: p.versionId,
        p_nota: p.nota,
        p_actor_usuario_id: p.actorId
      });
      revisar(error, M150);
      return (data || {}) as Record<string, unknown>;
    },
    async pruebaVigente(despliegueId) {
      const { data, error } = await db.rpc('fn_ia_prueba_vigente', { p_despliegue_id: despliegueId });
      revisar(error, M150);
      return data === true;
    },
    async modeloDisponible(despliegueId) {
      const { data, error } = await db.rpc('fn_ia_modelo_disponible', { p_despliegue_id: despliegueId });
      revisar(error, M150);
      return data === true;
    },

    // --- Versiones y agentes -------------------------------------------------
    async versionesPublicadas() {
      const { data: agentes, error } = await db
        .from('agentes_ia')
        .select('id, codigo, nombre, version_activa_id')
        .eq('activo', true)
        .not('version_activa_id', 'is', null);
      revisar(error);
      const lista = (agentes || []) as Array<{ id: string; codigo: string; nombre: string; version_activa_id: string }>;
      if (lista.length === 0) return [];
      const { data: versiones, error: e2 } = await db
        .from('versiones_agente_ia')
        .select('id, numero_version, estado, configuracion_snapshot')
        .in('id', lista.map((a) => a.version_activa_id));
      revisar(e2);
      const porId = new Map(((versiones || []) as FilaVersion[]).map((v) => [v.id, v]));
      const res: VersionPublicada[] = [];
      for (const a of lista) {
        const v = porId.get(a.version_activa_id);
        if (!v || v.estado !== 'publicada') continue;
        const s = modelosDelSnapshot(v.configuracion_snapshot);
        res.push({
          agente_id: a.id,
          agente_codigo: a.codigo,
          agente_nombre: a.nombre,
          version_id: v.id,
          numero_version: v.numero_version,
          despliegue_id: s.despliegue_id,
          respaldos_ids: s.respaldos_ids
        });
      }
      return res;
    },
    async contarBorradoresQueUsan(ids) {
      const { data, error } = await db.from('versiones_agente_ia').select('configuracion_snapshot').eq('estado', 'borrador').eq('activo', true);
      revisar(error);
      const set = new Set(ids);
      return ((data || []) as Array<{ configuracion_snapshot: unknown }>).filter((v) => {
        const s = modelosDelSnapshot(v.configuracion_snapshot);
        return [s.despliegue_id, ...s.respaldos_ids].some((id) => !!id && set.has(id));
      }).length;
    },
    async obtenerVersion(id) {
      const { data, error } = await db
        .from('versiones_agente_ia')
        .select('id, agente_id, numero_version, estado, configuracion_snapshot, publicada_en, notas_cambio')
        .eq('id', id)
        .maybeSingle();
      revisar(error);
      return (data as FilaVersion) ?? null;
    },
    async actualizarVersion(id, patch) {
      const { data, error } = await db
        .from('versiones_agente_ia')
        .update(patch)
        .eq('id', id)
        .select('id, agente_id, numero_version, estado, configuracion_snapshot, publicada_en, notas_cambio')
        .single();
      revisar(error);
      return data as FilaVersion;
    },
    async requisitosVersion(versionId) {
      const [ctx, her] = await Promise.all([
        db
          .from('versiones_agente_contextos')
          .select('componentes_contexto_ia:componente_contexto_id(tipo_contexto, activo)')
          .eq('version_agente_id', versionId)
          .eq('activo', true),
        db
          .from('agente_herramientas')
          .select('id', { count: 'exact', head: true })
          .eq('version_agente_id', versionId)
          .eq('activo', true)
          .eq('habilitada', true)
      ]);
      revisar(ctx.error);
      revisar(her.error);
      const json = ((ctx.data || []) as Array<{ componentes_contexto_ia?: { tipo_contexto?: string; activo?: boolean } | null }>).some(
        (r) => r.componentes_contexto_ia?.activo !== false && TIPOS_CONTRATO.has(r.componentes_contexto_ia?.tipo_contexto || '')
      );
      return { json, herramientas: (her.count || 0) > 0 };
    },
    async existeNumeroVersion(agenteId, numero) {
      const { count, error } = await db
        .from('versiones_agente_ia')
        .select('id', { count: 'exact', head: true })
        .eq('agente_id', agenteId)
        .eq('numero_version', numero);
      revisar(error);
      return (count || 0) > 0;
    },
    async duplicarVersion(origen, numero, notas, actorId) {
      // 1) La versión nueva (borrador) con el mismo snapshot.
      const { data: nueva, error } = await db
        .from('versiones_agente_ia')
        .insert({
          agente_id: origen.agente_id,
          numero_version: numero,
          estado: 'borrador',
          notas_cambio: notas,
          configuracion_snapshot: origen.configuracion_snapshot ?? null,
          creada_por: actorId
        })
        .select('id, agente_id, numero_version, estado, configuracion_snapshot, publicada_en, notas_cambio')
        .single();
      revisar(error);
      // 2) Copia de asociaciones activas (contextos, canales, herramientas, fuentes).
      for (const tabla of ['versiones_agente_contextos', 'configuraciones_agente_canal', 'agente_herramientas', 'agente_fuentes_contexto']) {
        const { data: filas, error: e1 } = await db.from(tabla).select('*').eq('version_agente_id', origen.id).eq('activo', true);
        revisar(e1);
        const copias = ((filas || []) as Array<Record<string, unknown>>).map((f) => {
          const { id: _id, creado_en: _c, actualizado_en: _a, ...resto } = f;
          return { ...resto, version_agente_id: (nueva as FilaVersion).id };
        });
        if (copias.length > 0) {
          const { error: e2 } = await db.from(tabla).insert(copias);
          revisar(e2);
        }
      }
      return nueva as FilaVersion;
    },

    // --- Precios (BA-038) ----------------------------------------------------
    async listarPrecios(proveedorId) {
      const { data, error } = await db
        .from('precios_modelo_ia')
        .select('id, modelo, version, entrada_usd_1k, salida_usd_1k, es_estimado, vigente_desde, vigente_hasta, fuente, creado_por')
        .eq('proveedor_id', proveedorId)
        .order('vigente_desde', { ascending: false });
      revisar(error, M140);
      return (data || []) as Array<Record<string, unknown>>;
    },
    async registrarPrecio(p) {
      const { data, error } = await db.rpc('fn_ia_registrar_precio', {
        p_proveedor_codigo: p.proveedor_codigo,
        p_modelo: p.modelo,
        p_entrada_usd_1k: p.entrada_usd_1k,
        p_salida_usd_1k: p.salida_usd_1k,
        p_version: p.version,
        p_fuente: p.fuente,
        p_es_estimado: p.es_estimado,
        p_actor_usuario_id: p.actorId
      });
      revisar(error, M140);
      return (data || {}) as Record<string, unknown>;
    },
    async precioVigente(proveedorCodigo, modelo) {
      const { data, error } = await db.rpc('fn_ia_precio_vigente', { p_proveedor_codigo: proveedorCodigo, p_modelo: modelo });
      revisar(error, M140);
      return (data as PrecioVigente) ?? null;
    },

    // --- Topes y alertas (BA-038) -------------------------------------------
    async listarCanales() {
      const { data, error } = await db.from('canales_ia').select('id, codigo, nombre, activo').order('codigo');
      revisar(error);
      return (data || []) as Array<{ id: string; codigo: string; nombre: string; activo: boolean }>;
    },
    async gastoHoy(canalCodigo) {
      const { data, error } = await db.rpc('fn_ia_gasto_hoy', { p_canal_codigo: canalCodigo });
      revisar(error, M140);
      return (data || { ok: false, error: 'sin_respuesta' }) as GastoHoy;
    },
    async actualizarTope(canalCodigo, tope, umbral, actorId) {
      const { data, error } = await db.rpc('fn_ia_actualizar_tope', {
        p_canal_codigo: canalCodigo,
        p_tope_diario_usd: tope,
        p_umbral_alerta_pct: umbral,
        p_actor_usuario_id: actorId
      });
      revisar(error, M140);
      return (data || {}) as Record<string, unknown>;
    },
    async bitacoraTope(canalCodigo) {
      const { data: canal, error } = await db.from('canales_ia').select('id').eq('codigo', canalCodigo).maybeSingle();
      revisar(error);
      if (!canal) return [];
      const { data: tope, error: e1 } = await db.from('topes_gasto_ia').select('id').eq('canal_id', (canal as { id: string }).id).maybeSingle();
      revisar(e1, M140);
      if (!tope) return [];
      const { data, error: e2 } = await db
        .from('bitacora_topes_gasto_ia')
        .select('campo, valor_anterior, valor_nuevo, actor_usuario_id, creado_en')
        .eq('tope_id', (tope as { id: string }).id)
        .order('creado_en', { ascending: false })
        .limit(20);
      revisar(e2, M140);
      return (data || []) as Array<Record<string, unknown>>;
    },
    async consumo(canalCodigo, desde, hasta) {
      const { data, error } = await db
        .from('registros_costo_ia')
        .select('proveedor_codigo, modelo, resultado, evento, tokens_entrada, tokens_salida, costo_estimado_usd, precio_version, modo_simulacion')
        .eq('canal_codigo', canalCodigo)
        .gte('creado_en', desde)
        .lt('creado_en', hasta)
        .limit(10000);
      revisar(error, M130);
      return (data || []) as FilaCostoIa[];
    },
    async listarAlertas(filtro) {
      let q = db
        .from('alertas_gasto_ia')
        .select('id, dia_bogota, tipo, gasto_usd, tope_usd, umbral_pct, creado_en, vista_en, canales_ia:canal_id(codigo)')
        .order('creado_en', { ascending: false })
        .limit(200);
      if (filtro.abiertas) q = q.is('vista_en', null);
      if (filtro.canalCodigo) {
        const { data: canal, error } = await db.from('canales_ia').select('id').eq('codigo', filtro.canalCodigo).maybeSingle();
        revisar(error);
        if (!canal) return [];
        q = q.eq('canal_id', (canal as { id: string }).id);
      }
      const { data, error } = await q;
      revisar(error, M140);
      return ((data || []) as Array<Record<string, unknown>>).map(({ canales_ia, ...resto }) => ({
        ...resto,
        canal_codigo: (canales_ia as { codigo?: string } | null)?.codigo ?? null
      }));
    },
    async marcarAlertaVista(id, actorId) {
      // N7: idempotente; la primera vez guarda quién (vista_por) y cuándo.
      const { data, error } = await db.rpc('fn_ia_marcar_alerta_vista', { p_alerta_id: id, p_actor_usuario_id: actorId });
      revisar(error, M150);
      const r = (data || {}) as Record<string, unknown>;
      if (r.ok === false && r.error === 'no_encontrado') return { encontrada: false, ya_vista: false };
      if (r.ok === false) throw new ErrorBd(String(r.sqlstate || r.error || 'rpc'));
      return { encontrada: true, ya_vista: r.sin_cambios === true };
    },

    // --- Varios ---------------------------------------------------------------
    async nombresActores(ids) {
      const mapa = new Map<string, string>();
      const unicos = [...new Set(ids.filter(Boolean))];
      if (unicos.length === 0) return mapa;
      const { data, error } = await db.from('usuarios_internos').select('id, nombres, apellidos').in('id', unicos);
      if (error) return mapa; // Solo es para mostrar nombres: si falla, se muestra el id.
      for (const u of (data || []) as Array<{ id: string; nombres: string; apellidos: string }>) {
        mapa.set(u.id, `${u.nombres} ${u.apellidos}`.trim());
      }
      return mapa;
    }
  };
}
