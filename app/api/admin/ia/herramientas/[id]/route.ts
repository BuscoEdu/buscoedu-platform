import { crearHandlersElemento } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, codigo, nombre, descripcion, tipo_operacion, requiere_confirmacion, requiere_consentimiento, activo, creado_en';

const handlers = crearHandlersElemento({
  tabla: 'herramientas_ia',
  columnasSelect: COLUMNAS,
  campos: [
    { nombre: 'nombre', tipo: 'texto' },
    { nombre: 'descripcion', tipo: 'texto' },
    { nombre: 'tipo_operacion', tipo: 'texto' },
    { nombre: 'requiere_confirmacion', tipo: 'booleano' },
    { nombre: 'requiere_consentimiento', tipo: 'booleano' }
  ]
});

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
