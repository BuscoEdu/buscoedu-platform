import { crearHandlersAsociacion } from '@/lib/agentes/asociaciones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = crearHandlersAsociacion({
  tabla: 'versiones_agente_contextos',
  columnasSelect:
    'id, version_agente_id, componente_contexto_id, orden, rol_contexto, activo, componentes_contexto_ia:componente_contexto_id(codigo, nombre, tipo_contexto)',
  ordenarPor: { columna: 'orden', ascendente: true },
  campos: [
    { nombre: 'componente_contexto_id', obligatorio: true, tipo: 'texto' },
    { nombre: 'orden', tipo: 'entero' },
    { nombre: 'rol_contexto', tipo: 'texto' },
    { nombre: 'activo', tipo: 'booleano' }
  ]
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
