import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { restaurarVersion } from '@/lib/admin-ia/servicioAgentes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-037 B-6 — Volver a una versión anterior (transaccional vía N5).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: B4 «Volver a esta versión».
 */
export const POST = rutaAdminIa(restaurarVersion);
