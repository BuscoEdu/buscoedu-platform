import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/src/lib/supabase-server';

export const dynamic = 'force-dynamic';

function fecha(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function FichaPersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerSupabase();

  const { data: persona, error } = await supabase.from('personas').select('*').eq('id', id).single();
  if (error || !persona) notFound();
  const p = persona as any;

  const [{ data: oportunidades }, { data: consentimientos }, { data: notas }] = await Promise.all([
    supabase
      .from('oportunidades')
      .select('id, nombre, estado, temperatura, etapa_id, actualizado_en')
      .eq('persona_id', id)
      .order('actualizado_en', { ascending: false }),
    supabase
      .from('consentimientos_persona')
      .select('id, estado, autoriza_contacto, autoriza_whatsapp, autoriza_transferencia, fecha_otorgamiento')
      .eq('persona_id', id),
    supabase
      .from('notas_crm')
      .select('id, contenido, creado_en')
      .eq('persona_id', id)
      .order('creado_en', { ascending: false })
      .limit(20)
  ]);

  const nombre = [p.nombres, p.apellidos].filter(Boolean).join(' ') || 'Persona';

  return (
    <div className="space-y-5">
      <Link href="/leadcenter/personas" className="text-sm text-blue-600">
        ← Volver a personas
      </Link>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h1 className="text-xl font-bold text-gray-900">{nombre}</h1>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2">
          <span>Correo: {p.correo_principal || '—'}</span>
          <span>Celular: {p.celular_e164 || p.telefono_principal || '—'}</span>
          <span>WhatsApp: {p.whatsapp || '—'}</span>
          <span>Teléfono verificado: {p.telefono_verificado ? 'Sí' : 'No'}</span>
          <span>Método verificación: {p.metodo_verificacion || '—'}</span>
          <span>Estado relación: {p.estado_relacion || '—'}</span>
          <span>Canal origen: {p.canal_origen || '—'}</span>
          <span>Actualizada: {fecha(p.actualizado_en)}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-gray-900">Oportunidades</h2>
        {(oportunidades as any[])?.length ? (
          <ul className="space-y-2">
            {(oportunidades as any[]).map((o) => (
              <li key={o.id}>
                <Link
                  href={`/leadcenter/oportunidades/${o.id}`}
                  className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2 hover:bg-gray-50"
                >
                  <span className="truncate text-sm text-gray-800">{o.nombre || 'Oportunidad'}</span>
                  <span className="shrink-0 text-xs text-gray-500">{o.estado}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Sin oportunidades.</p>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-gray-900">Consentimientos</h2>
        {(consentimientos as any[])?.length ? (
          <ul className="space-y-1 text-sm text-gray-600">
            {(consentimientos as any[]).map((c) => (
              <li key={c.id} className="flex items-center justify-between">
                <span>
                  {c.autoriza_transferencia
                    ? 'Transferencia a universidad'
                    : c.autoriza_whatsapp
                    ? 'Contacto por WhatsApp'
                    : c.autoriza_contacto
                    ? 'Contacto'
                    : 'Tratamiento de datos'}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    c.estado === 'otorgado'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {c.estado}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Sin consentimientos registrados.</p>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-gray-900">Notas recientes</h2>
        {(notas as any[])?.length ? (
          <ul className="space-y-2">
            {(notas as any[]).map((n) => (
              <li key={n.id} className="rounded-xl border border-gray-100 p-3">
                <p className="whitespace-pre-line text-sm text-gray-700">{n.contenido}</p>
                <p className="mt-1 text-xs text-gray-400">{fecha(n.creado_en)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Sin notas.</p>
        )}
      </div>
    </div>
  );
}
