'use client';

import PaginaCatalogo from '@/components/admin/ia/PaginaCatalogo';
import CajaAyuda from '@/components/admin/CajaAyuda';

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
        { clave: 'nombre', etiqueta: 'Nombre' },
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'tipo', etiqueta: 'Tipo' },
        { clave: 'agentes_ia', etiqueta: 'Agente asignado', render: (fila) => fila.agentes_ia?.nombre || 'Sin asignar' }
      ]}
      campos={[
        { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true },
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
