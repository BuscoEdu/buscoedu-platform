import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { probarModelo } from '@/lib/admin-ia/servicioModelos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-037 M4 — Probar conexión con mensaje fijo (máx. 6/min; canal panel, fuera del tope).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: A6.
 */
export const POST = rutaAdminIa(probarModelo);
