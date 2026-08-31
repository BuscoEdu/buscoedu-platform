'use client';

import PaginaCatalogo from '@/components/admin/ia/PaginaCatalogo';
import CajaAyuda from '@/components/admin/CajaAyuda';

export default function FuentesPage() {
  return (
    <>
      <CajaAyuda titulo="¿Qué son las fuentes de contexto?">
        <p>
          Las fuentes son las tablas de la base de datos que el agente puede
          consultar. Por ejemplo, &quot;ofertas_publicadas&quot; le permite a NaIA
          saber qué programas están disponibles. El agente SOLO puede ver datos de
          las fuentes que tengan estado &quot;activo&quot;.
        </p>
      </CajaAyuda>
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
    </>
  );
}
