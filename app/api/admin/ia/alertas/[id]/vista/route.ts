import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { marcarAlertaVista } from '@/lib/admin-ia/servicioTopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-038 T6 — Marcar una alerta como vista (idempotente, N7).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: D5.
 */
export const POST = rutaAdminIa(marcarAlertaVista);
