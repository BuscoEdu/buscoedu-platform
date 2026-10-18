import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { crearProveedor, listarProveedores } from '@/lib/admin-ia/servicioProveedores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-036 P2/P3 — Lista de proveedores con estado, clave (sin valor) y uso; crear desde un preset.
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: reemplazar el CRUD genérico por el asistente de 5 pasos.
 */
export const GET = rutaAdminIa(listarProveedores);
export const POST = rutaAdminIa(crearProveedor);
