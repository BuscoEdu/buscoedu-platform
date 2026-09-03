'use client';

import { FormEvent, use, useEffect, useState } from 'react';
import Link from 'next/link';
import EstadoBadge from '@/components/admin/ia/EstadoBadge';
import ModalConfirmacion from '@/components/admin/ia/ModalConfirmacion';

async function pedirJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* noop */
  }
  return { ok: res.ok, data };
}

interface Version {
  id: string;
  agente_id: string;
  numero_version: string;
  nombre_version: string | null;
  estado: string;
  objetivo_version: string | null;
  notas_cambio: string | null;
  publicada_en: string | null;
  configuracion_snapshot?: { despliegue_id?: string } | null;
}

const PESTANAS = ['Identidad', 'Contextos', 'Herramientas', 'Canales', 'Fuentes', 'Despliegue', 'Simulación', 'Pruebas', 'Publicación'] as const;
type Pestana = (typeof PESTANAS)[number];

export default function VersionEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [version, setVersion] = useState<Version | null>(null);
  const [pestana, setPestana] = useState<Pestana>('Identidad');
  const [loading, setLoading] = useState(true);

  async function cargarVersion() {
    const { data } = await pedirJson(`/api/admin/ia/versiones/${id}`);
    setVersion(data?.item || null);
    setLoading(false);
  }

  useEffect(() => {
    void cargarVersion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <p className="text-sm text-buscoedu-muted">Cargando versión...</p>;
  if (!version) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">No se encontró la versión.</p>
        <Link href="/admin/ia/agentes" className="text-sm font-semibold text-buscoedu-blue hover:underline">
          ← Volver
        </Link>
      </div>
    );
  }

  const esBorrador = version.estado === 'borrador';

  return (
    <section className="space-y-5">
      <div>
        <Link href={`/admin/ia/agentes/${version.agente_id}`} className="text-sm font-semibold text-buscoedu-blue hover:underline">
          ← Agente
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-buscoedu-blue">Versión v{version.numero_version}</h1>
          <EstadoBadge estado={version.estado} />
        </div>
        {!esBorrador ? (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Esta versión está {version.estado} y es <strong>inmutable</strong>. Para hacer cambios, crea una nueva versión
            borrador.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-buscoedu-border">
        {PESTANAS.map((p) => (
          <button
            key={p}
            onClick={() => setPestana(p)}
            className={`px-4 py-2 text-sm font-semibold ${
              pestana === p ? 'border-b-2 border-buscoedu-blue text-buscoedu-blue' : 'text-buscoedu-muted hover:text-buscoedu-text'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {pestana === 'Identidad' ? <TabIdentidad version={version} esBorrador={esBorrador} onGuardado={cargarVersion} /> : null}
      {pestana === 'Contextos' ? (
        <TabAsociacion
          versionId={id}
          esBorrador={esBorrador}
          endpoint={`/api/admin/ia/versiones/${id}/contextos`}
          catalogoEndpoint="/api/admin/ia/contextos"
          fkCampo="componente_contexto_id"
          relacion="componentes_contexto_ia"
          etiquetaVacio="No hay contextos asociados."
          textoAgregar="Agregar contexto"
          camposExtra={[{ clave: 'orden', etiqueta: 'Orden', tipo: 'number', valor: 0 }, { clave: 'rol_contexto', etiqueta: 'Rol', tipo: 'text', valor: 'sistema' }]}
        />
      ) : null}
      {pestana === 'Herramientas' ? (
        <TabAsociacion
          versionId={id}
          esBorrador={esBorrador}
          endpoint={`/api/admin/ia/versiones/${id}/herramientas`}
          catalogoEndpoint="/api/admin/ia/herramientas"
          fkCampo="herramienta_id"
          relacion="herramientas_ia"
          etiquetaVacio="No hay herramientas asociadas."
          textoAgregar="Agregar herramienta"
          camposExtra={[]}
        />
      ) : null}
      {pestana === 'Canales' ? (
        <TabAsociacion
          versionId={id}
          esBorrador={esBorrador}
          endpoint={`/api/admin/ia/versiones/${id}/canales`}
          catalogoEndpoint="/api/admin/ia/canales"
          fkCampo="canal_id"
          relacion="canales_ia"
          etiquetaVacio="No hay canales configurados."
          textoAgregar="Agregar canal"
          camposExtra={[{ clave: 'nombre_publico', etiqueta: 'Nombre público', tipo: 'text', valor: '' }, { clave: 'tono', etiqueta: 'Tono', tipo: 'text', valor: '' }]}
        />
      ) : null}
      {pestana === 'Fuentes' ? (
        <TabAsociacion
          versionId={id}
          esBorrador={esBorrador}
          endpoint={`/api/admin/ia/versiones/${id}/fuentes`}
          catalogoEndpoint="/api/admin/ia/fuentes"
          fkCampo="fuente_contexto_id"
          relacion="fuentes_contexto_ia"
          etiquetaVacio="No hay fuentes asociadas."
          textoAgregar="Agregar fuente"
          camposExtra={[{ clave: 'prioridad', etiqueta: 'Prioridad', tipo: 'number', valor: 100 }]}
        />
      ) : null}
      {pestana === 'Despliegue' ? <TabDespliegue version={version} esBorrador={esBorrador} onGuardado={cargarVersion} /> : null}
      {pestana === 'Simulación' ? <TabSimulacion version={version} /> : null}
      {pestana === 'Pruebas' ? <TabPruebas versionId={id} /> : null}
      {pestana === 'Publicación' ? <TabPublicacion version={version} esBorrador={esBorrador} onPublicado={cargarVersion} /> : null}
    </section>
  );
}

function TabDespliegue({ version, esBorrador, onGuardado }: { version: Version; esBorrador: boolean; onGuardado: () => void }) {
  const [despliegues, setDespliegues] = useState<any[]>([]);
  const [seleccion, setSeleccion] = useState(version.configuracion_snapshot?.despliegue_id || '');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  useEffect(() => { void pedirJson('/api/admin/ia/despliegues').then(({ data }) => setDespliegues((data?.items || []).filter((x: any) => x.activo !== false && x.estado === 'activo'))); }, []);
  async function guardar() {
    if (!seleccion) return;
    setGuardando(true);
    const { ok, data } = await pedirJson(`/api/admin/ia/versiones/${version.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ configuracion_snapshot: { ...(version.configuracion_snapshot || {}), despliegue_id: seleccion } }) });
    setGuardando(false); setMensaje(ok && data?.ok ? 'Despliegue guardado para esta versión.' : data?.error || 'No se pudo guardar el despliegue.'); if (ok && data?.ok) onGuardado();
  }
  return <div className="max-w-2xl space-y-4 rounded-xl border border-buscoedu-border bg-white p-5 shadow-card"><p className="text-sm leading-relaxed text-buscoedu-muted">Selecciona el proveedor/modelo que ejecutará esta versión. Producción no usará un despliegue por defecto.</p>{mensaje ? <p className="rounded-md bg-buscoedu-bg px-3 py-2 text-sm">{mensaje}</p> : null}<select disabled={!esBorrador} value={seleccion} onChange={(e) => setSeleccion(e.target.value)} className="w-full rounded-lg border border-buscoedu-border px-3 py-2 disabled:bg-buscoedu-bg"><option value="">Seleccionar despliegue activo...</option>{despliegues.map((d) => <option key={d.id} value={d.id}>{d.nombre} — {d.modelo || d.proveedores_ia?.nombre || 'modelo sin nombre'}</option>)}</select>{esBorrador ? <button onClick={guardar} disabled={guardando || !seleccion} className="rounded-md bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{guardando ? 'Guardando...' : 'Guardar despliegue'}</button> : null}</div>;
}

function TabSimulacion({ version }: { version: Version }) {
  const [mensaje, setMensaje] = useState(''); const [canal, setCanal] = useState('web'); const [versiones, setVersiones] = useState<any[]>([]); const [compararCon, setCompararCon] = useState(''); const [resultado, setResultado] = useState<any>(null); const [ejecutando, setEjecutando] = useState(false); const [error, setError] = useState('');
  useEffect(() => { void pedirJson(`/api/admin/ia/versiones?agente_id=${version.agente_id}`).then(({ data }) => setVersiones((data?.items || []).filter((v: any) => v.id !== version.id))); }, [version.agente_id, version.id]);
  async function simular(e: FormEvent) { e.preventDefault(); setEjecutando(true); setError(''); setResultado(null); const { ok, data } = await pedirJson(`/api/admin/ia/versiones/${version.id}/simular`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensaje, codigo_canal: canal, comparar_con_version_id: compararCon || undefined }) }); setEjecutando(false); if (!ok || !data?.ok) { setError(data?.error || 'No fue posible ejecutar la simulación.'); return; } setResultado(data); }
  const Respuesta = ({ titulo, item }: { titulo: string; item: any }) => <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card"><h4 className="font-semibold text-buscoedu-blue">{titulo}</h4><p className="mt-2 whitespace-pre-wrap text-sm text-buscoedu-text">{item?.mensaje || 'Sin respuesta'}</p><p className="mt-3 text-xs text-buscoedu-muted">Filtros: {Object.keys(item?.filtros || {}).length ? JSON.stringify(item.filtros) : 'ninguno'}</p></div>;
  return <div className="space-y-4"><form onSubmit={simular} className="space-y-3 rounded-xl border border-buscoedu-border bg-white p-5 shadow-card"><p className="text-sm text-buscoedu-muted">Prueba esta versión, incluso si es borrador, sin modificar producción.</p>{error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}<textarea required rows={3} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Escribe el mensaje que probarás..." className="w-full rounded-lg border border-buscoedu-border px-3 py-2"/><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Canal<select value={canal} onChange={(e) => setCanal(e.target.value)} className="mt-1 w-full rounded-lg border border-buscoedu-border px-3 py-2"><option value="web">Web</option><option value="whatsapp">WhatsApp</option></select></label><label className="text-sm">Comparar con<select value={compararCon} onChange={(e) => setCompararCon(e.target.value)} className="mt-1 w-full rounded-lg border border-buscoedu-border px-3 py-2"><option value="">No comparar</option>{versiones.map((v) => <option key={v.id} value={v.id}>v{v.numero_version} — {v.nombre_version || v.estado}</option>)}</select></label></div><button disabled={ejecutando} className="rounded-md bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{ejecutando ? 'Simulando...' : 'Simular versión'}</button></form>{resultado ? <div className="grid gap-4 md:grid-cols-2"><Respuesta titulo={`Versión v${version.numero_version}`} item={resultado.principal}/>{resultado.comparacion ? <Respuesta titulo="Versión comparada" item={resultado.comparacion}/> : null}</div> : null}</div>;
}

