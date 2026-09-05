import Link from 'next/link';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

export const dynamic = 'force-dynamic';

type SearchParams = { vista?: string; etapa?: string };

function hoursSince(value?: string | null) {
  if (!value) return 0;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 3_600_000);
}

export default async function PipelineYFunnelPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { vista = 'panorama', etapa: etapaSeleccionada } = await searchParams;
  const sesion = await getSesionLeadCenter();
  const supabase = await getServerSupabase();

  const [{ data: etapas }, { data: oportunidades }, { data: subestados }] = await Promise.all([
    supabase.from('etapas_embudo').select('id, nombre, orden, color, activo').eq('activo', true).order('orden'),
    supabase
      .from('oportunidades')
      .select('id, etapa_id, subestado_id, estado, actualizado_en, fecha_entrada_subestado')
      .eq('estado', 'activa'),
    supabase.from('subestados_oportunidad').select('id, etapa_id, nombre, orden, activo').eq('activo', true).order('orden')
  ]);

  const tabs = [
    { id: 'panorama', label: 'Panorama' },
    { id: 'gestion', label: 'Gestión' },
    { id: 'configuracion', label: 'Configuración' }
  ];
  const etapasActivas = (etapas || []) as any[];
  const oportunidadesActivas = (oportunidades || []) as any[];
  const subestadosActivos = (subestados || []) as any[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-blue-600">Lead Center</p>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline y Funnel</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Supervisa el avance comercial, entra a la gestión con contexto y administra la estructura sin mezclar ambas tareas.
          </p>
        </div>
        <Link href="/leadcenter/oportunidades" className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Ver oportunidades
        </Link>
      </div>

      <nav className="flex w-fit rounded-xl border border-gray-200 bg-white p-1" aria-label="Vistas de Pipeline y Funnel">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/leadcenter/pipeline?vista=${tab.id}${etapaSeleccionada ? `&etapa=${etapaSeleccionada}` : ''}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${vista === tab.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {vista === 'panorama' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-gray-900">Ruta comercial</h2>
              <p className="text-sm text-gray-500">Selecciona una estación para gestionar sus oportunidades conservando el filtro.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {oportunidadesActivas.length} activas
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {etapasActivas.map((etapa, index) => {
              const items = oportunidadesActivas.filter((o) => o.etapa_id === etapa.id);
              const lentas = items.filter((o) => hoursSince(o.fecha_entrada_subestado || o.actualizado_en) >= 24 && hoursSince(o.fecha_entrada_subestado || o.actualizado_en) < 48).length;
              const estancadas = items.filter((o) => hoursSince(o.fecha_entrada_subestado || o.actualizado_en) >= 48).length;
              const subetapas = subestadosActivos.filter((sub) => sub.etapa_id === etapa.id);
              const next = etapasActivas[index + 1];
              return (
                <Link
                  key={etapa.id}
                  href={`/leadcenter/pipeline?vista=gestion&etapa=${etapa.id}`}
                  className="group relative rounded-2xl border border-gray-200 p-4 transition hover:border-blue-300 hover:shadow-sm"
                >
                  {index < etapasActivas.length - 1 && <span aria-hidden="true" className="absolute -right-3 top-8 hidden h-0.5 w-6 bg-gray-200 xl:block" />}
                  <span className="mb-3 block h-3 w-3 rounded-full" style={{ backgroundColor: etapa.color || '#2563eb' }} />
                  <p className="font-semibold text-gray-900">{etapa.nombre}</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{items.length}</p>
                  <p className="text-xs text-gray-500">oportunidades activas</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-medium">
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{lentas} lenta{lentas === 1 ? '' : 's'}</span>
                    <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">{estancadas} estancada{estancadas === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
                    <p className="mb-1 font-medium text-gray-700">Subetapas</p>
                    {subetapas.length ? <div className="flex flex-wrap gap-1">{subetapas.map((sub) => <span key={sub.id} className="rounded-full bg-slate-100 px-2 py-1">{sub.nombre} · {items.filter((o) => o.subestado_id === sub.id).length}</span>)}</div> : <span>Sin subetapas configuradas</span>}
                  </div>
                  <p className="mt-3 text-xs text-blue-600 group-hover:underline">
                    {next ? `Gestionar → ${next.nombre}` : 'Revisar cierres'}
                  </p>
                </Link>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-gray-500">Lenta y Estancada se muestran como señal visual inicial; la regla definitiva se calcula por subetapa configurada.</p>
        </section>
      )}

      {vista === 'gestion' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">Gestión en contexto</h2>
          <p className="mt-1 text-sm text-gray-500">
            {etapaSeleccionada
              ? `Filtro aplicado: ${etapasActivas.find((e) => e.id === etapaSeleccionada)?.nombre || 'etapa seleccionada'}.`
              : 'Elige una estación del panorama para aplicar un filtro de etapa.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/leadcenter/oportunidades${etapaSeleccionada ? `?etapa=${etapaSeleccionada}` : ''}`} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              Abrir oportunidades filtradas
            </Link>
            {etapaSeleccionada && <Link href="/leadcenter/pipeline?vista=gestion" className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">Quitar filtro</Link>}
          </div>
        </section>
      )}

      {vista === 'configuracion' && (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Configuración versionada del funnel</h2>
              <p className="mt-1 text-sm text-gray-500">Etapas, subetapas, transiciones, estancamiento y cierre deben modificarse con permisos administrativos y trazabilidad.</p>
            </div>
            {sesion.esSuper && <Link href="/admin/funnel" className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white">Administrar estados y subetapas</Link>}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {etapasActivas.map((etapa) => {
              const hijos = subestadosActivos.filter((s) => s.etapa_id === etapa.id);
              return <article key={etapa.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3"><p className="font-medium text-gray-900">{etapa.nombre}</p><p className="mt-1 text-sm text-gray-600">{hijos.length ? hijos.map((s) => s.nombre).join(' · ') : 'Sin subestados activos'}</p></article>;
            })}
          </div>
        </section>
      )}
    </div>
  );
}
