import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { listarAlertas } from '@/lib/admin-ia/servicioTopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-038 T5 — Alertas de umbral, corte y sin costo.
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: D5, D6.
 */
export const GET = rutaAdminIa(listarAlertas);