/* ============ Identidad ============ */
function TabIdentidad({ version, esBorrador, onGuardado }: { version: Version; esBorrador: boolean; onGuardado: () => void }) {
  const [form, setForm] = useState({
    nombre_version: version.nombre_version || '',
    objetivo_version: version.objetivo_version || '',
    notas_cambio: version.notas_cambio || ''
  });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje('');
    const { ok, data } = await pedirJson(`/api/admin/ia/versiones/${version.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setGuardando(false);
    setMensaje(ok && data?.ok ? 'Cambios guardados.' : data?.error || 'No se pudo guardar.');
    if (ok && data?.ok) onGuardado();
  }

  return (
    <form onSubmit={guardar} className="max-w-2xl space-y-3 rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
      {mensaje ? <p className="rounded-md bg-buscoedu-bg px-3 py-2 text-sm text-buscoedu-text">{mensaje}</p> : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-buscoedu-text">Nombre de la versión</span>
        <input disabled={!esBorrador} value={form.nombre_version} onChange={(e) => setForm((p) => ({ ...p, nombre_version: e.target.value }))} className="w-full rounded-lg border border-buscoedu-border px-3 py-2 disabled:bg-buscoedu-bg" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-buscoedu-text">Objetivo de la versión</span>
        <textarea disabled={!esBorrador} value={form.objetivo_version} onChange={(e) => setForm((p) => ({ ...p, objetivo_version: e.target.value }))} rows={3} className="w-full rounded-lg border border-buscoedu-border px-3 py-2 disabled:bg-buscoedu-bg" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-buscoedu-text">Notas de cambio</span>
        <textarea disabled={!esBorrador} value={form.notas_cambio} onChange={(e) => setForm((p) => ({ ...p, notas_cambio: e.target.value }))} rows={3} className="w-full rounded-lg border border-buscoedu-border px-3 py-2 disabled:bg-buscoedu-bg" />
      </label>
      {esBorrador ? (
        <div className="flex justify-end">
          <button type="submit" disabled={guardando} className="rounded-md bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      ) : null}
    </form>
  );
}

/* ============ Asociación genérica ============ */
interface CampoExtra {
  clave: string;
  etiqueta: string;
  tipo: 'text' | 'number';
  valor: any;
}

function TabAsociacion({
  versionId,
  esBorrador,
  endpoint,
  catalogoEndpoint,
  fkCampo,
  relacion,
  etiquetaVacio,
  textoAgregar,
  camposExtra
}: {
  versionId: string;
  esBorrador: boolean;
  endpoint: string;
  catalogoEndpoint: string;
  fkCampo: string;
  relacion: string;
  etiquetaVacio: string;
  textoAgregar: string;
  camposExtra: CampoExtra[];
}) {
  const [asociados, setAsociados] = useState<any[]>([]);
  const [catalogo, setCatalogo] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seleccion, setSeleccion] = useState('');
  const [extra, setExtra] = useState<Record<string, any>>(() => Object.fromEntries(camposExtra.map((c) => [c.clave, c.valor])));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function cargar() {
    setLoading(true);
    const [a, c] = await Promise.all([pedirJson(endpoint), pedirJson(catalogoEndpoint)]);
    setAsociados(a.data?.items || []);
    setCatalogo((c.data?.items || []).filter((x: any) => x.activo !== false));
    setLoading(false);
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (!seleccion) return;
    setGuardando(true);
    setError('');
    const { ok, data } = await pedirJson(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [fkCampo]: seleccion, ...extra })
    });
    setGuardando(false);
    if (!ok || !data?.ok) {
      setError(data?.error || 'No se pudo agregar.');
      return;
    }
    setSeleccion('');
    setExtra(Object.fromEntries(camposExtra.map((c) => [c.clave, c.valor])));
    await cargar();
  }

  async function quitar(asociacionId: string) {
    await pedirJson(`${endpoint}?asociacion_id=${asociacionId}`, { method: 'DELETE' });
    await cargar();
  }

  return (
    <div className="space-y-4">
      {esBorrador ? (
        <form onSubmit={agregar} className="flex flex-wrap items-end gap-2 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
          {error ? <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Elemento</span>
            <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)} className="min-w-[220px] rounded-lg border border-buscoedu-border px-3 py-2">
              <option value="">Seleccionar...</option>
              {catalogo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.codigo})
                </option>
              ))}
            </select>
          </label>
          {camposExtra.map((c) => (
            <label key={c.clave} className="block text-sm">
              <span className="mb-1 block font-medium text-buscoedu-text">{c.etiqueta}</span>
              <input
                type={c.tipo}
                value={extra[c.clave]}
                onChange={(e) => setExtra((p) => ({ ...p, [c.clave]: c.tipo === 'number' ? Number(e.target.value) : e.target.value }))}
                className="w-32 rounded-lg border border-buscoedu-border px-3 py-2"
              />
            </label>
          ))}
          <button type="submit" disabled={guardando} className="rounded-md bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {guardando ? 'Agregando...' : textoAgregar}
          </button>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
        <table className="min-w-full text-sm">
          <thead className="bg-buscoedu-bg text-left text-xs uppercase tracking-wide text-buscoedu-muted">
            <tr>
              <th className="px-3 py-3">Nombre</th>
              <th className="px-3 py-3">Código</th>
              {camposExtra.map((c) => (
                <th key={c.clave} className="px-3 py-3">
                  {c.etiqueta}
                </th>
              ))}
              {esBorrador ? <th className="px-3 py-3">Acciones</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-buscoedu-border text-buscoedu-text">
            {loading ? (
              <tr>
                <td colSpan={2 + camposExtra.length + (esBorrador ? 1 : 0)} className="px-3 py-6 text-center text-buscoedu-muted">
                  Cargando...
                </td>
              </tr>
            ) : asociados.length === 0 ? (
              <tr>
                <td colSpan={2 + camposExtra.length + (esBorrador ? 1 : 0)} className="px-3 py-6 text-center text-buscoedu-muted">
                  {etiquetaVacio}
                </td>
              </tr>
            ) : (
              asociados.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-3 font-medium">{a[relacion]?.nombre || '—'}</td>
                  <td className="px-3 py-3 text-xs text-buscoedu-muted">{a[relacion]?.codigo || '—'}</td>
                  {camposExtra.map((c) => (
                    <td key={c.clave} className="px-3 py-3">
                      {a[c.clave] ?? '—'}
                    </td>
                  ))}
                  {esBorrador ? (
                    <td className="px-3 py-3">
                      <button onClick={() => quitar(a.id)} className="rounded-md border border-buscoedu-border px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                        Quitar
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ Pruebas ============ */
function TabPruebas({ versionId }: { versionId: string }) {
  const [pruebas, setPruebas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ nombre_prueba: '', mensaje_entrada: '', respuesta_esperada: '' });
  const [creando, setCreando] = useState(false);
  const [ejecutandoId, setEjecutandoId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function cargar() {
    setLoading(true);
    const { data } = await pedirJson(`/api/admin/ia/pruebas?version_agente_id=${versionId}`);
    setPruebas(data?.items || []);
    setLoading(false);
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setCreando(true);
    setError('');
    const { ok, data } = await pedirJson('/api/admin/ia/pruebas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, version_agente_id: versionId })
    });
    setCreando(false);
    if (!ok || !data?.ok) {
      setError(data?.error || 'No se pudo crear la prueba.');
      return;
    }
    setForm({ nombre_prueba: '', mensaje_entrada: '', respuesta_esperada: '' });
    await cargar();
  }

  async function ejecutar(pruebaId: string) {
    setEjecutandoId(pruebaId);
    await pedirJson(`/api/admin/ia/pruebas/${pruebaId}/ejecutar`, { method: 'POST' });
    setEjecutandoId(null);
    await cargar();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={crear} className="space-y-3 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Nombre de la prueba</span>
            <input value={form.nombre_prueba} onChange={(e) => setForm((p) => ({ ...p, nombre_prueba: e.target.value }))} required className="w-full rounded-lg border border-buscoedu-border px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Respuesta esperada (opcional)</span>
            <input value={form.respuesta_esperada} onChange={(e) => setForm((p) => ({ ...p, respuesta_esperada: e.target.value }))} className="w-full rounded-lg border border-buscoedu-border px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-buscoedu-text">Mensaje de entrada</span>
          <textarea value={form.mensaje_entrada} onChange={(e) => setForm((p) => ({ ...p, mensaje_entrada: e.target.value }))} rows={2} required className="w-full rounded-lg border border-buscoedu-border px-3 py-2" />
        </label>
        <div className="flex justify-end">
          <button type="submit" disabled={creando} className="rounded-md bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {creando ? 'Creando...' : 'Crear prueba'}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-buscoedu-muted">Cargando pruebas...</p>
        ) : pruebas.length === 0 ? (
          <p className="text-sm text-buscoedu-muted">No hay pruebas para esta versión.</p>
        ) : (
          pruebas.map((p) => (
            <div key={p.id} className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-buscoedu-text">{p.nombre_prueba}</h4>
                <div className="flex items-center gap-2">
                  <EstadoBadge estado={p.resultado} />
                  <button
                    onClick={() => ejecutar(p.id)}
                    disabled={ejecutandoId === p.id}
                    className="rounded-md bg-buscoedu-blue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {ejecutandoId === p.id ? 'Ejecutando...' : 'Ejecutar'}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-buscoedu-text"><span className="font-medium">Entrada:</span> {p.mensaje_entrada}</p>
              {p.respuesta_esperada ? <p className="mt-1 text-sm text-buscoedu-muted"><span className="font-medium">Esperada:</span> {p.respuesta_esperada}</p> : null}
              {p.respuesta_obtenida ? <p className="mt-1 text-sm text-buscoedu-text"><span className="font-medium">Obtenida:</span> {p.respuesta_obtenida}</p> : null}
              {p.observaciones ? <p className="mt-1 text-xs text-red-600">{p.observaciones}</p> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============ Publicación ============ */
function TabPublicacion({ version, esBorrador, onPublicado }: { version: Version; esBorrador: boolean; onPublicado: () => void }) {
  const [modal, setModal] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function publicar() {
    setPublicando(true);
    setMensaje('');
    const { ok, data } = await pedirJson(`/api/admin/ia/versiones/${version.id}/publicar`, { method: 'POST' });
    setPublicando(false);
    setModal(false);
    setMensaje(ok && data?.ok ? 'Versión publicada correctamente. Ahora es la versión activa del agente.' : data?.error || 'No se pudo publicar.');
    if (ok && data?.ok) onPublicado();
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
      {mensaje ? <p className="rounded-md bg-buscoedu-bg px-3 py-2 text-sm text-buscoedu-text">{mensaje}</p> : null}
      <div>
        <p className="text-sm text-buscoedu-text">
          Estado actual: <EstadoBadge estado={version.estado} />
        </p>
        {version.publicada_en ? (
          <p className="mt-2 text-sm text-buscoedu-muted">Publicada el {new Date(version.publicada_en).toLocaleString('es-CO')}.</p>
        ) : null}
      </div>
      {esBorrador ? (
        <>
          <p className="text-sm text-buscoedu-muted">
            Al publicar esta versión se convertirá en la <strong>versión activa</strong> del agente, la versión activa
            anterior se desactivará y esta versión quedará <strong>inmutable</strong>.
          </p>
          <button onClick={() => setModal(true)} className="rounded-md bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white hover:brightness-95">
            Publicar versión
          </button>
        </>
      ) : (
        <p className="text-sm text-buscoedu-muted">Esta versión no está en borrador, por lo que no se puede volver a publicar.</p>
      )}

      <ModalConfirmacion
        abierto={modal}
        titulo="Publicar versión"
        mensaje={`¿Confirmas publicar la versión v${version.numero_version}? Se convertirá en la versión activa y no podrá modificarse.`}
        textoConfirmar="Publicar"
        cargando={publicando}
        onConfirmar={publicar}
        onCancelar={() => setModal(false)}
      />
    </div>
  );
}
