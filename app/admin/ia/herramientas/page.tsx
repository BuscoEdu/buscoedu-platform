'use client';

import PaginaCatalogo from '@/components/admin/ia/PaginaCatalogo';
import CajaAyuda from '@/components/admin/CajaAyuda';

export default function HerramientasPage() {
  return (
    <>
      <CajaAyuda titulo="¿Qué son las herramientas?">
        <p>
          Las herramientas son las acciones que el agente puede ejecutar.
          Por ejemplo: &quot;buscar ofertas&quot;, &quot;actualizar el perfil del
          usuario&quot; o &quot;escalar a un humano&quot;. Las herramientas que
          requieren consentimiento no se pueden ejecutar sin que el usuario lo
          autorice primero.
        </p>
      </CajaAyuda>
      <PaginaCatalogo
      titulo="Herramientas"
      descripcion="Herramientas y acciones que los agentes pueden ejecutar."
      endpoint="/api/admin/ia/herramientas"
      textoNuevo="Nueva herramienta"
      columnas={[
        { clave: 'nombre', etiqueta: 'Nombre' },
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'tipo_operacion', etiqueta: 'Operación' },
        {
          clave: 'requiere_confirmacion',
          etiqueta: 'Confirmación',
          render: (f) => (f.requiere_confirmacion ? 'Sí' : 'No')
        }
      ]}
      campos={[
        { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true },
        { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
        { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea' },
        { clave: 'tipo_operacion', etiqueta: 'Tipo de operación', tipo: 'texto' },
        { clave: 'requiere_confirmacion', etiqueta: 'Requiere confirmación', tipo: 'checkbox' },
        { clave: 'requiere_consentimiento', etiqueta: 'Requiere consentimiento', tipo: 'checkbox' }
      ]}
      />
    </>
  );
}
