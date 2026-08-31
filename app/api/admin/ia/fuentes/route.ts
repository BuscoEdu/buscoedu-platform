import { crearHandlersColeccion } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = crearHandlersColeccion({
  tabla: 'fuentes_contexto_ia',
  columnasSelect:
    'id, codigo, nombre, tipo_fuente, entidad_origen, configuracion_consulta, reglas_filtro, estado, activo, creado_en',
  ordenarPor: { columna: 'creado_en', ascendente: true },
  campos: [
    { nombre: 'codigo', obligatorio: true, tipo: 'texto' },
    { nombre: 'nombre', obligatorio: true, tipo: 'texto' },
    { nombre: 'tipo_fuente', tipo: 'texto' },
    { nombre: 'entidad_origen', tipo: 'texto' },
    { nombre: 'configuracion_consulta', tipo: 'json' },
    { nombre: 'reglas_filtro', tipo: 'texto' },
    { nombre: 'estado', tipo: 'texto' }
  ]
});

export const GET = handlers.GET;
export const POST = handlers.POST;
