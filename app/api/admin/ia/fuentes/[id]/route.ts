import { crearHandlersElemento } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, codigo, nombre, tipo_fuente, entidad_origen, configuracion_consulta, reglas_filtro, estado, activo, creado_en';

const handlers = crearHandlersElemento({
  tabla: 'fuentes_contexto_ia',
  columnasSelect: COLUMNAS,
  campos: [
    { nombre: 'nombre', tipo: 'texto' },
    { nombre: 'tipo_fuente', tipo: 'texto' },
    { nombre: 'entidad_origen', tipo: 'texto' },
    { nombre: 'configuracion_consulta', tipo: 'json' },
    { nombre: 'reglas_filtro', tipo: 'texto' },
    { nombre: 'estado', tipo: 'texto' }
  ]
});

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
