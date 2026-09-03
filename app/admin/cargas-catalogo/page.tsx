'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import CajaAyuda from '@/components/admin/CajaAyuda';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';
import type { AccionCarga, FilaPrevisualizada, TipoCargaCatalogo } from '@/src/lib/catalog-import';

const CONFIGURACION: Record<TipoCargaCatalogo, { titulo: string; descripcion: string; campos: string }> = {
  programas: {
    titulo: 'Programas académicos',
    descripcion: 'Registra el catálogo académico base. No crea convocatorias, precios ni beneficios.',
    campos: 'Universidad, SNIES o código de origen, nombre, nivel, modalidad y características académicas.'
  },
  ofertas: {
    titulo: 'Ofertas académicas',
    descripcion: 'Activa programas ya cargados para un período, con cupos, precio y beneficio.',
    campos: 'Universidad, programa de referencia, período, vigencia, cupos, precio y beneficio.'
  }
};

export default function CargasCatalogoPage() {
  const [tipo, setTipo] = useState<TipoCargaCatalogo>('programas');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [csv, setCsv] = useState('');
  const [filas, setFilas] = useState<FilaPrevisualizada[]>([]);
  const [decisiones, setDecisiones] = useState<Record<number, AccionCarga>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const resumen = useMemo(() => filas.reduce((acumulado, fila) => {
    const accion = decisiones[fila.numeroLinea] || fila.accion;
    acumulado[accion] = (acumulado[accion] || 0) + 1;
    return acumulado;
  }, {} as Record<string, number>), [filas, decisiones]);

  async function descargarPlantilla() {
    setError('');
    const respuesta = await fetch(`/api/admin/cargas-catalogo?tipo=${tipo}`);
    if (!respuesta.ok) { setError('No fue posible descargar la plantilla. Verifica tu sesión de super admin.'); return; }
    const blob = await respuesta.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `plantilla_${tipo}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  async function seleccionarArchivo(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    setFilas([]); setDecisiones({}); setExito(''); setError('');
    if (!archivo) return;
    if (!archivo.name.toLowerCase().endsWith('.csv')) { setError('Carga un archivo CSV generado a partir de la plantilla.'); return; }
    setNombreArchivo(archivo.name);
    setCsv(await archivo.text());
  }

  async function previsualizar() {
    if (!csv) { setError('Descarga la plantilla, diligénciala y selecciona el archivo antes de continuar.'); return; }
    setCargando(true); setError(''); setExito('');
    try {
      const respuesta = await fetch('/api/admin/cargas-catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, csv }) });
      const data = await respuesta.json();
      if (!respuesta.ok) throw new Error(data.error || 'No fue posible validar el archivo.');
      setFilas(data.filas || []);
      setDecisiones({});
    } catch (err) { setError(err instanceof Error ? err.message : 'No fue posible validar el archivo.'); }
    finally { setCargando(false); }
  }

  async function confirmar() {
    if (!filas.length) return;
    const conErrores = filas.filter((fila) => fila.accion === 'error' && (decisiones[fila.numeroLinea] || fila.accion) !== 'omitir');
    if (conErrores.length) { setError(`Hay ${conErrores.length} fila(s) con error. Corrígelas en el archivo u omítelas antes de confirmar.`); return; }
    setCargando(true); setError('');
    try {
      const respuesta = await fetch('/api/admin/cargas-catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'confirmar', tipo, csv, nombreArchivo, decisiones }) });
      const data = await respuesta.json();
      if (!respuesta.ok) throw new Error(data.error || 'No fue posible ejecutar la carga.');
      setExito(`Carga completada: ${data.resumen.creadas} creadas, ${data.resumen.actualizadas} vinculadas/actualizadas y ${data.resumen.omitidas} omitidas.`);
      setFilas([]); setDecisiones({}); setCsv(''); setNombreArchivo('');
    } catch (err) { setError(err instanceof Error ? err.message : 'No fue posible ejecutar la carga.'); }
    finally { setCargando(false); }
  }

  function cambiarTipo(siguiente: TipoCargaCatalogo) {
    setTipo(siguiente); setFilas([]); setDecisiones({}); setCsv(''); setNombreArchivo(''); setError(''); setExito('');
  }

  return (
    <section className="space-y-5">
      <CajaAyuda titulo="Carga masiva de catálogo">
        <p>Esta herramienta la opera exclusivamente el super admin. La plantilla usa nombres y códigos de origen comprensibles; BuscoEdu identifica internamente la universidad, el programa y la oferta antes de guardar cualquier dato.</p>
      </CajaAyuda>

      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Carga masiva</h1>
        <p className="mt-1 text-sm text-buscoedu-muted">Primero carga programas base; después utiliza la carga de ofertas para abrir convocatorias y condiciones comerciales.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(CONFIGURACION) as TipoCargaCatalogo[]).map((opcion) => <button key={opcion} type="button" onClick={() => cambiarTipo(opcion)} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${tipo === opcion ? 'bg-buscoedu-blue text-white' : 'border border-buscoedu-border bg-white text-buscoedu-text'}`}>{CONFIGURACION[opcion].titulo}</button>)}
      </div>

      <article className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
        <h2 className="font-bold text-buscoedu-blue">1. Descarga y diligencia la plantilla de {CONFIGURACION[tipo].titulo.toLowerCase()}</h2>
        <p className="mt-2 text-sm text-buscoedu-muted">{CONFIGURACION[tipo].descripcion}</p>
        <p className="mt-2 text-xs text-buscoedu-muted"><strong>Incluye:</strong> {CONFIGURACION[tipo].campos}</p>
        <button type="button" onClick={() => void descargarPlantilla()} className="mt-4 rounded-lg border border-buscoedu-blue px-4 py-2 text-sm font-semibold text-buscoedu-blue hover:bg-buscoedu-bg">Descargar CSV proforma</button>
      </article>

      <article className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
        <h2 className="font-bold text-buscoedu-blue">2. Carga y revisa antes de guardar</h2>
        <input type="file" accept=".csv,text/csv" onChange={seleccionarArchivo} className="mt-4 block w-full text-sm text-buscoedu-text" />
        {nombreArchivo && <p className="mt-2 text-sm text-buscoedu-muted">Archivo seleccionado: <strong>{nombreArchivo}</strong></p>}
        <button type="button" disabled={!csv || cargando} onClick={() => void previsualizar()} className="mt-4 rounded-lg bg-buscoedu-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{cargando ? 'Validando…' : 'Validar y previsualizar'}</button>
      </article>

      {filas.length > 0 && <article className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-bold text-buscoedu-blue">3. Autoriza cada resultado</h2><p className="mt-1 text-sm text-buscoedu-muted">Puedes conservar la propuesta, omitir una fila o revisar el archivo y volver a cargarlo.</p></div><p className="text-sm text-buscoedu-muted">Crear: {resumen.crear || 0} · Vincular: {resumen.vincular || 0} · Actualizar: {resumen.actualizar || 0} · Omitir: {resumen.omitir || 0} · Error: {resumen.error || 0}</p></div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-buscoedu-border text-xs uppercase tracking-wide text-buscoedu-muted"><tr><th className="px-2 py-3">Línea</th><th className="px-2 py-3">Información del archivo</th><th className="px-2 py-3">Resultado</th><th className="px-2 py-3">Acción</th></tr></thead><tbody>{filas.map((fila) => { const accion = decisiones[fila.numeroLinea] || fila.accion; const nombre = fila.valores.nombre_oficial || fila.valores.nombre_programa || 'Sin nombre'; return <tr key={fila.numeroLinea} className="border-b border-buscoedu-border align-top"><td className="px-2 py-3 text-buscoedu-muted">{fila.numeroLinea}</td><td className="px-2 py-3"><p className="font-medium text-buscoedu-text">{nombre}</p><p className="text-xs text-buscoedu-muted">{fila.valores.universidad} · {fila.valores.codigo_snies || fila.valores.codigo_programa_origen || 'Sin código'}</p></td><td className="px-2 py-3"><p className="font-medium text-buscoedu-blue">{fila.coincidencia || (fila.accion === 'crear' ? 'Nuevo registro' : 'Requiere revisión')}</p><p className="mt-1 max-w-md text-xs text-buscoedu-muted">{fila.mensajes.join(' ')}</p></td><td className="px-2 py-3"><select value={accion} onChange={(event) => setDecisiones((prev) => ({ ...prev, [fila.numeroLinea]: event.target.value as AccionCarga }))} className="rounded-md border border-buscoedu-border bg-white px-2 py-1.5 text-xs"><option value="crear">Registrar nuevo</option><option value="vincular">Usar existente</option>{tipo === 'ofertas' && <option value="actualizar">Actualizar oferta</option>}<option value="omitir">Omitir</option>{fila.accion === 'error' && <option value="error">Corregir archivo</option>}</select></td></tr>; })}</tbody></table></div>
        <button type="button" disabled={cargando} onClick={() => void confirmar()} className="mt-5 rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{cargando ? 'Procesando…' : 'Confirmar carga autorizada'}</button>
      </article>}
      <ErrorToast message={error} onClose={() => setError('')} />
      <SuccessToast message={exito} onClose={() => setExito('')} />
    </section>
  );
}
