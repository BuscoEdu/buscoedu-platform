import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { duplicarVersion } from '@/lib/admin-ia/servicioAgentes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-037 B-3 — Duplicar una versión como borrador nuevo.
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: B4.
 */
export const POST = rutaAdminIa(duplicarVersion);
