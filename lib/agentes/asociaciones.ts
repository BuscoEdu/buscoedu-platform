/**
 * Utilidades para gestionar las asociaciones entre una versión de agente y
 * sus contextos, herramientas, canales y fuentes.
 *
 * Reglas:
 *   - Solo super_admin (vía protegerYObtenerServicio).
 *   - Las versiones publicadas son INMUTABLES: no se pueden modificar sus
 *     asociaciones. Para cambiarlas se crea una nueva versión (borrador).
 */

import { NextRequest, NextResponse } from 'next/server';
import { protegerYObtenerServicio } from '@/lib/agentes/admin-crud';

export interface ConfigAsociacion {
  /** Tabla de unión (join). */
  tabla: string;
  /** Columnas a devolver, incluyendo los datos del catálogo relacionado. */
  columnasSelect: string;
  /** Campos aceptados al crear la asociación (además de version_agente_id). */
  campos: { nombre: string; obligatorio?: boolean; tipo?: 'texto' | 'entero' | 'booleano' | 'json' }[];
  /** Columna de orden opcional para el listado. */
  ordenarPor?: { columna: string; ascendente?: boolean };
}

async function versionEsBorrador(
  service: ReturnType<typeof import('@/src/lib/supabase-server').getServiceRoleClient>,
  versionId: string
): Promise<{ existe: boolean; borrador: boolean }> {
  const { data } = await service
    .from('versiones_agente_ia')
    .select('id, estado')
    .eq('id', versionId)
    .maybeSingle();
  if (!data) return { existe: false, borrador: false };
  return { existe: true, borrador: data.estado === 'borrador' };
}

function normalizar(valor: unknown, tipo?: string) {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  switch (tipo) {
    case 'entero': {
      const n = Number(valor);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'booleano':
      return Boolean(valor);
    case 'json':
      if (typeof valor === 'string') {
        if (!valor.trim()) return null;
        try {
          return JSON.parse(valor);
        } catch {
          return null;
        }
      }
      return valor;
    default:
      return String(valor);
  }
}

/** Construye handlers GET (listar), POST (asociar) y DELETE (quitar) para una relación de versión. */
export function crearHandlersAsociacion(config: ConfigAsociacion) {
  async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const guard = await protegerYObtenerServicio();
    if ('response' in guard) return guard.response;
    const { id } = await params;

    let query = guard.service.from(config.tabla).select(config.columnasSelect).eq('version_agente_id', id);
    if (config.ordenarPor) {
      query = query.order(config.ordenarPor.columna, { ascending: config.ordenarPor.ascendente ?? true });
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, items: data || [] });
  }

  async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const guard = await protegerYObtenerServicio();
    if ('response' in guard) return guard.response;
    const { id } = await params;

    const estado = await versionEsBorrador(guard.service, id);
    if (!estado.existe) return NextResponse.json({ ok: false, error: 'version_no_encontrada' }, { status: 404 });
    if (!estado.borrador) {
      return NextResponse.json({ ok: false, error: 'version_inmutable_publicada' }, { status: 409 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
    }

    const registro: Record<string, unknown> = { version_agente_id: id };
    for (const campo of config.campos) {
      const bruto = body?.[campo.nombre];
      if (campo.obligatorio && (bruto === undefined || bruto === null || bruto === '')) {
        return NextResponse.json({ ok: false, error: `${campo.nombre}_requerido` }, { status: 400 });
      }
      const valor = normalizar(bruto, campo.tipo);
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

  async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const guard = await protegerYObtenerServicio();
    if ('response' in guard) return guard.response;
    const { id } = await params;

    const estado = await versionEsBorrador(guard.service, id);
    if (!estado.existe) return NextResponse.json({ ok: false, error: 'version_no_encontrada' }, { status: 404 });
    if (!estado.borrador) {
      return NextResponse.json({ ok: false, error: 'version_inmutable_publicada' }, { status: 409 });
    }

    const asociacionId = req.nextUrl.searchParams.get('asociacion_id');
    if (!asociacionId) return NextResponse.json({ ok: false, error: 'asociacion_id_requerido' }, { status: 400 });

    // Borrado físico de la fila de unión (solo en versiones borrador).
    const { error } = await guard.service
      .from(config.tabla)
      .delete()
      .eq('id', asociacionId)
      .eq('version_agente_id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return { GET, POST, DELETE };
}
