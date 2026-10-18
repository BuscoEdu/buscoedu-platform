/**
 * E1 · BA-038 parte API — Tope de gasto diario por canal, consumo y alertas (T1–T6): D1–D8.
 *
 * Qué hace:
 *   - Estado de gasto por canal desde `fn_ia_gasto_hoy` (día de America/Bogota), con
 *     avisos para el panel: «precio estimado» y «Hay llamadas sin precio: carga el precio».
 *   - Guarda tope/umbral con `fn_ia_actualizar_tope` tras validar D3/D4 y el máximo
 *     USD 1000/día (la BD también lo valida); devuelve la bitácora (D1).
 *   - Consumo del día por modelo y alertas (umbral, corte, sin_costo) con «marcar vista».
 * Para qué: evitar facturas sorpresa con un tope que se edita sin redeploy y nunca
 * existe «sin límite».
 * En E1 el «número» es el canal (`web`, `whatsapp`); el corte por línea queda para E2.
 * Módulo puro: la BD llega en `ctx`.
 */

import { ahoraDe, type CtxAdmin, type Peticion } from './contexto';
import type { GastoHoy, PrecioVigente } from './datos';
import { validarTope } from './esquemas';
import { exito, fallo, type ResultadoApi } from './http';
import { calcularCostoUsd } from '../agentes/llm/costo';

export const AYUDA_TOPE = {
  por_que: 'Evitar facturas sorpresa por errores, bucles o abuso.',
  para_que: 'Que la IA se detenga sola al llegar al tope y se reanude a las 00:00 de Bogotá.'
};
export const AVISO_PRECIO_ESTIMADO = 'precio estimado';
export const AVISO_SIN_COSTO = 'Hay llamadas sin precio: carga el precio';

// ---------------------------------------------------------------------------
// Bloque 1: día de Bogotá (UTC−5 fijo, sin horario de verano).
// ---------------------------------------------------------------------------
const OFFSET_BOGOTA_MS = -5 * 60 * 60 * 1000;

