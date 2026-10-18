import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { consumo } from '@/lib/admin-ia/servicioTopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-038 T4 — Consumo del día por modelo.
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: D8.
 */
export const GET = rutaAdminIa(consumo);
