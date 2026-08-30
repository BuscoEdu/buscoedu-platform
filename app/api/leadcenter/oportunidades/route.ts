import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMITS = new Set([20, 50, 100]);

function parseLimit(raw: string | null): number {
  const n = Number(raw || 20);
  return LIMITS.has(n) ? n : 20;
}

function parseOffset(raw: string | null): number {
  const n = Number(raw || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function nombrePersona(p: any) {
  return [p?.nombres, p?.apellidos].filter(Boolean).join(' ') || 'Sin nombre';
}

function nombreUniversidad(u: any) {
  return u?.nombre_corto || u?.nombre_oficial || u?.sigla || '—';
}

export async function GET(req: NextRequest) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const limit = parseLimit(sp.get('limit'));
  const offset = parseOffset(sp.get('offset'));
  const etapa = sp.get('etapa') || '';
  const estado = sp.get('estado') || '';
  const temp = sp.get('temp') || '';
  const qText = (sp.get('q') || '').trim();

  try {
    const supabase = await getServerSupabase();

    let query = supabase
      .from('oportunidades')
      .select(
        'id, nombre, estado, temperatura, puntaje, fecha_proxima_accion, etapa_id, persona_id, universidad_id, programa_id, oferta_id, actualizado_en',
        { count: 'exact' }
      );

    if (etapa) query = query.eq('etapa_id', etapa);
    if (estado) query = query.eq('estado', estado);
    else query = query.neq('estado', 'archivada');
    if (temp) query = query.eq('temperatura', temp);

    if (qText) {
      query = query.ilike('nombre', `%${qText}%`);
    }

    const { data: baseRows, count, error } = await query
      .order('actualizado_en', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const personaIds = Array.from(new Set((baseRows || []).map((r: any) => r.persona_id).filter(Boolean)));
    const universidadIds = Array.from(new Set((baseRows || []).map((r: any) => r.universidad_id).filter(Boolean)));
    const programaIds = Array.from(new Set((baseRows || []).map((r: any) => r.programa_id).filter(Boolean)));
    const ofertaIds = Array.from(new Set((baseRows || []).map((r: any) => r.oferta_id).filter(Boolean)));
    const etapaIds = Array.from(new Set((baseRows || []).map((r: any) => r.etapa_id).filter(Boolean)));

    const [personasRes, universidadesRes, programasRes, ofertasRes, etapasRes] = await Promise.all([
      personaIds.length
        ? supabase.from('personas').select('id, nombres, apellidos').in('id', personaIds)
        : Promise.resolve({ data: [] as any[] } as any),
      universidadIds.length
        ? supabase
            .from('universidades')
            .select('id, nombre_oficial, nombre_corto, sigla')
            .in('id', universidadIds)
        : Promise.resolve({ data: [] as any[] } as any),
      programaIds.length
        ? supabase.from('programas_academicos').select('id, nombre_oficial, nombre_corto').in('id', programaIds)
        : Promise.resolve({ data: [] as any[] } as any),
      ofertaIds.length
        ? supabase.from('ofertas_academicas').select('id, nombre_oferta').in('id', ofertaIds)
        : Promise.resolve({ data: [] as any[] } as any),
      etapaIds.length
        ? supabase.from('etapas_embudo').select('id, nombre').in('id', etapaIds)
        : Promise.resolve({ data: [] as any[] } as any)
    ]);

    const personas = Object.fromEntries((personasRes.data || []).map((p: any) => [p.id, p]));
    const universidades = Object.fromEntries((universidadesRes.data || []).map((u: any) => [u.id, u]));
    const programas = Object.fromEntries((programasRes.data || []).map((p: any) => [p.id, p]));
    const ofertas = Object.fromEntries((ofertasRes.data || []).map((o: any) => [o.id, o]));
    const etapas = Object.fromEntries((etapasRes.data || []).map((e: any) => [e.id, e.nombre]));

    const items = (baseRows || []).map((row: any) => {
      const persona = personas[row.persona_id] || {};
      const uni = universidades[row.universidad_id] || {};
      const programa = programas[row.programa_id] || {};
      const oferta = ofertas[row.oferta_id] || {};

      return {
        id: row.id,
        estado: row.estado,
        temperatura: row.temperatura,
        puntaje: row.puntaje,
        fecha_proxima_accion: row.fecha_proxima_accion,
        actualizado_en: row.actualizado_en,
        etapa: etapas[row.etapa_id] || '—',
        persona: {
          id: row.persona_id,
          nombre_completo: nombrePersona(persona)
        },
        universidad: {
          id: row.universidad_id,
          nombre: nombreUniversidad(uni)
        },
        programa: {
          id: row.programa_id,
          nombre: programa.nombre_corto || programa.nombre_oficial || '—'
        },
        oferta: {
          id: row.oferta_id,
          nombre: oferta.nombre_oferta || '—'
        }
      };
    });

    const total = count ?? 0;
    const hasMore = offset + items.length < total;

    return NextResponse.json({ ok: true, items, total, hasMore, limit, offset });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'server_error' },
      { status: 500 }
    );
  }
}
