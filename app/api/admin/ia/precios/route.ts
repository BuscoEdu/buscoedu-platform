import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { crearPrecio, listarPrecios } from '@/lib/admin-ia/servicioModelos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-037/038 M8 — Historial de precios por proveedor y alta de una versión nueva.
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: que el costo de cada llamada use un precio versionado (D8).
 */
export const GET = rutaAdminIa(listarPrecios);
export const POST = rutaAdminIa(crearPrecio);
