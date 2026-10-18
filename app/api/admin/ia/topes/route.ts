import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { listarTopes } from '@/lib/admin-ia/servicioTopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-038 T1 — Estado de gasto de hoy por canal.
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: D5, D8.
 */
export const GET = rutaAdminIa(listarTopes);