export function diaBogota(ahora: Date): string {
  return new Date(ahora.getTime() + OFFSET_BOGOTA_MS).toISOString().slice(0, 10);
}
export function inicioDiaBogota(dia: string): string {
  return `${dia}T00:00:00-05:00`;
}
export function diaSiguiente(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Bloque 2: vista del estado de gasto (D5, D8).
// ---------------------------------------------------------------------------
export function vistaGasto(canal: { codigo: string; nombre?: string | null }, g: GastoHoy, ahora: Date) {
  const dia = g.dia_bogota || diaBogota(ahora);
  const motivos = Array.isArray(g.motivos_alerta) ? g.motivos_alerta : [];
  const avisos: Array<{ codigo: string; mensaje: string; accion?: string }> = [];
  if (g.precio_estimado) avisos.push({ codigo: 'precio_estimado', mensaje: AVISO_PRECIO_ESTIMADO });
  if (motivos.includes('sin_costo') || (g.intentos_sin_costo ?? 0) > 0) {
    avisos.push({ codigo: 'sin_costo', mensaje: AVISO_SIN_COSTO, accion: 'POST /api/admin/ia/precios' });
  }
  return {
    canal_codigo: canal.codigo,
    canal_nombre: canal.nombre ?? canal.codigo,
    tope_diario_usd: g.tope_diario_usd ?? null,
    umbral_alerta_pct: g.umbral_alerta_pct ?? null,
    gasto_usd: g.gasto_usd ?? null,
    pct_usado: g.pct_usado ?? null,
    estado: g.estado ?? null,
    motivos_alerta: motivos,
    precio_estimado: g.precio_estimado === true,
    intentos_sin_costo: g.intentos_sin_costo ?? 0,
    dia_bogota: dia,
    reinicia_en: `${diaSiguiente(dia)}T00:00:00-05:00`,
    avisos,
    ayuda: AYUDA_TOPE
  };
}

async function canalOError(ctx: CtxAdmin, codigo: string) {
  const canales = await ctx.datos.listarCanales();
  const c = canales.find((x) => x.codigo === codigo);
  if (!c) return fallo(404, 'canal_inexistente', 'El número o canal no existe.');
  return c;
}

// ---------------------------------------------------------------------------
// Bloque 3: T1 lista, T2 detalle con bitácora, T3 guardar (D1, D3, D4, D7).
// ---------------------------------------------------------------------------
export async function listarTopes(ctx: CtxAdmin): Promise<ResultadoApi> {
  const canales = (await ctx.datos.listarCanales()).filter((c) => c.activo);
  const ahora = ahoraDe(ctx);
  const gastos = await Promise.all(canales.map((c) => ctx.datos.gastoHoy(c.codigo)));
  return exito({ items: canales.map((c, i) => vistaGasto(c, gastos[i], ahora)) });
}

export async function verTope(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const c = await canalOError(ctx, req.params.canal_codigo);
  if ('status' in c) return c as ResultadoApi;
  const [g, bitacora] = await Promise.all([ctx.datos.gastoHoy(c.codigo), ctx.datos.bitacoraTope(c.codigo)]);
  if (!g.ok) return fallo(404, 'canal_inexistente', 'El número o canal no existe.');
  const nombres = await ctx.datos.nombresActores(bitacora.map((b) => b.actor_usuario_id as string).filter(Boolean));
  return exito({
    item: {
      ...vistaGasto(c, g, ahoraDe(ctx)),
      bitacora: bitacora.map((b) => ({
        campo: b.campo,
        valor_anterior: b.valor_anterior,
        valor_nuevo: b.valor_nuevo,
        actor: b.actor_usuario_id ? { id: b.actor_usuario_id, nombre: nombres.get(b.actor_usuario_id as string) ?? null } : null,
        creado_en: b.creado_en
      }))
    }
  });
}

export async function guardarTope(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const v = validarTope(req.body);
  if (!v.ok) return (v as Extract<typeof v, { ok: false }>).resultado;
  const d = v as Extract<typeof v, { ok: true }>;
  const r = await ctx.datos.actualizarTope(req.params.canal_codigo, d.tope, d.umbral, ctx.actorId);
  if (r.ok === false) {
    const motivo = typeof r.motivo === 'string' ? r.motivo : 'No pudimos guardar el tope.';
    switch (r.error) {
      case 'tope_invalido':
      case 'tope_maximo':
        return fallo(400, String(r.error), motivo, { campo: 'tope_diario_usd' });
      case 'umbral_invalido':
        return fallo(400, 'umbral_invalido', motivo, { campo: 'umbral_alerta_pct' });
      case 'sin_cambios':
        return fallo(400, 'sin_cambios', motivo);
      case 'canal_inexistente':
        return fallo(404, 'canal_inexistente', 'El número o canal no existe.');
      default:
        return fallo(500, 'error_interno', 'No pudimos guardar el tope. Intenta de nuevo.');
    }
  }
  const g = await ctx.datos.gastoHoy(req.params.canal_codigo);
  return exito({ item: vistaGasto({ codigo: req.params.canal_codigo }, g, ahoraDe(ctx)), aplica_en_s: 60 });
}

// ---------------------------------------------------------------------------
// Bloque 4: T4 consumo del día (D8). Misma regla de costo que la BD:
// costo guardado; si es null, tokens × precio vigente; si no hay precio, «sin costo».
// ---------------------------------------------------------------------------
export async function consumo(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const canal = req.query.get('canal_codigo');
  if (!canal) return fallo(400, 'campo_requerido', 'Este dato es obligatorio.', { campo: 'canal_codigo' });
  const ahora = ahoraDe(ctx);
  const hoy = diaBogota(ahora);
  const dia = req.query.get('dia') || hoy;
  const limite = diaBogota(new Date(ahora.getTime() - 90 * 86_400_000));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(Date.parse(`${dia}T00:00:00Z`)) || dia > hoy || dia < limite) {
    return fallo(400, 'dia_invalido', 'Usa una fecha AAAA-MM-DD de los últimos 90 días.', { campo: 'dia' });
  }
  const filas = await ctx.datos.consumo(canal, inicioDiaBogota(dia), inicioDiaBogota(diaSiguiente(dia)));
  const precios = new Map<string, PrecioVigente | null>();
  const precioDe = async (prov: string, modelo: string | null) => {
    const k = `${prov}|${modelo ?? '*'}`;
    if (!precios.has(k)) precios.set(k, await ctx.datos.precioVigente(prov, modelo).catch(() => null));
    return precios.get(k) ?? null;
  };
  const total = { llamadas: 0, gasto_usd: 0, tokens_entrada: 0, tokens_salida: 0, intentos_sin_costo: 0, respaldo_usado: 0, sin_ia: 0, simulaciones: 0 };
  const porModelo = new Map<string, { proveedor_codigo: string; modelo: string | null; llamadas: number; gasto_usd: number; precio_version: string | null; es_estimado: boolean }>();
  for (const f of filas) {
    total.llamadas += 1;
    if (f.modo_simulacion) total.simulaciones += 1;
    if (f.evento === 'despliegue_respaldo_usado') total.respaldo_usado += 1;
    if (f.resultado === 'sin_ia') total.sin_ia += 1;
    total.tokens_entrada += f.tokens_entrada ?? 0;
    total.tokens_salida += f.tokens_salida ?? 0;
    let costo = f.costo_estimado_usd;
    let version = f.precio_version;
    let estimado = false;
    if (costo === null || costo === undefined) {
      const p = await precioDe(f.proveedor_codigo, f.modelo);
      costo = calcularCostoUsd(f.tokens_entrada, f.tokens_salida, p);
      if (p) {
        version = version ?? p.version;
        estimado = p.es_estimado === true;
      }
    }
    if ((costo === null || costo === undefined) && ['exitoso', 'error', 'formato_invalido'].includes(f.resultado)) total.intentos_sin_costo += 1;
    const k = `${f.proveedor_codigo}|${f.modelo ?? ''}`;
    const acc = porModelo.get(k) ?? { proveedor_codigo: f.proveedor_codigo, modelo: f.modelo, llamadas: 0, gasto_usd: 0, precio_version: version, es_estimado: estimado };
    acc.llamadas += 1;
    acc.gasto_usd += costo ?? 0;
    acc.es_estimado = acc.es_estimado || estimado || /estimado/i.test(version || '');
    acc.precio_version = acc.precio_version ?? version;
    porModelo.set(k, acc);
    total.gasto_usd += costo ?? 0;
  }
  const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
  return exito({
    canal_codigo: canal,
    dia_bogota: dia,
    total: { ...total, gasto_usd: r6(total.gasto_usd) },
    por_modelo: [...porModelo.values()].map((m) => ({ ...m, gasto_usd: r6(m.gasto_usd) }))
  });
}

