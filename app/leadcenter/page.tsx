import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

export const dynamic = 'force-dynamic';

async function contar(tabla: string, filtros: (q: any) => any): Promise<number> {
  try {
    const supabase = await getServerSupabase();
    let q = supabase.from(tabla).select('id', { count: 'exact', head: true });
    q = filtros(q);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function DashboardPage() {
  const sesion = await getSesionLeadCenter();

  // RLS filtra automáticamente por el asesor; super_admin ve todo.
  const [activas, calientes, tareasPend, transfPend] = await Promise.all([
    contar('oportunidades', (q) => q.eq('estado', 'activa')),
    contar('oportunidades', (q) => q.in('temperatura', ['caliente', 'muy_caliente']).eq('estado', 'activa')),
    contar('tareas_crm', (q) => q.eq('estado', 'pendiente')),
    contar('transferencias_universidad', (q) => q.eq('estado', 'pendiente'))
  ]);

  const kpis = [
    { label: 'Oportunidades activas', valor: activas, color: 'bg-blue-50 text-blue-700' },
    { label: 'Calientes / muy calientes', valor: calientes, color: 'bg-red-50 text-red-700' },
    { label: 'Tareas pendientes', valor: tareasPend, color: 'bg-amber-50 text-amber-700' },
    { label: 'Transferencias pendientes', valor: transfPend, color: 'bg-teal-50 text-teal-700' }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hola, {sesion.nombre}</h1>
        <p className="text-sm text-gray-500">
          {sesion.esSuper
            ? 'Vista global del pipeline comercial.'
            : 'Estas son tus oportunidades asignadas.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div
              className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${k.color}`}
            >
              {k.valor}
            </div>
            <p className="text-sm text-gray-600">{k.label}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
