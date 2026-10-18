import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { archivarModelo, editarModelo, verModelo } from '@/lib/admin-ia/servicioModelos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-037 M3/archivar — Ver, editar campos permitidos y archivar (DELETE lógico, exige apagado).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: que un modelo en uso no cambie por debajo de los agentes.
 */
export const GET = rutaAdminIa(verModelo);
export const PATCH = rutaAdminIa(editarModelo);
export const DELETE = rutaAdminIa(archivarModelo);
