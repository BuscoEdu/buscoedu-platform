'use client';

import { useState } from 'react';

export default function PersonEditor({ persona }: { persona: any }) {
  const [editando, setEditando] = useState(false);
  const [datos, setDatos] = useState(persona);
  const [estado, setEstado] = useState('');
  const guardar = async () => {
    setEstado('Guardando…');
    const res = await fetch(`/api/leadcenter/personas/${datos.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
    const json = await res.json();
    if (!res.ok || !json.ok) { setEstado(json.error || 'No fue posible guardar.'); return; }
    setDatos(json.persona); setEditando(false); setEstado('Datos actualizados.');
  };
  const campo = (key: string, label: string, type = 'text') => <label className="grid gap-1 text-sm text-gray-600"><span>{label}</span><input type={type} value={datos[key] || ''} onChange={(e) => setDatos({ ...datos, [key]: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-gray-900" /></label>;
  return <div className="rounded-2xl border border-gray-200 bg-white p-4">
    <div className="flex items-center justify-between gap-3"><h1 className="text-xl font-bold text-gray-900">{[datos.nombres, datos.apellidos].filter(Boolean).join(' ') || 'Persona'}</h1><button type="button" onClick={() => setEditando(!editando)} className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-700">{editando ? 'Cancelar' : 'Editar datos'}</button></div>
    {editando ? <><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{campo('nombres', 'Nombres')}{campo('apellidos', 'Apellidos')}{campo('correo_principal', 'Correo', 'email')}{campo('telefono_principal', 'Teléfono')}{campo('whatsapp', 'WhatsApp')}</div><button type="button" onClick={() => void guardar()} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Guardar cambios</button></> : <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2"><span>Correo: {datos.correo_principal || '—'}</span><span>Celular: {datos.celular_e164 || datos.telefono_principal || '—'}</span><span>WhatsApp: {datos.whatsapp || '—'}</span><span>Teléfono verificado: {datos.telefono_verificado ? 'Sí' : 'No'}</span><span>Método verificación: {datos.metodo_verificacion || '—'}</span><span>Estado relación: {datos.estado_relacion || '—'}</span><span>Canal origen: {datos.canal_origen || '—'}</span></div>}
    {estado && <p className="mt-3 text-sm text-gray-600">{estado}</p>}
  </div>;
}
