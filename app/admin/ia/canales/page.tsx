'use client';

import PaginaCatalogo from '@/components/admin/ia/PaginaCatalogo';

export default function CanalesPage() {
  return (
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
  );
}
