import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { archivarProveedor, editarProveedor, verProveedor } from '@/lib/admin-ia/servicioProveedores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-036 P4/P5/archivar — Ver (bitácora y asistente), editar campos permitidos y archivar (DELETE lógico, exige apagado).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: que solo se cambie lo seguro y quede trazado.
 */
export const GET = rutaAdminIa(verProveedor);
export const PATCH = rutaAdminIa(editarProveedor);
export const DELETE = rutaAdminIa(archivarProveedor);
