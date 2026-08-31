import { crearHandlersColeccion } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, codigo, nombre, tipo_contexto, contenido, prioridad, es_obligatorio, version, estado, activo, creado_en, actualizado_en';

const handlers = crearHandlersColeccion({
  tabla: 'componentes_contexto_ia',
  columnasSelect: COLUMNAS,
  ordenarPor: { columna: 'prioridad', ascendente: true },
  campos: [
    { nombre: 'codigo', obligatorio: true, tipo: 'texto' },
    { nombre: 'nombre', obligatorio: true, tipo: 'texto' },
    { nombre: 'tipo_contexto', obligatorio: true, tipo: 'texto' },
    { nombre: 'contenido', obligatorio: true, tipo: 'texto' },
    { nombre: 'prioridad', tipo: 'entero' },
    { nombre: 'es_obligatorio', tipo: 'booleano' },
    { nombre: 'version', tipo: 'texto' },
    { nombre: 'estado', tipo: 'texto' }
  ]
});

export const GET = handlers.GET;
export const POST = handlers.POST;
