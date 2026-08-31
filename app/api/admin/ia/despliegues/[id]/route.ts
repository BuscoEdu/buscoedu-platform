import { crearHandlersElemento } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Despliegues de proveedores de IA.
 * Solo se almacenan REFERENCIAS a variables de entorno (nombres), nunca valores.
 */
const COLUMNAS =
  'id, proveedor_id, nombre, identificador_externo, modelo, ambiente, configuracion_tecnica, referencia_secreto, estado, activo, creado_en, actualizado_en, proveedores_ia:proveedor_id(codigo, nombre)';

const handlers = crearHandlersElemento({
  tabla: 'despliegues_ia',
  columnasSelect: COLUMNAS,
  campos: [
    { nombre: 'nombre', tipo: 'texto' },
    { nombre: 'identificador_externo', tipo: 'texto' },
    { nombre: 'modelo', tipo: 'texto' },
    { nombre: 'ambiente', tipo: 'texto' },
    { nombre: 'configuracion_tecnica', tipo: 'json' },
    { nombre: 'referencia_secreto', tipo: 'texto' },
    { nombre: 'estado', tipo: 'texto' }
  ]
});

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
