import { redirect } from 'next/navigation';

export default function PipelineYFunnelPage() {
  redirect('/admin/funnel');
}
/*
  const { vista = 'panorama', etapa: etapaSeleccionada } = await searchParams;
  const supabase = await getServerSupabase();

  const [{ data: etapas }, { data: oportunidades }, { data: reglas }] = await Promise.all([
    supabase.from('etapas_embudo').select('id, nombre, orden, color, activo').eq('activo', true).order('orden'),
    supabase
      .from('oportunidades')
      .select('id, etapa_id, subestado_id, estado, actualizado_en, fecha_entrada_subestado')
      .eq('estado', 'activa'),
    supabase.from('reglas_estancamiento').select('id, etapa_id, subestado_id, tiempo_maximo_horas, horas_lenta, horas_estancada, bloque_recurrente_horas, descuento_lenta, descuento_estancada_por_bloque, limite_descuento_total, accion_recomendada, activo').eq('activo', true)
  ]);

  const etapasActivas = (etapas || []) as any[];
  const oportunidadesActivas = (oportunidades || []) as any[];
  const reglasActivas = (reglas || []) as any[];

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

      <>
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
              const salud = items.map((o) => calcularEstadoEstancamiento({ reglas: reglasActivas, etapa_id: o.etapa_id, subestado_id: o.subestado_id, actualizado_en: o.fecha_entrada_subestado || o.actualizado_en }));
              const lentas = salud.filter((x) => x.estado === 'lenta').length;
              const estancadas = salud.filter((x) => x.estado === 'estancada').length;
              return (
                <Link
                  key={etapa.id}
                  href={`/admin/funnel?etapa=${etapa.id}`}
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
                  <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-blue-600 group-hover:underline">Administrar etapa →</p>
                </Link>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-gray-500">Las señales Lenta y Estancada usan la regla activa de cada subetapa; si no existe, usan la regla de su etapa. Configúralas en Estados y subetapas.</p>
        </section>
      </>
    </div>
  );
} */
