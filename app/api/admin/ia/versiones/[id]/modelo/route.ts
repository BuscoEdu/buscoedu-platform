import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { asignarModelo } from '@/lib/admin-ia/servicioAgentes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-037 B-2 — Asignar modelo principal y respaldos a una versión borrador.
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: B1, B2, B4.
 */
export const PUT = rutaAdminIa(asignarModelo);
