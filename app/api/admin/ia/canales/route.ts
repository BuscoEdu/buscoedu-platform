import { crearHandlersColeccion } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = crearHandlersColeccion({
  tabla: 'canales_ia',
  columnasSelect: 'id, codigo, nombre, tipo, descripcion, activo, creado_en',
  ordenarPor: { columna: 'creado_en', ascendente: true },
  campos: [
    { nombre: 'codigo', obligatorio: true, tipo: 'texto' },
    { nombre: 'nombre', obligatorio: true, tipo: 'texto' },
    { nombre: 'tipo', tipo: 'texto' },
    { nombre: 'descripcion', tipo: 'texto' }
  ]
});

export const GET = handlers.GET;
export const POST = handlers.POST;
