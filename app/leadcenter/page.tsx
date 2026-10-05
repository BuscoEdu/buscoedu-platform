import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { consultaSinQa } from '@/src/lib/demowapp/es-qa';

export const dynamic = 'force-dynamic';

/**
 * Las tareas no tienen es_qa. Se restan las de oportunidades de prueba
 * para que el conteo del asesor no incluya leads que no van a la universidad.
 */
async function contarTareasSinQa(esSuper: boolean): Promise<number> {
  try {
    const supabase = await getServerSupabase();
    let q = supabase.from('tareas_crm').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
    if (!esSuper) {
      const { data, error } = await supabase.from('oportunidades').select('id').eq('es_qa', true);
      if (error) return 0;
      const ids = (data || []).map((fila: { id: string }) => fila.id);
      if (ids.length) {
        q = q.or(`oportunidad_id.is.null,oportunidad_id.not.in.(${ids.join(',')})`);
      }
    }
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

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

  // RLS filtra por asesor. Además, quien no es super-admin no cuenta filas es_qa.
  const [activas, calientes, tareasPend, transfPend] = await Promise.all([
    contar('oportunidades', (q) => consultaSinQa(q, sesion.esSuper).eq('estado', 'activa')),
    contar('oportunidades', (q) =>
      consultaSinQa(q, sesion.esSuper).in('temperatura', ['caliente', 'muy_caliente']).eq('estado', 'activa')
    ),
    contarTareasSinQa(sesion.esSuper),
    contar('transferencias_universidad', (q) => consultaSinQa(q, sesion.esSuper).eq('estado', 'pendiente'))
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
