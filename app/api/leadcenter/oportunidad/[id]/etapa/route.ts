import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { procesarCambioEtapa, type ClienteEtapa } from '@/src/lib/leadcenter/cambiar-etapa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/leadcenter/oportunidad/[id]/etapa  Body: { etapaNueva, subestadoNuevo?, motivo? }
 *
 * Hotfix seguridad 2026-10-18.
 * Qué hace: valida la sesión del Lead Center y el rol (401/403), luego el body (400),
 * y solo entonces llama a fn_cambiar_etapa. Errores sin detalle interno.
 * Para qué: cerrar el uso de la RPC sin sesión y no filtrar mensajes de Postgres.
 * Cliente de la RPC: el del usuario (ver src/lib/leadcenter/cambiar-etapa.ts: la
 * función autoriza con auth.uid(), así que con service role siempre diría no_autorizado).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesionLeadCenter();
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }

  // Bloque: adaptador del cliente Supabase al contrato mínimo del flujo.
  const cliente = async (): Promise<ClienteEtapa> => {
    const supabase = await getServerSupabase();
    return {
      leerEtapa: async (etapaId) => await supabase.from('etapas_embudo').select('id, activo').eq('id', etapaId).maybeSingle(),
      leerSubestadosDeEtapa: async (etapaId) =>
        await supabase
          .from('subestados_oportunidad')
          .select('id, etapa_id, activo, orden')
          .eq('etapa_id', etapaId)
          .eq('activo', true)
          .order('orden', { ascending: true }),
      leerSubestado: async (subId) => await supabase.from('subestados_oportunidad').select('id, etapa_id, activo').eq('id', subId).maybeSingle(),
      cambiarEtapa: async (args) => await supabase.rpc('fn_cambiar_etapa', args)
    };
  };

  const r = await procesarCambioEtapa({ sesion, oportunidadId: id, body, cliente });
  return NextResponse.json(r.body, { status: r.status });
}
