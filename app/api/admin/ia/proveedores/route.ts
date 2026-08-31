import { crearHandlersColeccion } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = crearHandlersColeccion({
  tabla: 'proveedores_ia',
  columnasSelect:
    'id, codigo, nombre, tipo_proveedor, descripcion, capacidades, estado, activo, creado_en, actualizado_en',
  ordenarPor: { columna: 'creado_en', ascendente: false },
  campos: [
    { nombre: 'codigo', obligatorio: true, tipo: 'texto' },
    { nombre: 'nombre', obligatorio: true, tipo: 'texto' },
    { nombre: 'tipo_proveedor', tipo: 'texto' },
    { nombre: 'descripcion', tipo: 'texto' },
    { nombre: 'capacidades', tipo: 'json' },
    { nombre: 'estado', tipo: 'texto' }
  ]
});

export const GET = handlers.GET;
export const POST = handlers.POST;
