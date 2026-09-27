import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { FunnelError, type CuerpoFunnelOk } from './funnel-aplicar';

/**
 * BA-031 · Misma puerta que el resto de /api/demowapp privado:
 * sesión de Lead Center y rol super admin. El estudiante sin sesión
 * web no entra por aquí; el operador del hilo demo sí.
 */
export async function exigirSuperDemowapp(): Promise<NextResponse | null> {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || !sesion.esSuper) {
    const error = new FunnelError('forbidden', 'No tienes permiso para operar este hilo.', null);
    return NextResponse.json(cuerpoError(error), { status: error.http });
  }
  return null;
}

export function cuerpoError(error: FunnelError) {
  return {
    ok: false as const,
    code: error.codigo,
    error: error.message,
    leadCreado: false as const,
    ui: {
      estado: 'error' as const,
      cargando: false as const,
      paso: error.paso,
      leadCreado: false as const,
      acciones: error.acciones
    },
    mensajes: error.mensajes
  };
}

export async function conFunnel(
  handler: (db: SupabaseClient) => Promise<CuerpoFunnelOk>
): Promise<NextResponse> {
  const denied = await exigirSuperDemowapp();
  if (denied) return denied;

  try {
    const db = getServiceRoleClient();
    const cuerpo = await handler(db);
    return NextResponse.json(cuerpo, { status: 200 });
  } catch (error) {
    if (error instanceof FunnelError) {
      return NextResponse.json(cuerpoError(error), { status: error.http });
    }
    const mensaje = error instanceof Error ? error.message : 'Error del servidor';
    const wrapped = new FunnelError('server_error', mensaje, null);
    return NextResponse.json(cuerpoError(wrapped), { status: wrapped.http });
  }
}

export async function leerJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new FunnelError('json_invalido', 'El cuerpo tiene que ser un objeto JSON.', null);
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof FunnelError) throw error;
    throw new FunnelError('json_invalido', 'No pude leer el JSON.', null);
  }
}
