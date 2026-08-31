import { crearHandlersElemento } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, codigo, nombre, tipo_proveedor, descripcion, capacidades, estado, activo, creado_en, actualizado_en';

const handlers = crearHandlersElemento({
  tabla: 'proveedores_ia',
  columnasSelect: COLUMNAS,
  campos: [
    { nombre: 'nombre', tipo: 'texto' },
    { nombre: 'tipo_proveedor', tipo: 'texto' },
    { nombre: 'descripcion', tipo: 'texto' },
    { nombre: 'capacidades', tipo: 'json' },
    { nombre: 'estado', tipo: 'texto' }
  ]
});

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
