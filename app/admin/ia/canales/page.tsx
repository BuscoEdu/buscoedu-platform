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
          El canal &quot;Web&quot; es el único activo actualmente.
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
        { clave: 'tipo', etiqueta: 'Tipo' }
      ]}
      campos={[
        { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true },
        { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
        { clave: 'tipo', etiqueta: 'Tipo', tipo: 'texto' },
        { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea' }
      ]}
      />
    </>
  );
}
