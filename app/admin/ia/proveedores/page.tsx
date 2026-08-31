'use client';

import PaginaCatalogo from '@/components/admin/ia/PaginaCatalogo';
import CajaAyuda from '@/components/admin/CajaAyuda';

export default function ProveedoresPage() {
  return (
    <>
      <CajaAyuda titulo="¿Qué son los proveedores?" variante="amarillo">
        <p>
          Un proveedor es la empresa de inteligencia artificial que le da el
          &quot;cerebro&quot; al agente. Actualmente usamos Abacus.AI. En el futuro
          podríamos agregar OpenAI u otros. Aquí puedes ver qué proveedores están
          configurados y cuáles deployments (conexiones) están activos.
        </p>
        <p className="font-semibold">
          ⚠️ No modifiques estos valores a menos que sepas exactamente qué estás
          haciendo.
        </p>
      </CajaAyuda>
      <PaginaCatalogo
      titulo="Proveedores de IA"
      descripcion="Proveedores externos de modelos de IA (por ejemplo, Abacus.AI)."
      endpoint="/api/admin/ia/proveedores"
      textoNuevo="Nuevo proveedor"
      columnas={[
        { clave: 'nombre', etiqueta: 'Nombre' },
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'tipo_proveedor', etiqueta: 'Tipo' }
      ]}
      campos={[
        { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true },
        { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
        { clave: 'tipo_proveedor', etiqueta: 'Tipo de proveedor', tipo: 'texto' },
        { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea' },
        {
          clave: 'capacidades',
          etiqueta: 'Capacidades (JSON)',
          tipo: 'json',
          ayuda: 'Objeto JSON con las capacidades del proveedor.'
        },
        { clave: 'estado', etiqueta: 'Estado', tipo: 'texto' }
      ]}
      />
    </>
  );
}
