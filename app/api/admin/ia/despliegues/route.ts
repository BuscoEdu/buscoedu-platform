import { crearHandlersColeccion } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Despliegues de proveedores de IA.
 * Solo se almacenan REFERENCIAS a variables de entorno (nombres), nunca valores.
 */
const handlers = crearHandlersColeccion({
  tabla: 'despliegues_ia',
  columnasSelect:
    'id, proveedor_id, nombre, identificador_externo, modelo, ambiente, configuracion_tecnica, referencia_secreto, estado, activo, creado_en, actualizado_en, proveedores_ia:proveedor_id(codigo, nombre)',
  ordenarPor: { columna: 'creado_en', ascendente: false },
  campos: [
    { nombre: 'proveedor_id', obligatorio: true, tipo: 'texto' },
    { nombre: 'nombre', obligatorio: true, tipo: 'texto' },
    { nombre: 'identificador_externo', tipo: 'texto' },
    { nombre: 'modelo', tipo: 'texto' },
    { nombre: 'ambiente', tipo: 'texto' },
    { nombre: 'configuracion_tecnica', tipo: 'json' },
    { nombre: 'referencia_secreto', tipo: 'texto' },
    { nombre: 'estado', tipo: 'texto' }
  ]
});

export const GET = handlers.GET;
export const POST = handlers.POST;