// ---------------------------------------------------------------------------
// Bloque 5: T5 alertas y T6 marcar vista (D5, D6).
// ---------------------------------------------------------------------------
export async function listarAlertas(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const estado = req.query.get('estado') || 'abiertas';
  if (!['abiertas', 'todas'].includes(estado)) {
    return fallo(400, 'estado_invalido', 'Usa estado=abiertas o estado=todas.', { campo: 'estado' });
  }
  const items = await ctx.datos.listarAlertas({ abiertas: estado === 'abiertas', canalCodigo: req.query.get('canal_codigo') || undefined });
  return exito({
    items: items.map((a) => ({
      ...a,
      mensaje: a.tipo === 'sin_costo' ? AVISO_SIN_COSTO : a.tipo === 'corte' ? 'Se alcanzó el tope diario: la IA quedó en pausa hasta las 00:00 de Bogotá.' : 'El gasto llegó al umbral de alerta.'
    }))
  });
}

export async function marcarAlertaVista(ctx: CtxAdmin, req: Peticion): Promise<ResultadoApi> {
  const r = await ctx.datos.marcarAlertaVista(req.params.id, ctx.actorId);
  if (!r.encontrada) return fallo(404, 'no_encontrado', 'No encontramos esa alerta.');
  return exito({ item: { id: req.params.id, vista: true }, sin_cambios: r.ya_vista });
}
