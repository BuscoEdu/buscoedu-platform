'use client';

// Resumen IA (/admin/ia) — tablero del Centro de Agentes IA.
// Qué hace: junta en una sola vista el estado de NaIA, contadores (agentes, proveedores, canales,
// ejecuciones, errores) y las últimas ejecuciones.
// Para qué: que el equipo vea de un vistazo si los asistentes virtuales están funcionando y
// entre desde aquí a cada sección. Todo el texto visible pasa por las etiquetas en español.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import TarjetaResumen from '@/components/admin/ia/TarjetaResumen';
import TablaEjecuciones, { EjecucionItem } from '@/components/admin/ia/TablaEjecuciones';
import EstadoBadge from '@/components/admin/ia/EstadoBadge';
import CajaAyuda from '@/components/admin/CajaAyuda';

// Lee un endpoint de /api/admin/ia sin caché y devuelve su JSON (o null si la respuesta no es JSON).
// Para qué: que un fallo de un endpoint no tumbe todo el tablero; cada bloque muestra lo que haya.
async function getJson(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Forma mínima de un agente que usa este tablero (lo que devuelve /api/admin/ia/agentes).
interface AgenteItem {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  activo: boolean;
  version_activa?: { numero_version?: string; estado?: string } | null;
}

// Componente de la página: carga los datos al montar y pinta tarjetas, estado y tabla.
export default function CentroAgentesDashboard() {
  const [agentes, setAgentes] = useState<AgenteItem[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [canales, setCanales] = useState<any[]>([]);
  const [ejecuciones, setEjecuciones] = useState<EjecucionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Carga en paralelo agentes, proveedores, canales y las 10 ejecuciones más recientes.
  // Para qué: una sola espera para todo el tablero en vez de cuatro cargas encadenadas.
  useEffect(() => {
    async function cargar() {
      setLoading(true);
      const [a, p, c, e] = await Promise.all([
        getJson('/api/admin/ia/agentes'),
        getJson('/api/admin/ia/proveedores'),
        getJson('/api/admin/ia/canales'),
        getJson('/api/admin/ia/ejecuciones?limite=10')
      ]);
      setAgentes(a?.items || []);
      setProveedores(p?.items || []);
      setCanales(c?.items || []);
      setEjecuciones(e?.items || []);
      setLoading(false);
    }
    void cargar();
  }, []);

  // Cálculos del tablero: cuál es NaIA, cuántos agentes y canales están activos,
  // ejecuciones de las últimas 24 horas y errores recientes.
  const naia = useMemo(() => agentes.find((x) => x.codigo === 'naia_asesora_educativa'), [agentes]);
  const agentesActivos = agentes.filter((x) => x.activo && x.estado === 'activo').length;
  const canalesActivos = canales.filter((x: any) => x.activo).length;

  const ahora = Date.now();
  const ejec24h = ejecuciones.filter(
    (x) => ahora - new Date(x.ejecutado_en).getTime() < 24 * 3600 * 1000
  ).length;
  const erroresRecientes = ejecuciones.filter((x) => x.estado === 'error').length;

  // Semáforo de NaIA (valor interno, nunca se muestra crudo): exitoso = activa con versión
  // publicada; fallback = existe pero sin versión publicada (responde con respaldo); error = no existe.
  const estadoNaia = !naia
    ? 'error'
    : naia.activo && naia.version_activa?.estado === 'publicada'
    ? 'exitoso'
    : 'fallback';

  // Estructura visible: ayuda, encabezado con accesos, estado de NaIA, tarjetas y tabla.
  return (
    <section className="space-y-6">
      <CajaAyuda titulo="¿Qué es el Centro de Agentes IA?">
        <p>
          Aquí puedes administrar los &quot;cerebros&quot; de NaIA y futuros
          asistentes virtuales de BuscoEdu. Un agente es como un empleado virtual:
          tiene una personalidad, sabe qué puede y qué no puede hacer, y trabaja a
          través de diferentes canales (web, WhatsApp, etc.).
        </p>
      </CajaAyuda>
      {/* Encabezado y accesos rápidos a la lista de agentes y al historial de ejecuciones. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Centro de Agentes IA</h1>
          <p className="text-sm text-buscoedu-muted">
            Gobierno y parametrización de los agentes de inteligencia artificial de BuscoEdu.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/ia/agentes"
            className="rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95"
          >
            Ver agentes
          </Link>
          <Link
            href="/admin/ia/ejecuciones"
            className="rounded-lg border border-buscoedu-border px-4 py-2.5 text-sm font-semibold text-buscoedu-text hover:bg-buscoedu-bg"
          >
            Ejecuciones
          </Link>
        </div>
      </div>

      {/* Estado de NaIA: nombre, versión activa y semáforo con su etiqueta en español. */}
      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-buscoedu-muted">Estado de NaIA</p>
            <p className="mt-1 text-lg font-semibold text-buscoedu-text">
              {naia ? naia.nombre : 'No configurada'}{' '}
              {naia?.version_activa?.numero_version ? `· v${naia.version_activa.numero_version}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                estadoNaia === 'exitoso'
                  ? 'bg-emerald-500'
                  : estadoNaia === 'fallback'
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
            />
            <EstadoBadge estado={estadoNaia === 'exitoso' ? 'activo' : estadoNaia === 'fallback' ? 'pausado' : 'error'} />
          </div>
        </div>
      </div>

      {/* Tarjetas de contadores; las que tienen destino llevan a su sección. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <TarjetaResumen titulo="Agentes activos" valor={loading ? '…' : agentesActivos} href="/admin/ia/agentes" acento="green" />
        <TarjetaResumen
          titulo="Versión NaIA"
          valor={loading ? '…' : naia?.version_activa?.numero_version || '—'}
          acento="blue"
        />
        <TarjetaResumen titulo="Proveedores" valor={loading ? '…' : proveedores.length} href="/admin/ia/multiproveedor" acento="blue" />
        <TarjetaResumen titulo="Canales activos" valor={loading ? '…' : canalesActivos} href="/admin/ia/canales" acento="blue" />
        <TarjetaResumen titulo="Ejecuciones en 24 horas" valor={loading ? '…' : ejec24h} href="/admin/ia/ejecuciones" acento="amber" />
        <TarjetaResumen titulo="Errores recientes" valor={loading ? '…' : erroresRecientes} acento={erroresRecientes > 0 ? 'red' : 'gray'} />
      </div>

      {/* Últimas ejecuciones (agente, canal, estado, duración y fecha). */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-buscoedu-text">Ejecuciones recientes</h2>
          <Link href="/admin/ia/ejecuciones" className="text-sm font-semibold text-buscoedu-blue hover:underline">
            Ver todas
          </Link>
        </div>
        <TablaEjecuciones items={ejecuciones} loading={loading} />
      </div>
    </section>
  );
}
