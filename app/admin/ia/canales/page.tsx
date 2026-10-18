'use client';

import PaginaCatalogo from '@/components/admin/ia/PaginaCatalogo';
import CajaAyuda from '@/components/admin/CajaAyuda';
import { etiquetaCanal, etiquetaTipoCanal } from '@/src/lib/admin-ia/etiquetas';

export default function CanalesPage() {
  return (
    <>
      <CajaAyuda titulo="¿Qué son los canales?">
        <p>
          Un canal es el medio por donde el agente habla con los usuarios.
          Web = el chat en buscoedu.com. WhatsApp = mensajes de WhatsApp.
          Llamada = llamadas telefónicas. Puedes activar o desactivar canales aquí.
          En cada canal define también qué agente publicado lo atiende; esa asignación controla el chat público.
        </p>
      </CajaAyuda>
      <PaginaCatalogo
      titulo="Canales"
      descripcion="Canales por los que los agentes atienden a los usuarios (web, WhatsApp, etc.)."
      endpoint="/api/admin/ia/canales"
      textoNuevo="Nuevo canal"
      columnas={[
        // Nombre legible del canal (whatsapp → WhatsApp); si falta, se deriva del identificador.
        { clave: 'nombre', etiqueta: 'Nombre', render: (fila) => etiquetaCanal(fila.nombre || fila.codigo) },
        { clave: 'tipo', etiqueta: 'Tipo', render: (fila) => (fila.tipo ? etiquetaTipoCanal(fila.tipo) : '—') },
        { clave: 'agentes_ia', etiqueta: 'Agente asignado', render: (fila) => fila.agentes_ia?.nombre || 'Sin asignar' }
      ]}
      campos={[
        { clave: 'codigo', etiqueta: 'Identificador interno', tipo: 'texto', requerido: true, ayuda: 'Minúsculas y guion bajo, sin espacios. Es interno: no se muestra al público.' },
        { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
        { clave: 'tipo', etiqueta: 'Tipo', tipo: 'texto' },
        { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea' },
        {
          clave: 'agente_predeterminado_id',
          etiqueta: 'Agente que atiende este canal',
          tipo: 'select',
          ayuda: 'El chat público usa esta asignación. El agente debe tener una versión publicada y configurada para este canal.',
          opcionesRemotas: { endpoint: '/api/admin/ia/agentes', valor: 'id', etiqueta: 'nombre' }
        }
      ]}
      />
    </>
  );
}
