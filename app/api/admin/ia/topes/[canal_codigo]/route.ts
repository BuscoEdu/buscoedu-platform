import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { guardarTope, verTope } from '@/lib/admin-ia/servicioTopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-038 T2/T3 — Detalle con bitácora y guardar tope/umbral (máx. USD 1000/día).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: D1, D3, D4, D7.
 */
export const GET = rutaAdminIa(verTope);
export const PUT = rutaAdminIa(guardarTope);
