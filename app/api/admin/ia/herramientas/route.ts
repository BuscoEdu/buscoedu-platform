import { crearHandlersColeccion } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = crearHandlersColeccion({
  tabla: 'herramientas_ia',
  columnasSelect:
    'id, codigo, nombre, descripcion, tipo_operacion, requiere_confirmacion, requiere_consentimiento, activo, creado_en',
  ordenarPor: { columna: 'creado_en', ascendente: true },
  campos: [
    { nombre: 'codigo', obligatorio: true, tipo: 'texto' },
    { nombre: 'nombre', obligatorio: true, tipo: 'texto' },
    { nombre: 'descripcion', tipo: 'texto' },
    { nombre: 'tipo_operacion', tipo: 'texto' },
    { nombre: 'requiere_confirmacion', tipo: 'booleano' },
    { nombre: 'requiere_consentimiento', tipo: 'booleano' }
  ]
});

export const GET = handlers.GET;
export const POST = handlers.POST;
