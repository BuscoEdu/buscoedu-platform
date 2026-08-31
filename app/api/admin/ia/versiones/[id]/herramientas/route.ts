import { crearHandlersAsociacion } from '@/lib/agentes/asociaciones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = crearHandlersAsociacion({
  tabla: 'agente_herramientas',
  columnasSelect:
    'id, version_agente_id, herramienta_id, habilitada, requiere_aprobacion_humana, activo, herramientas_ia:herramienta_id(codigo, nombre, tipo_operacion)',
  campos: [
    { nombre: 'herramienta_id', obligatorio: true, tipo: 'texto' },
    { nombre: 'habilitada', tipo: 'booleano' },
    { nombre: 'requiere_aprobacion_humana', tipo: 'booleano' },
    { nombre: 'canales_permitidos', tipo: 'json' },
    { nombre: 'activo', tipo: 'booleano' }
  ]
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
