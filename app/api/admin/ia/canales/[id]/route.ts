import { crearHandlersElemento } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS = 'id, codigo, nombre, tipo, descripcion, activo, creado_en';

const handlers = crearHandlersElemento({
  tabla: 'canales_ia',
  columnasSelect: COLUMNAS,
  campos: [
    { nombre: 'nombre', tipo: 'texto' },
    { nombre: 'tipo', tipo: 'texto' },
    { nombre: 'descripcion', tipo: 'texto' }
  ]
});

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
