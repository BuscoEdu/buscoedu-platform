import { crearHandlersAsociacion } from '@/lib/agentes/asociaciones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = crearHandlersAsociacion({
  tabla: 'configuraciones_agente_canal',
  columnasSelect:
    'id, version_agente_id, canal_id, nombre_publico, tono, longitud_maxima_respuesta, reglas_especificas, plantilla_respuesta, requiere_consentimiento, activo, canales_ia:canal_id(codigo, nombre, tipo)',
  campos: [
    { nombre: 'canal_id', obligatorio: true, tipo: 'texto' },
    { nombre: 'nombre_publico', tipo: 'texto' },
    { nombre: 'tono', tipo: 'texto' },
    { nombre: 'longitud_maxima_respuesta', tipo: 'entero' },
    { nombre: 'reglas_especificas', tipo: 'texto' },
    { nombre: 'plantilla_respuesta', tipo: 'texto' },
    { nombre: 'requiere_consentimiento', tipo: 'booleano' },
    { nombre: 'activo', tipo: 'booleano' }
  ]
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
