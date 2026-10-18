import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { encenderModelo } from '@/lib/admin-ia/servicioModelos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-037 M5 — Encender el modelo si su prueba está vigente (transaccional vía N4).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: A7.
 */
export const POST = rutaAdminIa(encenderModelo);
