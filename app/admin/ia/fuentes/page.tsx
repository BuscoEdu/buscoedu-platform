'use client';

import PaginaCatalogo from '@/components/admin/ia/PaginaCatalogo';

export default function FuentesPage() {
  return (
    <PaginaCatalogo
      titulo="Fuentes de contexto"
      descripcion="Fuentes de datos que alimentan el contexto dinámico de los agentes."
      endpoint="/api/admin/ia/fuentes"
      textoNuevo="Nueva fuente"
      columnas={[
        { clave: 'nombre', etiqueta: 'Nombre' },
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'tipo_fuente', etiqueta: 'Tipo' },
        { clave: 'entidad_origen', etiqueta: 'Entidad origen' }
      ]}
      campos={[
        { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true },
        { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
        { clave: 'tipo_fuente', etiqueta: 'Tipo de fuente', tipo: 'texto' },
        { clave: 'entidad_origen', etiqueta: 'Entidad origen', tipo: 'texto' },
        {
          clave: 'configuracion_consulta',
          etiqueta: 'Configuración de consulta (JSON)',
          tipo: 'json',
          ayuda: 'Objeto JSON con la configuración de la consulta.'
        },
        { clave: 'reglas_filtro', etiqueta: 'Reglas de filtro', tipo: 'textarea' },
        { clave: 'estado', etiqueta: 'Estado', tipo: 'texto' }
      ]}
    />
  );
}
