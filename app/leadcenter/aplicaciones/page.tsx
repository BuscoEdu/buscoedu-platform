import Link from 'next/link';
import { getServerSupabase } from '@/src/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface SearchParams {
  estado?: string;
  q?: string;
}

function nombrePersona(p: any) {
  return [p?.nombres, p?.apellidos].filter(Boolean).join(' ') || 'Sin nombre';
}

function fecha(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function AplicacionesPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  let items: any[] = [];
  let total = 0;
  let errorMsg = '';

  try {
    const supabase = await getServerSupabase();

    let q = supabase
      .from('aplicaciones')
      .select('id, oportunidad_id, persona_id, oferta_id, estado, fecha_aplicacion, creado_en', {
        count: 'exact'
      })
      .order('creado_en', { ascending: false })
      .limit(200);

    if (sp.estado && sp.estado !== 'todas') q = q.eq('estado', sp.estado);

    const { data: aplicaciones, count, error } = await q;
    if (error) {
      errorMsg = error.message;
    } else {
      total = count ?? 0;
      const personaIds = Array.from(new Set((aplicaciones || []).map((a: any) => a.persona_id).filter(Boolean)));
      const oportunidadIds = Array.from(new Set((aplicaciones || []).map((a: any) => a.oportunidad_id).filter(Boolean)));
      const ofertaIds = Array.from(new Set((aplicaciones || []).map((a: any) => a.oferta_id).filter(Boolean)));

      const [personasRes, oportunidadesRes, ofertasRes, universidadesRes] = await Promise.all([
        personaIds.length
          ? supabase
              .from('personas')
              .select('id, nombres, apellidos, correo_principal, celular_e164, telefono_principal')
              .in('id', personaIds)
          : Promise.resolve({ data: [] as any[] } as any),
        oportunidadIds.length
          ? supabase.from('oportunidades').select('id, universidad_id, estado, temperatura, puntaje').in('id', oportunidadIds)
          : Promise.resolve({ data: [] as any[] } as any),
        ofertaIds.length
          ? supabase.from('ofertas_academicas').select('id, nombre_oferta').in('id', ofertaIds)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase.from('universidades').select('id, nombre_oficial, nombre_corto, sigla')
      ]);

      const personas = Object.fromEntries((personasRes.data || []).map((p: any) => [p.id, p]));
      const oportunidades = Object.fromEntries((oportunidadesRes.data || []).map((o: any) => [o.id, o]));
      const ofertas = Object.fromEntries((ofertasRes.data || []).map((o: any) => [o.id, o]));
      const universidades = Object.fromEntries((universidadesRes.data || []).map((u: any) => [u.id, u]));

      items = (aplicaciones || []).map((a: any) => {
        const persona = personas[a.persona_id] || {};
        const oportunidad = oportunidades[a.oportunidad_id] || {};
        const oferta = ofertas[a.oferta_id] || {};
        const univ = universidades[oportunidad.universidad_id] || {};
        const universidadNombre = univ.nombre_corto || univ.nombre_oficial || univ.sigla || '—';

        return {
          ...a,
          personaNombre: nombrePersona(persona),
          personaCorreo: persona.correo_principal || '—',
          personaCelular: persona.celular_e164 || persona.telefono_principal || '—',
          universidadNombre,
          ofertaNombre: oferta.nombre_oferta || 'Oferta',
          oportunidadEstado: oportunidad.estado || '—',
          oportunidadTemp: oportunidad.temperatura || '—',
          puntaje: oportunidad.puntaje ?? 0
        };
      });

      if (sp.q?.trim()) {
        const term = sp.q.trim().toLowerCase();
        items = items.filter((it) =>
          [it.personaNombre, it.personaCorreo, it.personaCelular, it.universidadNombre, it.ofertaNombre]
            .join(' ')
            .toLowerCase()
            .includes(term)
        );
      }
    }
  } catch (e: any) {
    errorMsg = e?.message || 'No se pudo cargar el panel de aplicaciones.';
  }

  const pendientes = items.filter((i) => i.estado === 'pendiente').length;
  const enRevision = items.filter((i) => i.estado === 'en_revision').length;
  const aprobadas = items.filter((i) => i.estado === 'aprobada').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Aplicaciones</h1>
        <span className="text-sm text-gray-500">{total} registradas</span>
      </div>

      <form className="flex flex-wrap gap-2" action="/leadcenter/aplicaciones" method="get">
        <input
          name="q"
          defaultValue={sp.q || ''}
          placeholder="Buscar por persona, universidad u oferta…"
          className="min-w-[180px] flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          name="estado"
          defaultValue={sp.estado || 'todas'}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="todas">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_revision">En revisión</option>
          <option value="aprobada">Aprobada</option>
          <option value="rechazada">Rechazada</option>
          <option value="retirada">Retirada</option>
        </select>
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Filtrar
        </button>
      </form>

      {errorMsg && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
        <section className="space-y-2">
          {items.length === 0 && !errorMsg && (
            <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
              No hay aplicaciones para este filtro.
            </p>
          )}
          {items.map((it) => (
            <Link
              key={it.id}
              href={it.oportunidad_id ? `/leadcenter/oportunidades/${it.oportunidad_id}` : '#'}
              className="block rounded-2xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{it.personaNombre}</p>
                  <p className="truncate text-xs text-gray-500">{it.universidadNombre} · {it.ofertaNombre}</p>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {it.personaCorreo} · {it.personaCelular}
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700">
                  {it.estado}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                <span>Oportunidad: {it.oportunidadEstado}</span>
                <span>Temperatura: {String(it.oportunidadTemp).replace('_', ' ')}</span>
                <span>Puntaje: {it.puntaje}</span>
                <span>Fecha: {fecha(it.fecha_aplicacion || it.creado_en)}</span>
              </div>
            </Link>
          ))}
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Resumen operativo</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
                <p className="text-xs">Pendientes</p>
                <p className="text-lg font-semibold">{pendientes}</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <p className="text-xs">En revisión</p>
                <p className="text-lg font-semibold">{enRevision}</p>
              </div>
              <div className="rounded-xl bg-green-50 p-3 text-green-700">
                <p className="text-xs">Aprobadas</p>
                <p className="text-lg font-semibold">{aprobadas}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            <h3 className="mb-2 font-semibold text-gray-900">Accesos rápidos</h3>
            <div className="space-y-2">
              <Link href="/leadcenter/oportunidades" className="block rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50">
                Ver pipeline de oportunidades
              </Link>
              <Link href="/leadcenter/tareas" className="block rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50">
                Ver tareas de seguimiento
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

