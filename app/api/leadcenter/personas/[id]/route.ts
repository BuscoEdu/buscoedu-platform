import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || !sesion.esSuper) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const cambios = {
    nombres: String(body.nombres || '').trim() || null,
    apellidos: String(body.apellidos || '').trim() || null,
    correo_principal: String(body.correo_principal || '').trim() || null,
    telefono_principal: String(body.telefono_principal || '').trim() || null,
    whatsapp: String(body.whatsapp || '').trim() || null,
    actualizado_en: new Date().toISOString()
  };
  const { data, error } = await getServiceRoleClient().from('personas').update(cambios).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, persona: data });
}
