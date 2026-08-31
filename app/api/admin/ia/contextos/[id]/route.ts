import { crearHandlersElemento } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, codigo, nombre, tipo_contexto, contenido, prioridad, es_obligatorio, version, estado, activo, creado_en, actualizado_en';

const handlers = crearHandlersElemento({
  tabla: 'componentes_contexto_ia',
  columnasSelect: COLUMNAS,
  campos: [
    { nombre: 'nombre', tipo: 'texto' },
    { nombre: 'tipo_contexto', tipo: 'texto' },
    { nombre: 'contenido', tipo: 'texto' },
    { nombre: 'prioridad', tipo: 'entero' },
    { nombre: 'es_obligatorio', tipo: 'booleano' },
    { nombre: 'version', tipo: 'texto' },
    { nombre: 'estado', tipo: 'texto' }
  ]
});

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
