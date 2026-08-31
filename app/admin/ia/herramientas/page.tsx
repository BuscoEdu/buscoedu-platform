'use client';

import PaginaCatalogo from '@/components/admin/ia/PaginaCatalogo';

export default function HerramientasPage() {
  return (
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
  );
}
