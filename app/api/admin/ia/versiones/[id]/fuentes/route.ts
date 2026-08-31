import { crearHandlersAsociacion } from '@/lib/agentes/asociaciones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = crearHandlersAsociacion({
  tabla: 'agente_fuentes_contexto',
  columnasSelect:
    'id, version_agente_id, fuente_contexto_id, prioridad, modo_acceso, activo, fuentes_contexto_ia:fuente_contexto_id(codigo, nombre, tipo_fuente)',
  ordenarPor: { columna: 'prioridad', ascendente: true },
  campos: [
    { nombre: 'fuente_contexto_id', obligatorio: true, tipo: 'texto' },
    { nombre: 'prioridad', tipo: 'entero' },
    { nombre: 'modo_acceso', tipo: 'texto' },
    { nombre: 'activo', tipo: 'booleano' }
  ]
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
