/**
 * Utilidades CRUD para las APIs administrativas del Centro de Agentes IA.
 *
 * Todas las operaciones:
 *   - Verifican que el usuario autenticado sea super_admin (requireSuperAdminApi).
 *   - Usan el cliente service_role para escrituras administrativas controladas.
 *   - Devuelven errores claros en español.
 *   - Aplican borrado lógico (activo = false), nunca DELETE físico.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

export interface CampoConfig {
  /** Nombre del campo en la tabla. */
  nombre: string;
  /** Si es obligatorio al crear. */
  obligatorio?: boolean;
  /** Tipo esperado para validación/normalización. */
  tipo?: 'texto' | 'entero' | 'booleano' | 'json';
}

export interface CrudConfig {
  tabla: string;
  columnasSelect: string;
  campos: CampoConfig[];
  ordenarPor?: { columna: string; ascendente?: boolean };
}

/** Verifica super_admin y devuelve el cliente service_role, o una respuesta de error. */
export async function protegerYObtenerServicio(): Promise<
  { service: ReturnType<typeof getServiceRoleClient>; usuarioInternoId: string } | { response: NextResponse }
> {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return { response: auth.response };
  return { service: getServiceRoleClient(), usuarioInternoId: auth.ctx.usuarioInternoId };
}

function normalizarValor(valor: unknown, tipo: CampoConfig['tipo']): { valor?: unknown; error?: string } {
  if (valor === undefined) return {};
  if (valor === null) return { valor: null };

  switch (tipo) {
    case 'entero': {
      if (valor === '') return { valor: null };
      const n = Number(valor);
      if (!Number.isFinite(n)) return { error: 'valor_entero_invalido' };
      return { valor: Math.trunc(n) };
    }
    case 'booleano':
      return { valor: Boolean(valor) };
    case 'json': {
      if (typeof valor === 'string') {
        if (!valor.trim()) return { valor: null };
        try {
          return { valor: JSON.parse(valor) };
        } catch {
          return { error: 'json_invalido' };
        }
      }
      return { valor };
    }
    case 'texto':
    default: {
      const s = String(valor);
      return { valor: s };
    }
  }
}

/** Construye los handlers GET (listar) y POST (crear) para una colección. */
export function crearHandlersColeccion(config: CrudConfig) {
  async function GET() {
    const guard = await protegerYObtenerServicio();
    if ('response' in guard) return guard.response;

    let query = guard.service.from(config.tabla).select(config.columnasSelect);
    if (config.ordenarPor) {
      query = query.order(config.ordenarPor.columna, { ascending: config.ordenarPor.ascendente ?? false });
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, items: data || [] });
  }

  async function POST(req: NextRequest) {
    const guard = await protegerYObtenerServicio();
    if ('response' in guard) return guard.response;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
    }

    const registro: Record<string, unknown> = {};
    for (const campo of config.campos) {
      const bruto = body?.[campo.nombre];
      if (campo.obligatorio && (bruto === undefined || bruto === null || bruto === '')) {
        return NextResponse.json({ ok: false, error: `${campo.nombre}_requerido` }, { status: 400 });
      }
      const { valor, error } = normalizarValor(bruto, campo.tipo);
      if (error) return NextResponse.json({ ok: false, error: `${campo.nombre}_${error}` }, { status: 400 });
      if (valor !== undefined) registro[campo.nombre] = valor;
    }

    const { data, error } = await guard.service
      .from(config.tabla)
      .insert(registro)
      .select(config.columnasSelect)
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  }

  return { GET, POST };
}

/** Construye los handlers GET, PATCH y DELETE (soft) para un elemento por id. */
export function crearHandlersElemento(config: CrudConfig) {
  async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const guard = await protegerYObtenerServicio();
    if ('response' in guard) return guard.response;
    const { id } = await params;

    const { data, error } = await guard.service
      .from(config.tabla)
      .select(config.columnasSelect)
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });
    return NextResponse.json({ ok: true, item: data });
  }

  async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const guard = await protegerYObtenerServicio();
    if ('response' in guard) return guard.response;
    const { id } = await params;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    for (const campo of config.campos) {
      if (body?.[campo.nombre] === undefined) continue;
      const { valor, error } = normalizarValor(body[campo.nombre], campo.tipo);
      if (error) return NextResponse.json({ ok: false, error: `${campo.nombre}_${error}` }, { status: 400 });
      patch[campo.nombre] = valor;
    }
    // Permitir alternar 'activo' explícitamente vía PATCH.
    if (body?.activo !== undefined) patch.activo = Boolean(body.activo);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: 'sin_cambios' }, { status: 400 });
    }

    const { data, error } = await guard.service
      .from(config.tabla)
      .update(patch)
      .eq('id', id)
      .select(config.columnasSelect)
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  }

  async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const guard = await protegerYObtenerServicio();
    if ('response' in guard) return guard.response;
    const { id } = await params;

    // Borrado lógico.
    const { data, error } = await guard.service
      .from(config.tabla)
      .update({ activo: false })
      .eq('id', id)
      .select('id, activo')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  }

  return { GET, PATCH, DELETE };
}
